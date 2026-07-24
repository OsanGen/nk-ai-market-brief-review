import test from "node:test";
import assert from "node:assert/strict";

import { blocksPrivateRouting, budgetPreflight, estimateBatchCost, getPrivacyReceipt } from "../src/ai/budget.mjs";
import { laneReadiness, runAiLane } from "../src/ai/lane.mjs";
import {
  EVIDENCE_CLOSE,
  EVIDENCE_OPEN,
  buildBatchRequests,
  buildPublicPackets,
  validateModelOutput
} from "../src/ai/packets.mjs";
import { ANTHROPIC_MESSAGES_URL, buildSynthesisRequest, buildSynthesisItems, parseSynthesis } from "../src/ai/synthesize.mjs";

const story = {
  id: "abc123",
  title: "AI stylist launches",
  summary: "A voice shopping agent for fashion.",
  sourceOutlet: "Outlet",
  topicCluster: "AI stylists / personal-shopper agents",
  publishedAt: "2026-07-24T04:00:00.000Z",
  url: "https://example.com/private?token=x",
  score: 99,
  matchSignals: { secretish: true }
};

test("packets are a strict public allowlist: no url, score, or signals enter the prompt", () => {
  const [packet] = buildPublicPackets([story]);
  assert.deepEqual(Object.keys(packet.story).sort(), [
    "outlet", "published_at", "story_id", "summary", "title", "topic_cluster"
  ]);
  const [request] = buildBatchRequests([packet], { model: "claude-opus-4-8" });
  const prompt = request.params.messages[0].content;
  assert.doesNotMatch(prompt, /example\.com|token=|"score"|matchSignals|secretish/);
  assert.match(prompt, new RegExp(EVIDENCE_OPEN));
  assert.match(prompt, new RegExp(EVIDENCE_CLOSE));
  assert.match(prompt, /data, not instructions/);
});

test("batch requests bind the registry primary model and a JSON schema output format", () => {
  const packets = buildPublicPackets([story]);
  const [request] = buildBatchRequests(packets, { model: "claude-opus-4-8", allowedCapabilityIds: ["voice_commerce"] });
  assert.equal(request.params.model, "claude-opus-4-8");
  assert.equal(request.params.output_config.format.type, "json_schema");
  assert.equal(request.custom_id, "pkt_abc123");
});

test("model output validation fails closed on unknown ids, URLs, and extra fields", () => {
  const context = { allowedStoryIds: new Set(["abc123"]), allowedCapabilityIds: ["voice_commerce"] };
  const good = {
    story_id: "abc123",
    relevance: "high",
    capability_ids: ["voice_commerce"],
    summary_sentences: ["A voice agent launched."],
    open_questions: [],
    vendor_claim_flags: []
  };
  assert.deepEqual(validateModelOutput(good, context), good);
  assert.throws(() => validateModelOutput({ ...good, story_id: "spoofed" }, context), /unknown_story_id/);
  assert.throws(() => validateModelOutput({ ...good, summary_sentences: ["see https://x.com"] }, context), /contains_url/);
  assert.throws(() => validateModelOutput({ ...good, disposition: "ship_it" }, context), /unexpected_field/);
  assert.throws(() => validateModelOutput({ ...good, capability_ids: ["not_allowed"] }, context), /invalid_capability_ids/);
});

test("budget preflight estimates deterministically and blocks over-cap", () => {
  const model = { batch_input_price_per_million_usd: 2.5, batch_output_price_per_million_usd: 12.5 };
  const requests = buildBatchRequests(buildPublicPackets([story]), { model: "claude-opus-4-8" });
  const estimate = estimateBatchCost(requests, model);
  assert.ok(estimate.estimatedUsd > 0 && estimate.estimatedUsd < 0.1);

  const ok = budgetPreflight({ estimate, capUsd: 8, runId: "r1" });
  assert.equal(ok.decision, "proceed");
  const blocked = budgetPreflight({ estimate: { ...estimate, estimatedUsd: 9 }, capUsd: 8, runId: "r1" });
  assert.equal(blocked.decision, "blocked_over_cap");
});

test("privacy receipt is unverified and blocks private routing until a real ZDR verification", () => {
  const receipt = getPrivacyReceipt();
  assert.equal(receipt.zdr_verified, false);
  assert.equal(blocksPrivateRouting(receipt), true);
  assert.equal(blocksPrivateRouting({ zdr_verified: true }), false);
});

test("lane readiness: pending key by default, flag-gated even with a key", () => {
  assert.equal(laneReadiness({}), "ready_pending_key");
  assert.equal(laneReadiness({ NEWSLETTER_AI_LANE_ENABLED: "true" }), "ready_pending_key");
  assert.equal(laneReadiness({ ANTHROPIC_API_KEY: "k" }), "disabled_by_flag");
  assert.equal(laneReadiness({ ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" }), "active");
});

test("without a key the lane dry-runs: real packets and budget, zero network calls", async () => {
  let fetched = false;
  const result = await runAiLane({
    stories: [story],
    env: {},
    runId: "run-1",
    capabilityIds: ["voice_commerce"],
    fetchImpl: async () => {
      fetched = true;
      throw new Error("must not fetch in dry run");
    }
  });
  assert.equal(fetched, false);
  assert.equal(result.mode, "dry_run");
  assert.equal(result.summary.status, "ready_pending_key");
  assert.equal(result.summary.model, "claude-opus-4-8");
  assert.equal(result.summary.packetCount, 1);
  assert.equal(result.summary.withinBudgetCap, true);
  assert.equal(result.summary.privateRoutingBlocked, true);
});

function anthropicResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        usage: { input_tokens: 900, output_tokens: 250 }
      };
    }
  };
}

test("with key + flag the lane synthesizes via the sync Messages API and never leaks the key", async () => {
  const calls = [];
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "unit-test-placeholder-key", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-2",
    capabilityIds: ["voice_commerce"],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return anthropicResponse([
        { story_id: "abc123", summary: "A voice agent launched for fashion retail.", why_it_matters: "It competes with NK's conversational stylist.", relevance: "high" }
      ]);
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ANTHROPIC_MESSAGES_URL);
  assert.equal(calls[0].options.headers["x-api-key"], "unit-test-placeholder-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "claude-opus-4-8");
  assert.match(body.messages[0].content, new RegExp(EVIDENCE_OPEN));
  assert.equal(result.mode, "synthesized");
  assert.equal(result.summary.status, "synthesized");
  assert.equal(result.summary.synthesizedCount, 1);
  assert.equal(result.overrides[0].summary, "A voice agent launched for fashion retail.");
  assert.doesNotMatch(JSON.stringify(result.summary), /unit-test-placeholder-key/);
  assert.doesNotMatch(JSON.stringify(result.budget), /unit-test-placeholder-key/);
});

test("a provider error surfaces as submit_failed without throwing", async () => {
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-3",
    capabilityIds: [],
    fetchImpl: async () => ({ ok: false, status: 429, async json() { return {}; } })
  });
  assert.equal(result.mode, "submit_failed");
  assert.equal(result.summary.providerStatus, 429);
});

test("garbage model output degrades to synthesis_invalid, keeping template copy", async () => {
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-4",
    capabilityIds: [],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return { content: [{ type: "text", text: "I cannot help with that." }] }; }
    })
  });
  assert.equal(result.mode, "synthesis_invalid");
  assert.equal(result.summary.reasonCode, "synthesis_unparseable");
});

test("parseSynthesis drops spoofed ids, URLs, and empty fields; strips code fences", () => {
  const allowed = { allowedStoryIds: new Set(["abc123"]) };
  const data = {
    content: [{
      type: "text",
      text: "```json\n" + JSON.stringify([
        { story_id: "abc123", summary: "Good summary.", why_it_matters: "Real reason.", relevance: "high" },
        { story_id: "spoofed", summary: "x", why_it_matters: "y", relevance: "low" },
        { story_id: "abc123", summary: "duplicate", why_it_matters: "dup", relevance: "low" },
        { story_id: "abc123", summary: "see https://evil.com", why_it_matters: "link", relevance: "low" }
      ]) + "\n```"
    }]
  };
  const { overrides, weekOverview } = parseSynthesis(data, allowed);
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].summary, "Good summary.");
  assert.equal(overrides[0].relevance, "high");
  assert.equal(weekOverview, "", "legacy array shape has no overview");
});

test("parseSynthesis handles the object shape: week overview, next_move, and dash normalization", () => {
  const allowed = { allowedStoryIds: new Set(["abc123"]) };
  const data = {
    content: [{
      type: "text",
      text: JSON.stringify({
        week_overview: "The agent layer got rails \u2014 and consumers noticed.",
        stories: [{
          story_id: "abc123",
          summary: "Good summary.",
          why_it_matters: "Real reason.",
          next_move: "Audit UCP feed readiness before Q4.",
          relevance: "high"
        }]
      })
    }]
  };
  const { overrides, weekOverview } = parseSynthesis(data, allowed);
  assert.equal(weekOverview, "The agent layer got rails - and consumers noticed.");
  assert.equal(overrides[0].next_move, "Audit UCP feed readiness before Q4.");
});

test("synthesis prompt carries only public projections inside evidence delimiters", () => {
  const items = buildSynthesisItems([story]);
  assert.deepEqual(Object.keys(items[0]).sort(), ["nk_capabilities", "outlet", "story_id", "summary", "title"]);
  const request = buildSynthesisRequest(items, { model: "claude-opus-4-8" });
  assert.doesNotMatch(request.messages[0].content, /example\.com|token=|matchSignals|secretish/);
  assert.match(request.messages[0].content, new RegExp(EVIDENCE_CLOSE));
});

test("reader_headline validation: hype, overlength, and URLs drop the field, never the story", () => {
  const allowed = { allowedStoryIds: new Set(["a", "b", "c", "d"]) };
  const entry = (id, readerHeadline) => ({
    story_id: id, summary: "Good.", why_it_matters: "Real.", relevance: "high",
    next_move: "Audit it.", reader_headline: readerHeadline
  });
  const data = { content: [{ type: "text", text: JSON.stringify({
    week_overview: "A week.",
    stories: [
      entry("a", "Shop filters can now rearrange themselves for each shopper"),
      entry("b", "This game-changing update transforms ecommerce forever"),
      entry("c", "x".repeat(140)),
      entry("d", "Read more at https://example.com now")
    ]
  }) }] };
  const { overrides } = parseSynthesis(data, allowed);
  assert.equal(overrides.length, 4, "all stories survive");
  assert.equal(overrides[0].reader_headline, "Shop filters can now rearrange themselves for each shopper");
  assert.equal(overrides[1].reader_headline, "", "hype dropped");
  assert.equal(overrides[2].reader_headline, "", "overlength dropped");
  assert.equal(overrides[3].reader_headline, "", "URL dropped");
});

test("anti-drift corpus: grounding gate and qualifier rule catch each drift class, receipts account for all", () => {
  const source = "Michaels launches Ask Mike, an AI shopping assistant. The company-reported figure: shoppers convert at double the rate, it says. About 75,000 conversations since May. Built with Google.";
  const storyTextById = new Map([["s1", source]]);
  const allowed = { allowedStoryIds: new Set(["s1"]), storyTextById };
  const attempt = (readerHeadline) => {
    const data = { content: [{ type: "text", text: JSON.stringify({
      week_overview: "A week.",
      stories: [{ story_id: "s1", summary: "The company says conversion doubled.", why_it_matters: "W.", next_move: "Audit.", reader_headline: readerHeadline, relevance: "high" }]
    }) }] };
    return parseSynthesis(data, allowed);
  };

  // invented brand (mid-headline) -> ungrounded_entity; position-0 brands are a
  // documented gap (sentence-case ambiguity) covered by the wire line + receipts.
  let r = attempt("Retailers like Pinterest are doubling sales with AI helpers, it says");
  assert.equal(r.overrides[0].reader_headline, "");
  assert.deepEqual(r.headlineStats.drops[0], { story_id: "s1", reason: "ungrounded_entity" });

  // invented number -> ungrounded_number
  r = attempt("A retailer's AI helper drove 73% more sales, it says");
  assert.equal(r.headlineStats.drops[0].reason, "ungrounded_number");

  // stripped qualifier on a company metric -> missing_qualifier
  r = attempt("A big retailer's new AI helper doubles shopper conversion");
  assert.equal(r.headlineStats.drops[0].reason, "missing_qualifier");

  // clean, grounded, qualified -> accepted
  r = attempt("A big retailer's new AI helper is converting shoppers at double the rate, it says");
  assert.equal(r.overrides[0].reader_headline, "A big retailer's new AI helper is converting shoppers at double the rate, it says");
  assert.deepEqual(r.headlineStats, { attempted: 1, accepted: 1, drops: [] });

  // grounded numbers pass when they exist in source
  r = attempt("About 75,000 shopper conversations later, the AI helper is sticking, it says");
  assert.equal(r.headlineStats.accepted, 1);
});

test("lane summary carries reader-headline drift receipts", async () => {
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-drift",
    capabilityIds: [],
    fetchImpl: async () => ({
      ok: true, status: 200,
      async json() {
        return {
          content: [{ type: "text", text: JSON.stringify({
            week_overview: "A week.",
            stories: [{ story_id: "abc123", summary: "S.", why_it_matters: "W.", next_move: "Audit.", reader_headline: "Totally invented Walmart figure of 99% growth", relevance: "high" }]
          }) }],
          usage: { input_tokens: 10, output_tokens: 10 }
        };
      }
    })
  });
  assert.equal(result.mode, "synthesized");
  assert.equal(result.summary.readerHeadlines.attempted, 1);
  assert.equal(result.summary.readerHeadlines.accepted, 0);
  assert.equal(result.summary.readerHeadlines.dropped, 1);
  assert.ok(["ungrounded_entity", "ungrounded_number"].includes(result.summary.readerHeadlines.dropReasons[0]));
});

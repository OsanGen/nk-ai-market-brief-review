import test from "node:test";
import assert from "node:assert/strict";

import { evaluateItem } from "../src/filter-score.mjs";

const now = new Date("2026-05-08T12:00:00Z");

function item(title, summary = "", categories = ["fashion"]) {
  return {
    title,
    summary,
    categories,
    url: `https://example.com/${encodeURIComponent(title)}`,
    publishedAt: "2026-05-08T11:00:00.000Z",
    sourceWeight: 10
  };
}

test("Generic fashion story without AI is excluded", () => {
  assert.equal(evaluateItem(item("Fashion runway schedule expands"), now).include, false);
});

test("Generic AI story without fashion, beauty, retail, shopping, or commerce is excluded", () => {
  assert.equal(evaluateItem(item("AI chip startup raises funding", "", ["technology"]), now).include, false);
});

test("Source categories alone cannot include generic AI platform news", () => {
  assert.equal(evaluateItem(item("Codex Chrome extension app", "Developer tooling update.", ["agentic_commerce", "platform"]), now).include, false);
});

test("Generic retail story is excluded when AI is not actually present", () => {
  assert.equal(evaluateItem(item("Retail growth playbook gets more human", "", ["retail"]), now).include, false);
});

test("Generic market-growth wire stories are excluded even with AI terms", () => {
  const result = evaluateItem(
    item(
      "Emerging Growth Trends Driving Expansion in the AI Beauty and Cosmetics Market - openPR.com",
      "AI beauty market forecast and compound annual growth rate update"
    ),
    now
  );
  assert.equal(result.include, false);
  assert.equal(result.reason, "blocked_market_noise");
});

test("OpenAI platform name alone does not satisfy AI plus commerce relevance", () => {
  assert.equal(evaluateItem(item("OpenAI developer model documentation update", "", ["agentic_commerce", "platform"]), now).include, false);
});

test("AI + fashion story is included", () => {
  assert.equal(evaluateItem(item("AI fashion search tools launch"), now).include, true);
});

test("AI + beauty story is included", () => {
  assert.equal(evaluateItem(item("AI beauty recommendations expand"), now).include, true);
});

test("Agentic commerce story is included", () => {
  assert.equal(evaluateItem(item("Agentic commerce checkout expands", "", ["agentic_commerce"]), now).include, true);
});

test("Item older than the lookback window is rejected as outside_lookback", () => {
  const stale = { ...item("AI fashion search tools launch"), publishedAt: "2026-05-06T20:00:00.000Z" };
  const result = evaluateItem(stale, now, 36); // 40h old vs 36h window
  assert.equal(result.include, false);
  assert.equal(result.reason, "outside_lookback");
});

test("Item dated in the future beyond tolerance is rejected as future_date", () => {
  const future = { ...item("AI fashion search tools launch"), publishedAt: "2026-05-08T14:00:00.000Z" };
  const result = evaluateItem(future, now, 36); // +2h in the future
  assert.equal(result.include, false);
  assert.equal(result.reason, "future_date");
});

test("Item with an empty or invalid date is rejected as missing_or_invalid_date", () => {
  assert.equal(evaluateItem({ ...item("AI fashion"), publishedAt: "" }, now).reason, "missing_or_invalid_date");
  assert.equal(evaluateItem({ ...item("AI fashion"), publishedAt: "not-a-date" }, now).reason, "missing_or_invalid_date");
});

test("Item missing a url is rejected as missing_title_or_url", () => {
  assert.equal(evaluateItem({ ...item("AI fashion"), url: "" }, now).reason, "missing_title_or_url");
});

test("Norma-relevance groups boost stack-adjacent stories and tag capabilities", () => {
  const groups = [
    { id: "virtual_try_on_image_gen", label: "Virtual try-on / AI imagery", terms: ["virtual try-on", "try-on"] },
    { id: "headless_shopify", label: "Shopify / headless commerce", terms: ["shopify"] }
  ];
  const base = item("Virtual try-on expands for Shopify retailers");
  const plain = evaluateItem(base, now, 36);
  const boosted = evaluateItem(base, now, 36, groups);

  assert.equal(boosted.include, true);
  assert.equal(boosted.normaRelevance.capabilities.length, 2);
  assert.equal(boosted.normaRelevance.bonus, 14);
  assert.equal(boosted.score, plain.score + 14);
  assert.equal(boosted.signals.normaRelevanceMatches, 2);
  const ids = boosted.normaRelevance.capabilities.map((capability) => capability.id);
  assert.deepEqual(ids.sort(), ["headless_shopify", "virtual_try_on_image_gen"]);
});

test("Norma-relevance bonus is capped and absent groups change nothing", () => {
  const manyGroups = Array.from({ length: 8 }, (_, index) => ({
    id: `g${index}`,
    label: `G${index}`,
    terms: ["virtual try-on"]
  }));
  const capped = evaluateItem(item("Virtual try-on launches"), now, 36, manyGroups);
  assert.equal(capped.normaRelevance.bonus, 24);

  const noGroups = evaluateItem(item("Virtual try-on launches"), now, 36);
  assert.equal(noGroups.normaRelevance.capabilities.length, 0);
  assert.equal(noGroups.normaRelevance.bonus, 0);
});

test("Contextual 'ai search' signal is gated by market context in the score, not just inclusion", () => {
  // Both items are included via the 'virtual try-on' high-priority phrase and both
  // contain 'ai search', but only the market-context item may count the contextual
  // signal. Before the fix the non-market item still collected the +12 score boost.
  const nonMarket = evaluateItem(item("Virtual try-on with ai search rollout", ""), now);
  const withMarket = evaluateItem(item("Virtual try-on with ai search rollout", "for retail commerce"), now);
  assert.equal(nonMarket.include, true);
  assert.equal(nonMarket.signals.contextualPriorityMatches, 0);
  assert.equal(withMarket.signals.contextualPriorityMatches, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseFeedXml } from "../src/fetch-feeds.mjs";
import { filterAndScoreItems } from "../src/filter-score.mjs";
import { renderHtml } from "../src/render-html.mjs";
import { renderReviewPage } from "../src/render-review-page.mjs";
import { renderText } from "../src/render-text.mjs";
import { summarizeItems } from "../src/summarize.mjs";

const stories = [
  {
    headline: "AI beauty assistant <script>alert(1)</script>",
    summary: "Beauty shoppers test <img src=x onerror=alert(1)> AI recommendations.",
    whyItMatters: "This matters because beauty discovery is moving toward algorithmic recommendations.",
    sourceName: "AI Fashion and Beauty Market Scan",
    sourceOutlet: "Glossy",
    scanLabel: "AI Fashion and Beauty Market Scan",
    category: "beauty",
    publishedAt: "2026-05-08T11:00:00.000Z",
    url: "https://example.com/story"
  },
  {
    headline: "Agentic commerce platform expands AI shopping",
    summary: "Retail teams test AI shopping discovery in commerce workflows.",
    whyItMatters: "This matters because agentic shopping channels can shift product discovery.",
    sourceName: "Agentic Commerce Market Scan",
    sourceOutlet: "Retail TouchPoints",
    scanLabel: "Agentic Commerce Market Scan",
    category: "agentic_commerce",
    publishedAt: "2026-05-08T10:00:00.000Z",
    url: "https://example.com/commerce"
  }
];

test("Renderer escapes malicious HTML and script content", () => {
  const html = renderHtml({ stories, generatedAt: "2026-05-08T12:00:00.000Z" });
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /&lt;img src=x blocked-event=alert/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("Renderer creates HTML and plain text", () => {
  const html = renderHtml({ stories: stories.slice(0, 1), generatedAt: "2026-05-08T12:00:00.000Z" });
  const text = renderText({ stories: stories.slice(0, 1), generatedAt: "2026-05-08T12:00:00.000Z" });
  assert.match(html, /NK AI Market Brief/);
  assert.match(html, /Read source/);
  assert.match(text, /NK AI Market Brief/);
  assert.match(text, /Read source: https:\/\/example.com\/story/);
  assert.doesNotMatch(text, /<script|onerror|onclick|javascript:/i);
});

test("Review page renderer creates shareable static page", () => {
  const html = renderReviewPage({
    stories,
    generatedAt: "2026-05-08T12:00:00.000Z",
    run: {
      mode: "preview",
      itemCount: 2,
      sourceCount: 2,
      sourceErrors: [],
      sourceResults: [
        { sourceName: "AI Fashion and Beauty Market Scan", status: "ok", itemCount: 1 },
        { sourceName: "Agentic Commerce Market Scan", status: "ok", itemCount: 1 }
      ],
      reviewReady: false,
      reviewReasons: ["Only 2 qualifying stories; tune sources before sharing."],
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      githubPagesDeployConfigured: true,
      githubPagesDeployGatedBy: "DEPLOY_GITHUB_PAGES",
      schedule: ["2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * 5", "17 10,11,12 * * 5"],
      send: { sent: false, skippedReason: "send_disabled" }
    }
  });

  assert.match(html, /<title>NK AI Market Brief<\/title>/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /Internal review/);
  assert.match(html, /Email disabled/);
  assert.match(html, /class="lead-story"/);
  assert.match(html, /class="story-card"/);
  assert.match(html, /href="newsletter.txt"/);
  assert.match(html, /Source:.*Glossy/s);
  assert.doesNotMatch(html, /Scan:/);
  assert.doesNotMatch(html, /Category:/);
  assert.match(html, /Source fetch status/);
  assert.match(html, /Technical diagnostics/);
  assert.match(html, /Automation status/);
  assert.match(html, /Workflow definition: configured/);
  assert.match(html, /Live health: not verified by this static build/);
  assert.match(html, /weekly on Fridays around 4 a\.m\. Eastern/);
  assert.doesNotMatch(html, /<script|onerror|onclick|javascript:/i);
});

test("Review page does not show empty story grid as ready", () => {
  const html = renderReviewPage({
    stories: stories.slice(0, 1),
    generatedAt: "2026-05-08T12:00:00.000Z",
    run: {
      mode: "preview",
      itemCount: 1,
      selectedItemCount: 1,
      sourceCount: 2,
      sourceErrorCount: 0,
      reviewReady: false,
      reviewReasons: ["Fewer than 3 qualifying stories in the current review window."],
      sendStatus: "send_disabled"
    }
  });

  assert.match(html, /Needs source tuning/);
  assert.match(html, /Not enough additional qualifying stories for the review grid/);
  assert.doesNotMatch(html, new RegExp('<div class="story-grid">\\s*</div>'));
});

test("Review page marks reviewReady true when item count reaches threshold", () => {
  const html = renderReviewPage({
    stories: Array.from({ length: 5 }, (_, index) => ({
      ...stories[index % stories.length],
      headline: `AI shopping signal ${index + 1}`
    })),
    generatedAt: "2026-05-08T12:00:00.000Z",
    run: {
      mode: "preview",
      itemCount: 5,
      selectedItemCount: 5,
      sourceCount: 2,
      sourceErrorCount: 0,
      reviewReady: true,
      sendStatus: "send_disabled"
    }
  });

  assert.match(html, /Ready for review/);
});

test("Review page marks reviewReady false when fewer than three items exist", () => {
  const html = renderReviewPage({
    stories: stories.slice(0, 2),
    generatedAt: "2026-05-08T12:00:00.000Z",
    run: {
      mode: "preview",
      itemCount: 2,
      selectedItemCount: 2,
      sourceCount: 2,
      sourceErrorCount: 0,
      reviewReady: false,
      reviewReasons: ["Fewer than 3 qualifying stories in the current review window."],
      sendStatus: "send_disabled"
    }
  });

  assert.match(html, /Needs source tuning/);
  assert.match(html, /Fewer than 3 qualifying stories/);
});

test("Malicious RSS fixture cannot inject script, event handlers, or javascript URLs", async () => {
  const xml = await readFile("fixtures/malicious-summary.xml", "utf8");
  const [item] = await parseFeedXml(
    {
      id: "fixture_beauty",
      name: "Fixture Beauty",
      weight: 10,
      homepageUrl: null,
      categories: ["beauty", "technology"]
    },
    xml
  );
  const { accepted } = filterAndScoreItems([item], {
    now: new Date("2026-05-08T12:00:00.000Z"),
    lookbackHours: 36
  });
  const stories = summarizeItems(accepted);
  const html = renderHtml({ stories, generatedAt: "2026-05-08T12:00:00.000Z" });
  const text = renderText({ stories, generatedAt: "2026-05-08T12:00:00.000Z" });

  assert.equal(stories.length, 1);
  assert.doesNotMatch(`${html}\n${text}`, /<script|onerror|onclick|javascript:/i);
});

test("V1 review page renders NK-relevance badges, watchlist, ring stats, and the AI-lane chip", () => {
  const html = renderReviewPage({
    stories: [{
      headline: "Voice AI stylist launches",
      summary: "A voice agent for fashion.",
      whyItMatters: "Matters.",
      sourceName: "Scan",
      sourceOutlet: "Outlet",
      scanLabel: "Scan",
      category: "fashion",
      publishedAt: "2026-07-24T04:00:00.000Z",
      url: "https://example.com/a",
      normaRelevance: {
        bonus: 14,
        capabilities: [
          { id: "voice_commerce", label: "Voice AI / voice commerce", matchedIn: "title" },
          { id: "ai_stylist_conversational_commerce", label: "AI stylist / conversational shopping", matchedIn: "title" }
        ]
      }
    }],
    run: {
      mode: "preview",
      reviewReady: true,
      aiLane: {
        status: "ready_pending_key",
        model: "claude-opus-4-8",
        fallbacks: ["claude-sonnet-5", "claude-haiku-4-5"],
        packetCount: 1,
        estimatedCostUsd: 0.01,
        budgetCapUsd: 8,
        privateRoutingBlocked: true
      },
      modelPolicy: { primaryReasoningModel: "claude-opus-4-8" },
      stackProfile: { sourceCommit: "519422f06f00" },
      sourceRings: { total: 57, active: 40, shadow: 17, rings: { core: { total: 23, active: 23 }, extended: { total: 30, active: 13 }, discovery: { total: 4, active: 4 } } },
      watchlist: [{
        id: "w1",
        title: "Klaviyo ships AI flows",
        url: "https://example.com/w1",
        sourceOutlet: "Klaviyo",
        normaRelevance: { capabilities: [{ label: "CRM / email flows" }] }
      }]
    },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });

  assert.match(html, /Why this touches NK:/);
  assert.match(html, /Voice AI \/ voice commerce/);
  assert.match(html, /AI review: ready, pending API key/);
  assert.match(html, /claude-opus-4-8/);
  assert.match(html, /Also worth knowing/);
  assert.match(html, /Klaviyo ships AI flows/);
  assert.match(html, /40\/57/);
  assert.match(html, /Ranked for NK relevance/);
  assert.match(html, /blocked until ZDR verification/);
});

test("B-F upgrades: week-in-five index, numerals, callouts, pull-stat, and collapsed ops are data-conditional", () => {
  const stories = Array.from({ length: 3 }, (_, index) => ({
    headline: `Story number ${index + 1}`,
    summary: `Summary ${index + 1}.`,
    whyItMatters: `Matters ${index + 1}.`,
    sourceName: "Scan",
    sourceOutlet: "Outlet",
    category: "fashion",
    publishedAt: "2026-07-24T04:00:00.000Z",
    url: `https://example.com/${index + 1}`,
    sourceType: index === 0 ? "official_primary" : undefined
  }));

  const withExtras = renderReviewPage({
    stories,
    run: {
      mode: "preview",
      reviewReady: true,
      pullStat: { value: "41.4%", caption: "of shoppers prefer AI tools", sourceLabel: "Survey, July 22" }
    },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });

  assert.match(withExtras, /class="week-five"/);
  assert.match(withExtras, /href="#story-1">Story number 1/);
  assert.match(withExtras, /href="#story-3">Story number 3/);
  assert.match(withExtras, /id="story-1"/);
  assert.match(withExtras, /id="story-3"/);
  assert.match(withExtras, /class="callout-line"><strong>Why it matters<\/strong> Matters 1\./);
  assert.doesNotMatch(withExtras, /class="source-type"/, "source-type badges removed from the reader byline");
  assert.match(withExtras, /class="pull-stat-value">41\.4%/);
  assert.match(withExtras, /Survey, July 22/);
  assert.match(withExtras, /<details class="ops">/);
  assert.match(withExtras, /<summary>System details<\/summary>/);
  assert.match(withExtras, /Technical diagnostics/);

  const withoutExtras = renderReviewPage({
    stories: [],
    run: { mode: "preview" },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });
  assert.doesNotMatch(withoutExtras, /class="week-five"/);
  assert.doesNotMatch(withoutExtras, /class="pull-stat-value"/);
});

test("Trust & Action bundle: curation folio, moves ledger, and signal glyphs are data-conditional and coherent", () => {
  const graded = (index, aiRelevance, connection) => ({
    headline: `Story ${index}`,
    summary: "S.",
    whyItMatters: "W.",
    connection,
    aiRelevance,
    sourceName: "Scan",
    sourceOutlet: "Outlet",
    category: "fashion",
    publishedAt: "2026-07-24T04:00:00.000Z",
    url: `https://example.com/${index}`
  });

  const full = renderReviewPage({
    stories: [graded(1, "high", "The feed overlaps NK's catalog."), graded(2, "medium", "The queries overlap NK's search."), graded(3, undefined, undefined)],
    run: { mode: "preview", candidateItemCount: 26, acceptedItemCount: 7, selectedItemCount: 3 },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });

  assert.match(full, /class="curation-folio">This week we went through 26 stories · shortlisted 7 · chose these 3</);
  assert.match(full, /<h2>Where this connects<\/h2>/);
  assert.match(full, /Five ways this week's news lines up with what NK is already building\./);
  assert.equal((full.match(/class="move-text"/g) || []).length, 2, "only stories with moves get rows");
  assert.match(full, /class="move-ref" href="#story-2">Story 02</);
  assert.equal((full.match(/class="sig"/g) || []).length, 4, "high+medium marked in index and story; ungraded story unmarked");
  assert.match(full, /aria-label="Signal: high, 3 of 3, AI-assessed"/);

  const incoherent = renderReviewPage({
    stories: [graded(1, undefined, "Only connection.")],
    run: { mode: "preview", candidateItemCount: 5, acceptedItemCount: 9, selectedItemCount: 1 },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });
  assert.doesNotMatch(incoherent, /class="curation-folio"/, "incoherent funnel prints nothing");
  assert.doesNotMatch(incoherent, /<h2>Where this connects<\/h2>/, "a single connection stays in its story callout");
  assert.doesNotMatch(incoherent, /class="sig"/, "no grade, no ink");

  const equalFunnel = renderReviewPage({
    stories: [],
    run: { mode: "preview", candidateItemCount: 8, acceptedItemCount: 8, selectedItemCount: 8 },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });
  assert.doesNotMatch(equalFunnel, /class="curation-folio"/, "a funnel that does not narrow tells no story");
});

test("external source links open in a new tab with noopener; internal anchors stay same-tab", () => {
  const html = renderReviewPage({
    stories: [{
      headline: "Story",
      summary: "S.",
      whyItMatters: "W.",
      sourceName: "Scan",
      sourceOutlet: "Outlet",
      category: "fashion",
      publishedAt: "2026-07-24T04:00:00.000Z",
      url: "https://example.com/a"
    }],
    run: {
      mode: "preview",
      watchlist: [{ id: "w1", title: "Watch", url: "https://example.com/w", sourceOutlet: "O" }]
    },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });
  const external = html.match(/href="https:[^"]*"[^>]*/g) || [];
  assert.ok(external.length >= 2);
  for (const link of external) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
  const internal = html.match(/href="#story-\d"[^>]*/g) || [];
  for (const link of internal) assert.doesNotMatch(link, /target=/);
});

test("Translation layer: reader headline leads, wire line keeps the factual original, absent field is byte-safe", () => {
  const base = {
    summary: "S.",
    whyItMatters: "W.",
    sourceName: "Scan",
    sourceOutlet: "Outlet",
    category: "fashion",
    publishedAt: "2026-07-24T04:00:00.000Z",
    url: "https://example.com/a"
  };
  const withReader = renderReviewPage({
    stories: [
      { ...base, headline: "Vendor ships Facet Engine v2 GA", readerHeadline: "Shop filters can now rearrange themselves for each shopper" },
      { ...base, headline: "Plain headline stays", url: "https://example.com/b" }
    ],
    run: { mode: "preview" },
    generatedAt: "2026-07-24T08:00:00.000Z"
  });

  assert.match(withReader, /<h2>Shop filters can now rearrange themselves for each shopper<\/h2>/);
  assert.match(withReader, /class="wire-line">Filed as: Vendor ships Facet Engine v2 GA</);
  assert.match(withReader, /href="#story-1">Shop filters can now rearrange themselves for each shopper</);
  assert.equal((withReader.match(/wire-line">/g) || []).length, 1, "no wire line without a reader headline");
  assert.match(withReader, /<h3>Plain headline stays<\/h3>/);
});

test("gated render omits the plaintext newsletter.txt side-door", () => {
  const story = {
    headline: "Story", summary: "S.", whyItMatters: "W.", sourceName: "Scan", sourceOutlet: "Outlet",
    category: "fashion", publishedAt: "2026-07-24T04:00:00.000Z", url: "https://example.com/a"
  };
  const ungated = renderReviewPage({ stories: [story], run: { mode: "preview" }, generatedAt: "2026-07-24T08:00:00.000Z" });
  const gated = renderReviewPage({ stories: [story], run: { mode: "preview", gated: true }, generatedAt: "2026-07-24T08:00:00.000Z" });
  assert.match(ungated, /href="newsletter\.txt"/);
  assert.doesNotMatch(gated, /newsletter\.txt/);
});

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
      schedule: ["2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *", "17 10,11,12 * * *"],
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
  assert.match(html, /Scan:.*AI Fashion and Beauty Market Scan/s);
  assert.match(html, /Source fetch status/);
  assert.match(html, /Technical diagnostics/);
  assert.match(html, /Automation status/);
  assert.match(html, /Auto-refresh: configured/);
  assert.match(html, /daily around 4 a\.m\. Eastern/);
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

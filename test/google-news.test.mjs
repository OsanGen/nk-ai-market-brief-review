import test from "node:test";
import assert from "node:assert/strict";

import { buildGoogleNewsRssUrl, sourceToFeedUrl } from "../src/google-news.mjs";

test("Google News URL builder encodes query", () => {
  const url = buildGoogleNewsRssUrl('AI fashion "virtual try-on"');
  assert.equal(url, "https://news.google.com/rss/search?q=AI%20fashion%20%22virtual%20try-on%22&hl=en-US&gl=US&ceid=US:en");
});

test("sourceToFeedUrl uses Google News RSS mode", () => {
  const url = sourceToFeedUrl({ mode: "google_news_rss", query: "agentic commerce" });
  assert.match(url, /news\.google\.com\/rss\/search/);
});

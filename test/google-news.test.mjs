import test from "node:test";
import assert from "node:assert/strict";

import { assertSafeFeedUrl, buildGoogleNewsRssUrl, sourceToFeedUrl } from "../src/google-news.mjs";

test("Google News URL builder encodes query", () => {
  const url = buildGoogleNewsRssUrl('AI fashion "virtual try-on"');
  assert.equal(url, "https://news.google.com/rss/search?q=AI%20fashion%20%22virtual%20try-on%22&hl=en-US&gl=US&ceid=US:en");
});

test("sourceToFeedUrl uses Google News RSS mode", () => {
  const url = sourceToFeedUrl({ mode: "google_news_rss", query: "agentic commerce" });
  assert.match(url, /news\.google\.com\/rss\/search/);
});

test("direct_rss allows an external https feed URL", () => {
  const url = sourceToFeedUrl({ mode: "direct_rss", query: "https://example.com/feed.xml" });
  assert.equal(url, "https://example.com/feed.xml");
});

test("direct_rss blocks internal hosts and non-http schemes (SSRF guard)", () => {
  assert.throws(() => sourceToFeedUrl({ mode: "direct_rss", query: "http://169.254.169.254/latest/meta-data/" }), /blocked_internal_host/);
  assert.throws(() => sourceToFeedUrl({ mode: "direct_rss", query: "http://localhost:8080/admin" }), /blocked_internal_host/);
  assert.throws(() => sourceToFeedUrl({ mode: "direct_rss", query: "http://127.0.0.1/" }), /blocked_internal_host/);
  assert.throws(() => sourceToFeedUrl({ mode: "direct_rss", query: "http://10.0.0.5/feed" }), /blocked_internal_host/);
  assert.throws(() => sourceToFeedUrl({ mode: "direct_rss", query: "file:///etc/passwd" }), /unsupported_feed_scheme/);
  assert.throws(() => assertSafeFeedUrl("not a url"), /invalid_feed_url/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { fetchFeeds } from "../src/fetch-feeds.mjs";

test("feed collection emits one safe event per source plus an all-failed summary", async () => {
  const events = [];
  const telemetry = {
    async event(record) {
      events.push(record);
    }
  };
  const sources = [
    { id: "alpha", name: "Alpha", mode: "direct_rss", query: "https://example.com/alpha.xml" },
    { id: "beta", name: "Beta", mode: "direct_rss", query: "https://example.com/beta.xml" }
  ];

  const result = await fetchFeeds(sources, {
    telemetry,
    fetchImpl: async () => {
      throw Object.assign(new Error("Bearer abcdefghijklmnopqrstuvwxyz operator@example.com"), { code: "ENETDOWN" });
    }
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.sourceResults.length, 2);
  assert.equal(result.sourceResults.every((source) => source.status === "error"), true);
  assert.equal(result.sourceResults.every((source) => source.errorCode === "enetdown"), true);
  assert.equal(result.sourceResults.every((source) => !("errorMessage" in source)), true);
  assert.equal(events.length, 3);
  assert.deepEqual(events.slice(0, 2).map((event) => event.event), ["source.fetch.failed", "source.fetch.failed"]);
  assert.equal(events[2].event, "source.fetch.summary");
  assert.equal(events[2].status, "failed");
  assert.equal(events[2].reasonCode, "all_sources_failed");
  assert.deepEqual(events[2].attributes, {
    sourceCount: 2,
    successfulSourceCount: 0,
    failedSourceCount: 2,
    itemCount: 0
  });
  assert.doesNotMatch(JSON.stringify({ events, result }), /operator@example\.com|Bearer abcdef/);
});

test("an empty source registry emits an explicit failed summary", async () => {
  const events = [];
  const result = await fetchFeeds([], {
    telemetry: { async event(record) { events.push(record); } },
    fetchImpl: async () => {
      throw new Error("must not fetch");
    }
  });

  assert.deepEqual(result, { items: [], sourceResults: [] });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "source.fetch.summary");
  assert.equal(events[0].level, "error");
  assert.equal(events[0].status, "failed");
  assert.equal(events[0].reasonCode, "no_sources_configured");
});

import test from "node:test";
import assert from "node:assert/strict";

import { fetchFeeds } from "../src/fetch-feeds.mjs";

const source = { id: "s1", name: "Scan", mode: "google_news_rss", query: "agentic commerce" };

function streamingResponse(totalBytes, contentLength) {
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-length" ? contentLength ?? null : null) },
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new Uint8Array(totalBytes) };
          }
        };
      }
    }
  };
}

test("a response body exceeding the byte cap fails the source instead of buffering it", async () => {
  const { items, sourceResults } = await fetchFeeds([source], {
    fetchImpl: async () => streamingResponse(64),
    maxBytes: 16
  });
  assert.equal(items.length, 0);
  assert.equal(sourceResults[0].status, "error");
});

test("an oversized declared content-length is rejected before the body is read", async () => {
  let readCalled = false;
  const { sourceResults } = await fetchFeeds([source], {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-length" ? "999999999" : null) },
      body: {
        getReader() {
          return {
            async read() {
              readCalled = true;
              return { done: true, value: undefined };
            }
          };
        }
      }
    }),
    maxBytes: 16
  });
  assert.equal(sourceResults[0].status, "error");
  assert.equal(readCalled, false);
});

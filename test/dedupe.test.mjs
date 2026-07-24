import test from "node:test";
import assert from "node:assert/strict";

import { canonicalUrl, dedupeItems } from "../src/dedupe.mjs";

test("Dedupe removes tracking-param duplicates", () => {
  const items = [
    { title: "AI fashion search", url: "https://Example.com/story/?utm_source=x&ref=feed", score: 10 },
    { title: "AI fashion search", url: "https://example.com/story", score: 5 }
  ];
  assert.equal(canonicalUrl(items[0].url), "https://example.com/story");
  assert.equal(dedupeItems(items).length, 1);
  assert.equal(dedupeItems(items)[0].score, 10);
});

test("Dedupe removes near-identical title duplicates", () => {
  const items = [
    { title: "Nike launches AI shopping assistant for product discovery", url: "https://example.com/a", score: 7 },
    { title: "Nike launches AI shopping assistant for product discovery today", url: "https://example.com/b", score: 11 }
  ];
  const result = dedupeItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].score, 11);
});

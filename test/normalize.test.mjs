import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml, normalizeFeedItem, safeUrl, sanitizeDisplayText, stripTags } from "../src/normalize.mjs";

const source = { id: "src", name: "Scan", weight: 5, homepageUrl: "https://x.test", categories: ["fashion"] };

test("safeUrl allows http(s) and drops dangerous protocols", () => {
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeUrl("http://example.com/a"), "http://example.com/a");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeUrl("not a url"), "");
});

test("normalizeFeedItem strips tags and refuses a javascript: link", () => {
  const normalized = normalizeFeedItem(
    { title: "<b>AI</b> fashion", link: "javascript:alert(1)", contentSnippet: "<script>bad()</script>clean copy" },
    source
  );
  assert.equal(normalized.title, "AI fashion");
  assert.equal(normalized.url, "");
  assert.doesNotMatch(normalized.summary, /script|bad\(\)/);
});

test("sanitizeDisplayText neutralizes all on* event handlers, not just onerror/onclick", () => {
  for (const handler of ["onload", "onmouseover", "onfocus", "onerror", "onclick"]) {
    assert.match(sanitizeDisplayText(`<img ${handler}=x>`), /blocked-event=/);
  }
  assert.match(sanitizeDisplayText("javascript:alert(1)"), /blocked-protocol:/);
});

test("escapeHtml escapes angle brackets and quotes after sanitizing", () => {
  const out = escapeHtml('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
});

test("stripTags removes script and style bodies", () => {
  assert.equal(stripTags("<style>.a{}</style>hello<script>x()</script> world"), "hello world");
});

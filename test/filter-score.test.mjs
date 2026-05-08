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

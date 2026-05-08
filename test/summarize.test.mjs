import test from "node:test";
import assert from "node:assert/strict";

import { cleanTitle, summarizeItem } from "../src/summarize.mjs";

test("Title suffix cleanup removes common source suffixes", () => {
  assert.equal(cleanTitle("Luxury Briefing: Pinterest’s luxury pitch is AI discovery, not AI answers - glossy.co", "Glossy AI Fashion and Beauty"), "Luxury Briefing: Pinterest’s luxury pitch is AI discovery, not AI answers");
  assert.equal(cleanTitle("Agentic commerce shifts retail | Vogue Business", "Vogue Business AI"), "Agentic commerce shifts retail");
  assert.equal(cleanTitle("AI shopping tools expand - Business of Fashion", "Business of Fashion AI"), "AI shopping tools expand");
  assert.equal(cleanTitle("Meta wants an AI agent to go Instagram shopping for you - Digital Trends", "Platform AI Shopping Market Scan"), "Meta wants an AI agent to go Instagram shopping for you");
});

test("Summary fallback does not duplicate title when useful fallback is possible", () => {
  const story = summarizeItem({
    title: "Luxury Briefing: Pinterest’s luxury pitch is AI discovery, not AI answers - glossy.co",
    summary: "Luxury Briefing: Pinterest’s luxury pitch is AI discovery, not AI answers glossy.co",
    sourceName: "Glossy AI Fashion and Beauty",
    categories: ["fashion"],
    url: "https://example.com",
    publishedAt: "2026-05-08T12:00:00.000Z"
  });
  assert.notEqual(story.summary, story.headline);
  assert.match(story.summary, /Pinterest is positioning AI as a discovery layer/);
});

test("Why-it-matters copy is business-facing", () => {
  const story = summarizeItem({
    title: "Shopify expects agentic commerce to lift ecommerce adoption",
    summary: "Shopify expects agentic commerce to lift ecommerce adoption",
    sourceName: "Agentic Commerce Market Scan",
    categories: ["agentic_commerce"],
    url: "https://example.com",
    publishedAt: "2026-05-08T12:00:00.000Z"
  });
  assert.doesNotMatch(story.whyItMatters, /metadata matched|filters/i);
  assert.match(story.whyItMatters, /catalog readiness|AI-assisted shopping/);
});

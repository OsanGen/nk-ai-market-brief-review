import test from "node:test";
import assert from "node:assert/strict";

import { selectDiverseItems, topicCluster } from "../src/story-diversity.mjs";

function item(title, score, sourceName = "Scan", category = "shopping", sourceOutlet = "Outlet") {
  return {
    id: title,
    title,
    summary: title,
    score,
    sourceName,
    sourceOutlet,
    categories: [category],
    publishedAt: "2026-05-08T12:00:00.000Z",
    url: `https://example.com/${encodeURIComponent(title)}`
  };
}

test("Topic clustering recognizes repeated Meta and virtual try-on stories", () => {
  assert.equal(topicCluster(item("Meta readies AI shopping agents for Instagram", 10)).id, "meta_instagram_shopping_agents");
  assert.equal(topicCluster(item("Google Cloud Virtual Try-On launches for luxury", 10)).id, "google_cloud_virtual_try_on");
});

test("Diverse selection limits repeated topic clusters when enough items exist", () => {
  const items = [
    item("Meta Develops Agentic AI Shopping Assistant for Instagram", 100),
    item("Meta readies AI shopping agents for Instagram to rival TikTok Shop", 99),
    item("Meta Is Building an AI Agent Called Hatch and an AI Shopping Tool", 98),
    item("Google Cloud Virtual Try-On Revolutionises Luxury Fashion", 97, "Fashion Scan", "fashion"),
    item("OTB Group Brings Google Cloud Virtual Try-On to Luxury", 96, "Fashion Scan", "fashion"),
    item("OTB Group and Google Cloud launch AI-powered virtual try-on experiences", 95, "Fashion Scan", "fashion"),
    item("Shopify expects agentic commerce to lift ecommerce adoption", 94, "Shopify Scan", "ecommerce"),
    item("OpenAI commerce protocol expands AI shopping", 93, "OpenAI Scan", "agentic_commerce")
  ];
  const selected = selectDiverseItems(items, 8);
  const clusterCounts = selected.reduce((counts, entry) => {
    counts[entry.topicCluster] = (counts[entry.topicCluster] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(clusterCounts["Meta / Instagram / Hatch shopping agents"], 2);
  assert.equal(clusterCounts["Google Cloud / virtual try-on"], 2);
  assert.equal(selected.some((entry) => entry.title.includes("Shopify")), true);
  assert.equal(selected.some((entry) => entry.title.includes("OpenAI")), true);
});

test("Cluster-capped items are backfilled to reach the minimum, without duplicates", () => {
  // Six items all land in the Meta cluster (>= MIN_REVIEW_ITEMS, so the cap is
  // active). The main loop admits only MAX_PER_CLUSTER (2) and skips the other 4;
  // the backfill loop must re-admit skipped items until the minimum (5) is met.
  const items = [
    item("Meta launches AI shopping agents for Instagram one", 100),
    item("Meta launches AI shopping agents for Instagram two", 99),
    item("Meta launches AI shopping agents for Instagram three", 98),
    item("Meta launches AI shopping agents for Instagram four", 97),
    item("Meta launches AI shopping agents for Instagram five", 96),
    item("Meta launches AI shopping agents for Instagram six", 95)
  ];
  const selected = selectDiverseItems(items, 8);
  assert.equal(selected.length, 5);
  const ids = selected.map((entry) => entry.id);
  assert.equal(new Set(ids).size, 5, "backfilled items must be unique");
});

test("Diverse selection does not remove valid items below the minimum review threshold", () => {
  const selected = selectDiverseItems([
    item("Meta Develops Agentic AI Shopping Assistant for Instagram", 100),
    item("Meta readies AI shopping agents for Instagram to rival TikTok Shop", 99),
    item("Meta Is Building an AI Agent Called Hatch and an AI Shopping Tool", 98),
    item("Meta wants an AI agent to go Instagram shopping", 97)
  ], 8);

  assert.equal(selected.length, 4);
});

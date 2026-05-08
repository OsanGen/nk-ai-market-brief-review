import Parser from "rss-parser";

import { sourceToFeedUrl } from "./google-news.mjs";
import { normalizeFeedItem } from "./normalize.mjs";

const parser = new Parser({ customFields: { item: ["source"] } });

export async function fetchFeeds(sources, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const items = [];
  const sourceResults = [];

  for (const source of sources) {
    try {
      const url = sourceToFeedUrl(source);
      const xml = await fetchTextWithTimeout(url, timeoutMs, fetchImpl);
      const parsedItems = await parseFeedXml(source, xml);
      items.push(...parsedItems);
      sourceResults.push({ sourceId: source.id, sourceName: source.name, status: "ok", itemCount: parsedItems.length });
    } catch (error) {
      sourceResults.push({ sourceId: source.id, sourceName: source.name, status: "error", itemCount: 0, error: error.message });
    }
  }

  return { items, sourceResults };
}

export async function parseFeedXml(source, xml) {
  const feed = await parser.parseString(xml);
  return feed.items.map((item) => normalizeFeedItem(item, source));
}

async function fetchTextWithTimeout(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "user-agent": "nk-ai-market-newsletter/0.1" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

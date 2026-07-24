import Parser from "rss-parser";

import { sourceToFeedUrl } from "./google-news.mjs";
import { normalizeFeedItem } from "./normalize.mjs";
import { currentTelemetry } from "./observability/telemetry.mjs";
import { serializeError } from "./observability/redaction.mjs";

const parser = new Parser({ customFields: { item: ["source"] } });

// With the ring network the registry fetches ~40 sources per run; a small
// worker pool keeps wall-clock bounded without hammering any single host.
const DEFAULT_FETCH_CONCURRENCY = 6;

export async function fetchFeeds(sources, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? MAX_FEED_BYTES;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_FETCH_CONCURRENCY);
  const telemetry = options.telemetry ?? currentTelemetry();
  // Results keyed by source index so output order stays deterministic (source
  // order), independent of which fetch finishes first.
  const itemsBySource = new Array(sources.length).fill(null).map(() => []);
  const sourceResults = new Array(sources.length);

  async function fetchOne(source, index) {
    const startedAt = Date.now();
    try {
      const url = sourceToFeedUrl(source);
      const xml = await fetchTextWithTimeout(url, timeoutMs, fetchImpl, maxBytes);
      let parsedItems = await parseFeedXml(source, xml);
      // Per-publisher intake cap (registry caps.max_items_per_run).
      const cap = Number(source.maxItemsPerRun);
      const cappedCount = Number.isInteger(cap) && cap > 0 && parsedItems.length > cap
        ? parsedItems.length - cap
        : 0;
      if (cappedCount > 0) parsedItems = parsedItems.slice(0, cap);
      itemsBySource[index] = parsedItems;
      const result = {
        sourceId: source.id,
        sourceName: source.name,
        status: "ok",
        itemCount: parsedItems.length,
        durationMs: Date.now() - startedAt
      };
      sourceResults[index] = result;
      await telemetry?.event({
        event: "source.fetch.completed",
        component: "feed_fetch",
        phase: "source.fetch",
        status: "completed",
        durationMs: result.durationMs,
        attributes: {
          sourceId: result.sourceId,
          itemCount: result.itemCount,
          ...(cappedCount > 0 ? { cappedItemCount: cappedCount } : {})
        }
      });
    } catch (error) {
      const failure = serializeError(error);
      const result = {
        sourceId: source.id,
        sourceName: source.name,
        status: "error",
        itemCount: 0,
        durationMs: Date.now() - startedAt,
        errorCode: failure.errorCode,
        errorFingerprint: failure.errorFingerprint
      };
      sourceResults[index] = result;
      await telemetry?.event({
        event: "source.fetch.failed",
        level: "warn",
        component: "feed_fetch",
        phase: "source.fetch",
        status: "failed",
        reasonCode: failure.errorCode,
        durationMs: result.durationMs,
        attributes: {
          sourceId: result.sourceId,
          errorCode: failure.errorCode,
          errorFingerprint: failure.errorFingerprint
        }
      });
    }
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= sources.length) return;
      await fetchOne(sources[index], index);
    }
  });
  await Promise.all(workers);
  const items = itemsBySource.flat();

  const failedSourceCount = sourceResults.filter((source) => source.status === "error").length;
  const noSources = sources.length === 0;
  const allSourcesFailed = !noSources && failedSourceCount === sources.length;
  await telemetry?.event({
    event: "source.fetch.summary",
    level: noSources || allSourcesFailed ? "error" : failedSourceCount ? "warn" : "info",
    component: "feed_fetch",
    phase: "source.fetch",
    status: noSources || allSourcesFailed ? "failed" : failedSourceCount ? "degraded" : "completed",
    reasonCode: noSources ? "no_sources_configured" : allSourcesFailed ? "all_sources_failed" : failedSourceCount ? "partial_source_failure" : "",
    attributes: {
      sourceCount: sources.length,
      successfulSourceCount: sources.length - failedSourceCount,
      failedSourceCount,
      itemCount: items.length
    }
  });

  return { items, sourceResults };
}

export async function parseFeedXml(source, xml) {
  const feed = await parser.parseString(xml);
  return feed.items.map((item) => normalizeFeedItem(item, source));
}

// Cap the response body so a feed host that streams a very large payload within
// the timeout window cannot force the whole thing into memory (OOM risk). RSS
// feeds are small; a few MB is a generous ceiling.
const MAX_FEED_BYTES = 8 * 1024 * 1024;

async function fetchTextWithTimeout(url, timeoutMs, fetchImpl, maxBytes = MAX_FEED_BYTES) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "user-agent": "nk-ai-market-newsletter/0.1" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Reject early on an oversized declared length.
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error("feed_response_too_large");

    // Stream and enforce the byte budget when the runtime exposes a body reader;
    // fall back to text() for mocks/adapters that do not (behaviour-preserving).
    const body = response.body;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          controller.abort();
          throw new Error("feed_response_too_large");
        }
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

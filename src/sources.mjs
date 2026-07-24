import { SOURCE_REGISTRY_PATH, loadSourceRegistry, toLegacySources } from "./source-registry.mjs";

// Registry v2 (config/source-registry.json) is canonical since P1 (spec section 10).
// The legacy file newsletter-sources.json remains on disk as a deprecated reference
// until SRC-002 reconciliation (REQ-1019); it is no longer read by the pipeline.
// This module keeps its legacy exported API: loadSources() returns enabled sources
// in the exact shape downstream callers (fetch-feeds, filter-score) consume.
export async function loadSources(filePath = SOURCE_REGISTRY_PATH) {
  const registry = await loadSourceRegistry(filePath);
  return toLegacySources(registry).filter((source) => source.enabled);
}

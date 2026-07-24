import path from "node:path";

import { writeJsonAtomic } from "./observability/telemetry.mjs";
import { sanitizeAttributes } from "./observability/redaction.mjs";
import { SOURCE_FAMILIES } from "./source-registry.mjs";

// REC-COVERAGE, P1 run-scoped slice (spec sections 9.7, 10.8; REQ-0923, REQ-1012, REQ-1020).
// This receipt covers exactly one weekly run: per-source fetch outcomes for this run and
// per-family coverage against the provisional 10.8 checklist. Multi-run source health
// (stale/silent per REQ-0918/REQ-0919, REC-SOURCE-HEALTH) arrives in P2 and is explicitly
// declared out of scope here via health_history_scope.

export const COVERAGE_RECEIPT_SCHEMA_VERSION = 1;
export const COVERAGE_RECEIPT_CONTRACT = "coverage-receipt.schema.json";
export const COVERAGE_RECEIPT_FILENAME = "coverage-receipt.json";
export const COVERAGE_RECEIPT_EVENT = "coverage.receipt.written";

// Provisional category-coverage checklist, spec 10.8 (non-canonical until SRC-002).
// Provisional per-family gap checklist. Updated 2026-07-24 with the ring
// migration (registry 2.1.0): the 52-source seed activation filled the AI-lab,
// commerce-platform, and martech-vendor gaps; UX/performance and primary-research
// rows exist but are shadow (p2, not yet fetched), and the website pattern panel
// remains unbuilt.
export const SEED_FAMILY_GAP_STATUS = Object.freeze({
  official_ai_labs_and_model_providers: "covered",
  official_commerce_platforms_and_developer_changelogs: "covered",
  official_martech_and_ecommerce_vendors: "covered",
  independent_retail_ecommerce_fashion_reporting: "covered",
  ux_performance_accessibility_trust_experimentation: "open_gap",
  primary_research_feeds: "open_gap",
  website_pattern_panel: "open_gap"
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ISO 8601 year-week id, UTC-based (example: "2026-W30").
export function isoWeekId(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("isoWeekId requires a valid date");
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  target.setUTCDate(target.getUTCDate() - ((target.getUTCDay() + 6) % 7) + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / WEEK_MS);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function buildCoverageReceipt({
  registry,
  sourceResults = [],
  acceptedItems = [],
  runId,
  weekId,
  now = new Date(),
  lookbackHours = 168
}) {
  if (!registry || !Array.isArray(registry.sources)) {
    throw new Error("buildCoverageReceipt requires a validated source registry");
  }
  if (typeof runId !== "string" || !runId) throw new Error("buildCoverageReceipt requires a runId");
  const generatedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(generatedAt.getTime())) throw new Error("buildCoverageReceipt requires a valid now");
  const resolvedWeekId = weekId || isoWeekId(generatedAt);
  const windowStart = new Date(generatedAt.getTime() - lookbackHours * 60 * 60 * 1000);

  const perSource = sourceResults.map((result) => ({
    source_record_id: result.sourceId,
    status: result.status,
    item_count: result.itemCount ?? 0,
    error_code: result.errorCode || "",
    error_fingerprint: result.errorFingerprint || "",
    duration_ms: result.durationMs ?? 0
  }));

  const perFamily = SOURCE_FAMILIES.map((family) => {
    const rows = registry.sources.filter((row) => row.source_family === family);
    const activeIds = new Set(rows.filter((row) => row.status === "active").map((row) => row.record_id));
    const familyResults = sourceResults.filter((result) => activeIds.has(result.sourceId));
    const itemsFetched = familyResults.reduce((total, result) => total + (result.itemCount ?? 0), 0);
    const itemsAdmitted = acceptedItems.filter((item) => activeIds.has(item.sourceId)).length;
    const gapStatus = activeIds.size === 0 ? "open_gap" : SEED_FAMILY_GAP_STATUS[family] ?? "covered";
    return {
      source_family: family,
      active_source_count: activeIds.size,
      items_fetched: itemsFetched,
      items_admitted: itemsAdmitted,
      sources_fetch_ok: familyResults.filter((result) => result.status === "ok").length,
      sources_fetch_failed: familyResults.filter((result) => result.status === "error").length,
      stale_sources: [],
      silent_sources: [],
      gap_status: gapStatus
    };
  });

  const knownBlindSpots = perFamily
    .filter((family) => family.gap_status === "open_gap")
    .map((family) => family.source_family);

  const weekSlug = resolvedWeekId.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const runSlug = runId.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  return {
    schema_version: COVERAGE_RECEIPT_SCHEMA_VERSION,
    contract: COVERAGE_RECEIPT_CONTRACT,
    record_id: `coverage_${weekSlug}_${runSlug}`,
    status: "completed",
    created_at: generatedAt.toISOString(),
    producer_version: "coverage-receipt-1.0.0",
    source_refs: [`run:${runId}`],
    confidence: 1,
    run_id: runId,
    week_id: resolvedWeekId,
    evaluation_window: {
      start: windowStart.toISOString(),
      end: generatedAt.toISOString(),
      lookback_hours: lookbackHours
    },
    registry_completeness: registry.src002_status === "pending" ? "seed_only" : "full",
    src002_status: registry.src002_status,
    // P1 boundary: stale/silent flags need multi-run REC-SOURCE-HEALTH history (P2).
    health_history_scope: "single_run_only_rec_source_health_pending_p2",
    per_source: perSource,
    per_family: perFamily,
    known_blind_spots: knownBlindSpots
  };
}

// Writes the receipt into the telemetry run directory (beside run-manifest.json and
// summary.json) and emits the coverage event through the run's event stream.
export async function writeCoverageReceipt({
  telemetry,
  registry,
  sourceResults = [],
  acceptedItems = [],
  now = new Date(),
  lookbackHours = 168
}) {
  if (!telemetry?.paths?.runDirectory) {
    throw new Error("writeCoverageReceipt requires an active telemetry run");
  }
  // Durable REC-COVERAGE record: keep redaction of external text, but raise the
  // structural caps far above any realistic registry size. The default event-attribute
  // caps (REQ-36-006: 50 array entries, 100 object keys) would silently truncate
  // per_source once SRC-002 pushes the registry past 50 rows, corrupting a record
  // whose purpose is complete per-source coverage accounting (REQ-0923, REQ-1012).
  // The coverage.receipt.written event attributes below are still sanitized with the
  // default caps inside telemetry.event.
  const receipt = sanitizeAttributes(buildCoverageReceipt({
    registry,
    sourceResults,
    acceptedItems,
    runId: telemetry.runId,
    now,
    lookbackHours
  }), { maxArrayLength: 512, maxObjectKeys: 256 });
  const filePath = path.join(telemetry.paths.runDirectory, COVERAGE_RECEIPT_FILENAME);
  await writeJsonAtomic(filePath, receipt);
  telemetry.registerComponent("coverage", { role: "coverage_receipt_writer" });
  await telemetry.event({
    event: COVERAGE_RECEIPT_EVENT,
    component: "coverage",
    phase: "coverage.receipt",
    status: "completed",
    attributes: {
      recordId: receipt.record_id,
      weekId: receipt.week_id,
      registryCompleteness: receipt.registry_completeness,
      src002Status: receipt.src002_status,
      sourceCount: receipt.per_source.length,
      familyCount: receipt.per_family.length,
      blindSpotCount: receipt.known_blind_spots.length,
      knownBlindSpots: receipt.known_blind_spots
    }
  });
  return { receipt, path: filePath, file: COVERAGE_RECEIPT_FILENAME };
}

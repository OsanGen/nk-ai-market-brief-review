import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COVERAGE_RECEIPT_FILENAME,
  SEED_FAMILY_GAP_STATUS,
  buildCoverageReceipt,
  isoWeekId,
  writeCoverageReceipt
} from "../src/coverage-receipt.mjs";
import { SOURCE_FAMILIES, loadSourceRegistry } from "../src/source-registry.mjs";
import { startTelemetryRun } from "../src/observability/telemetry.mjs";

const registryPath = fileURLToPath(new URL("../config/source-registry.json", import.meta.url));

test("isoWeekId computes ISO 8601 year-weeks including year boundaries", () => {
  assert.equal(isoWeekId(new Date("2026-07-23T12:00:00Z")), "2026-W30");
  assert.equal(isoWeekId(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(isoWeekId(new Date("2026-12-31T23:59:59Z")), "2026-W53");
  assert.equal(isoWeekId(new Date("2027-01-01T00:00:00Z")), "2026-W53");
  assert.equal(isoWeekId(new Date("2025-12-29T00:00:00Z")), "2026-W01");
  assert.throws(() => isoWeekId(new Date("invalid")), /valid date/);
});

test("coverage receipt carries run identity, window, per-source and per-family coverage, and blind spots", async () => {
  const registry = await loadSourceRegistry(registryPath);
  const now = new Date("2026-07-23T12:00:00Z");
  const sourceResults = registry.sources.map((row, index) => (index === 0
    ? {
      sourceId: row.record_id,
      sourceName: row.display_name,
      status: "error",
      itemCount: 0,
      durationMs: 12,
      errorCode: "http_status",
      errorFingerprint: "f".repeat(16)
    }
    : {
      sourceId: row.record_id,
      sourceName: row.display_name,
      status: "ok",
      itemCount: 3,
      durationMs: 25
    }));
  const acceptedItems = [
    { sourceId: "shopify_agentic_commerce" },
    { sourceId: "openai_commerce" },
    { sourceId: "openai_commerce" }
  ];

  const receipt = buildCoverageReceipt({
    registry,
    sourceResults,
    acceptedItems,
    runId: "weekly-run-1",
    now,
    lookbackHours: 168
  });

  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.record_id, "coverage_2026_w30_weekly_run_1");
  assert.equal(receipt.run_id, "weekly-run-1");
  assert.equal(receipt.week_id, "2026-W30");
  assert.equal(receipt.evaluation_window.end, now.toISOString());
  assert.equal(receipt.evaluation_window.start, new Date("2026-07-16T12:00:00Z").toISOString());
  assert.equal(receipt.evaluation_window.lookback_hours, 168);
  assert.equal(receipt.src002_status, "pending");
  assert.equal(receipt.registry_completeness, "seed_only");
  assert.equal(receipt.health_history_scope, "single_run_only_rec_source_health_pending_p2");

  assert.equal(receipt.per_source.length, 57);
  const failed = receipt.per_source.find((entry) => entry.status === "error");
  assert.equal(failed.source_record_id, registry.sources[0].record_id);
  assert.equal(failed.error_code, "http_status");
  assert.equal(failed.error_fingerprint.length, 16);

  assert.deepEqual(receipt.per_family.map((family) => family.source_family), SOURCE_FAMILIES);
  const byFamily = new Map(receipt.per_family.map((family) => [family.source_family, family]));
  // Ring-era registry (2.1.0): 13 independent reporting, 10 AI labs, 8 commerce
  // platforms, 9 martech vendors active.
  assert.equal(byFamily.get("independent_retail_ecommerce_fashion_reporting").active_source_count, 13);
  assert.equal(byFamily.get("official_ai_labs_and_model_providers").active_source_count, 10);
  assert.equal(byFamily.get("official_ai_labs_and_model_providers").items_admitted, 2);
  assert.equal(byFamily.get("official_commerce_platforms_and_developer_changelogs").items_admitted, 1);
  assert.equal(byFamily.get("official_martech_and_ecommerce_vendors").active_source_count, 9);
  assert.equal(byFamily.get("website_pattern_panel").active_source_count, 0);
  for (const family of receipt.per_family) {
    assert.equal(family.gap_status, SEED_FAMILY_GAP_STATUS[family.source_family]);
    assert.deepEqual(family.stale_sources, []);
    assert.deepEqual(family.silent_sources, []);
  }

  // REQ-1020: families with open gaps until SRC-002 are named blind spots. The
  // ring migration filled the martech gap; UX/perf and research rows are shadow.
  assert.deepEqual(receipt.known_blind_spots, [
    "ux_performance_accessibility_trust_experimentation",
    "primary_research_feeds",
    "website_pattern_panel"
  ]);
});

test("writeCoverageReceipt writes valid JSON beside run-manifest and emits the coverage event", async () => {
  const registry = await loadSourceRegistry(registryPath);
  const logRoot = await mkdtemp(path.join(os.tmpdir(), "newsletter-coverage-"));
  const now = new Date("2026-07-23T09:00:00Z");
  const telemetry = await startTelemetryRun({
    mode: "weekly",
    logRoot,
    runId: "weekly-coverage-run",
    stdout: null,
    now: () => now
  });

  const written = await writeCoverageReceipt({
    telemetry,
    registry,
    sourceResults: [{ sourceId: "vogue_business_ai", sourceName: "Vogue Business AI", status: "ok", itemCount: 2, durationMs: 10 }],
    acceptedItems: [{ sourceId: "vogue_business_ai" }],
    now,
    lookbackHours: 168
  });
  await telemetry.complete({ status: "completed", health: {}, summary: {} });

  assert.equal(written.file, COVERAGE_RECEIPT_FILENAME);
  assert.equal(path.dirname(written.path), telemetry.paths.runDirectory);

  const onDisk = JSON.parse(await readFile(written.path, "utf8"));
  assert.deepEqual(onDisk, written.receipt);
  assert.equal(onDisk.week_id, "2026-W30");
  assert.equal(onDisk.run_id, "weekly-coverage-run");
  assert.equal(onDisk.src002_status, "pending");
  assert.equal(onDisk.registry_completeness, "seed_only");
  assert.equal(onDisk.known_blind_spots.includes("website_pattern_panel"), true);

  const events = (await readFile(telemetry.paths.eventsPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const coverageEvent = events.find((event) => event.event === "coverage.receipt.written");
  assert.ok(coverageEvent, "coverage.receipt.written event must be in the run event stream");
  assert.equal(coverageEvent.component, "coverage");
  assert.equal(coverageEvent.status, "completed");
  assert.equal(coverageEvent.attributes.weekId, "2026-W30");
  assert.equal(coverageEvent.attributes.blindSpotCount, 3);

  const manifest = JSON.parse(await readFile(telemetry.paths.manifestPath, "utf8"));
  assert.equal(manifest.components.some((component) => component.name === "coverage"), true);
});

test("durable receipt keeps every per_source row past the 50-entry event-attribute cap (REQ-0923)", async () => {
  const registry = await loadSourceRegistry(registryPath);
  const logRoot = await mkdtemp(path.join(os.tmpdir(), "newsletter-coverage-cap-"));
  const now = new Date("2026-07-23T09:00:00Z");
  const telemetry = await startTelemetryRun({
    mode: "weekly",
    logRoot,
    runId: "weekly-coverage-cap-run",
    stdout: null,
    now: () => now
  });

  // Simulate the post-SRC-002 registry size (52 ranked rows plus panel rows): the
  // durable REC-COVERAGE record must not inherit the event-attribute array caps.
  const sourceResults = Array.from({ length: 60 }, (_, index) => ({
    sourceId: `future_source_${index}`,
    sourceName: `Future Source ${index}`,
    status: "ok",
    itemCount: 1,
    durationMs: 5
  }));

  const written = await writeCoverageReceipt({
    telemetry,
    registry,
    sourceResults,
    acceptedItems: [],
    now,
    lookbackHours: 168
  });
  await telemetry.complete({ status: "completed", health: {}, summary: {} });

  const onDisk = JSON.parse(await readFile(written.path, "utf8"));
  assert.equal(onDisk.per_source.length, 60);
  assert.deepEqual(
    onDisk.per_source.map((entry) => entry.source_record_id),
    sourceResults.map((result) => result.sourceId)
  );
  assert.equal(JSON.stringify(onDisk).includes("<truncated"), false);
});

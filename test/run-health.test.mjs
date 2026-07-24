import test from "node:test";
import assert from "node:assert/strict";

import { deriveRunHealth, shouldFailRun } from "../src/run-health.mjs";

test("all source failures are a failed pipeline, never a healthy empty newsletter", () => {
  const health = deriveRunHealth({
    sourceResults: [
      { status: "error" },
      { status: "error" }
    ],
    itemCount: 0,
    minReviewItems: 3
  });

  assert.equal(health.status, "failed");
  assert.equal(health.pipelineStatus, "failed");
  assert.equal(health.contentStatus, "empty_valid");
  assert.deepEqual(health.reasonCodes, ["all_sources_failed", "no_qualifying_items"]);
  assert.equal(shouldFailRun({ health }), true);
});

test("partial source failures degrade a usable run", () => {
  const health = deriveRunHealth({
    sourceResults: [{ status: "ok" }, { status: "error" }],
    itemCount: 4,
    minReviewItems: 3
  });

  assert.equal(health.status, "degraded");
  assert.equal(health.pipelineStatus, "degraded");
  assert.equal(health.contentStatus, "ready");
  assert.deepEqual(health.reasonCodes, ["partial_source_failure"]);
  assert.equal(shouldFailRun({ health }), false);
});

test("zero qualifying items can be valid content only when source collection succeeded", () => {
  const health = deriveRunHealth({
    sourceResults: [{ status: "ok" }, { status: "ok" }],
    itemCount: 0,
    minReviewItems: 3
  });

  assert.equal(health.status, "healthy");
  assert.equal(health.pipelineStatus, "healthy");
  assert.equal(health.contentStatus, "empty_valid");
  assert.deepEqual(health.reasonCodes, ["no_qualifying_items"]);
});

test("intentional scheduler skips are distinct from pipeline and content health", () => {
  const health = deriveRunHealth({ skippedReason: "outside_target_window" });
  assert.deepEqual(health, {
    status: "skipped",
    pipelineStatus: "skipped",
    contentStatus: "not_evaluated",
    deploymentStatus: "not_evaluated",
    liveStatus: "not_evaluated",
    reasonCodes: ["outside_target_window"]
  });
});

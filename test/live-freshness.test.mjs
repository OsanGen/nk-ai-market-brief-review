import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateLiveFreshness,
  getLiveFreshness,
  localHour,
  shouldRunScheduledRefresh
} from "../src/live-freshness.mjs";

const freshRun = {
  generatedAt: "2026-07-15T08:04:00.000Z",
  mode: "auto",
  config: { activeLookbackHours: 36 },
  automationConfigured: true,
  send: { sent: false }
};

test("Summer 4 a.m. Eastern maps to 08:xx UTC and runs when stale", () => {
  const now = new Date("2026-07-15T08:02:00.000Z");
  assert.equal(localHour(now, "America/New_York"), 4);
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: false, reason: "stale_generated_date" },
    now,
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, true);
});

test("Winter 4 a.m. Eastern maps to 09:xx UTC and runs when stale", () => {
  const now = new Date("2026-01-15T09:02:00.000Z");
  assert.equal(localHour(now, "America/New_York"), 4);
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: false, reason: "stale_generated_date" },
    now,
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, true);
});

test("Early wrong-season 3 a.m. run skips if live page is already fresh", () => {
  const now = new Date("2026-01-15T08:02:00.000Z");
  assert.equal(localHour(now, "America/New_York"), 3);
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: true, reason: "fresh" },
    now,
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, false);
  assert.equal(decision.reason, "live_already_fresh");
});

test("Early wrong-season 3 a.m. run skips before target hour", () => {
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: false, reason: "stale_generated_date" },
    now: new Date("2026-01-15T08:02:00.000Z"),
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, false);
  assert.equal(decision.reason, "before_target_hour");
});

test("Watchdog run refreshes if live page is stale", () => {
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: false, reason: "stale_generated_date" },
    now: new Date("2026-07-15T10:17:00.000Z"),
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, true);
});

test("Watchdog run skips if live page is fresh", () => {
  const decision = shouldRunScheduledRefresh({
    freshness: { fresh: true, reason: "fresh" },
    now: new Date("2026-07-15T10:17:00.000Z"),
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(decision.shouldRun, false);
});

test("Live freshness rejects preview-mode output", () => {
  const result = evaluateLiveFreshness(
    { ...freshRun, mode: "preview" },
    { now: new Date("2026-07-15T12:00:00.000Z"), timezone: "America/New_York" }
  );
  assert.equal(result.fresh, false);
  assert.equal(result.reason, "not_auto_mode");
});

test("Live freshness fetch fails open after target hour", async () => {
  const freshness = await getLiveFreshness({
    now: new Date("2026-07-15T10:17:00.000Z"),
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  const decision = shouldRunScheduledRefresh({
    freshness,
    now: new Date("2026-07-15T10:17:00.000Z"),
    timezone: "America/New_York",
    targetHourLocal: 4
  });
  assert.equal(freshness.reason, "fetch_failed");
  assert.equal(decision.shouldRun, true);
});

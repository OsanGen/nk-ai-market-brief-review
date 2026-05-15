import test from "node:test";
import assert from "node:assert/strict";

import { isTargetWindow, shouldRunScheduledSend } from "../src/time-guard.mjs";

const config = { timezone: "America/New_York", targetHourLocal: 4 };

test("Time guard allows 4 a.m. America/New_York", () => {
  assert.equal(isTargetWindow(new Date("2026-05-08T08:17:00Z"), config), true);
  assert.equal(shouldRunScheduledSend(new Date("2026-05-08T08:17:00Z"), config), true);
});

test("Time guard allows weekend daily refresh hour", () => {
  assert.equal(isTargetWindow(new Date("2026-05-09T08:17:00Z"), config), true);
});

test("Time guard skips non-target hour", () => {
  assert.equal(isTargetWindow(new Date("2026-05-08T12:17:00Z"), config), false);
});

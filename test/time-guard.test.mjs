import test from "node:test";
import assert from "node:assert/strict";

import { isTargetWindow, shouldRunScheduledSend } from "../src/time-guard.mjs";

const config = { timezone: "America/New_York", targetHourLocal: 8 };

test("Time guard allows 8 a.m. America/New_York weekday", () => {
  assert.equal(isTargetWindow(new Date("2026-05-08T12:17:00Z"), config), true);
  assert.equal(shouldRunScheduledSend(new Date("2026-05-08T12:17:00Z"), config), true);
});

test("Time guard skips weekend", () => {
  assert.equal(isTargetWindow(new Date("2026-05-09T12:17:00Z"), config), false);
});

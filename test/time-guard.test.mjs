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

test("Time guard allows 4 a.m. Eastern in standard time (EST, 09:xx UTC)", () => {
  // January is EST (UTC-5), so 4 a.m. local == 09:xx UTC. A hardcoded UTC-4 offset
  // would fire at the wrong hour; this locks the DST/standard boundary.
  assert.equal(isTargetWindow(new Date("2026-01-15T09:17:00Z"), config), true);
  assert.equal(shouldRunScheduledSend(new Date("2026-01-15T09:17:00Z"), config), true);
});

test("Time guard rejects 08:xx UTC in standard time (that is 3 a.m. EST, not 4)", () => {
  assert.equal(isTargetWindow(new Date("2026-01-15T08:17:00Z"), config), false);
});

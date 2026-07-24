import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.mjs";

test("Review lookback uses 168 hours in preview mode", () => {
  const config = loadConfig({}, new Date("2026-05-08T12:00:00Z"), { mode: "preview" });
  assert.equal(config.reviewLookbackHours, 168);
  assert.equal(config.activeLookbackHours, 168);
});

test("Scheduled auto mode keeps daily lookback", () => {
  const friday = loadConfig({}, new Date("2026-05-08T12:00:00Z"), { mode: "auto" });
  const monday = loadConfig({}, new Date("2026-05-11T12:00:00Z"), { mode: "auto" });
  assert.equal(friday.targetHourLocal, 4);
  assert.equal(friday.activeLookbackHours, 36);
  assert.equal(monday.activeLookbackHours, 84);
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STACK_PROFILE_PATH,
  describeStackProfile,
  loadStackProfile,
  relevanceTermGroups,
  validateStackProfile
} from "../src/stack-profile.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("the committed stack profile loads, is read-only sourced, and pins a commit", async () => {
  const profile = await loadStackProfile(path.join(projectRoot, STACK_PROFILE_PATH));
  assert.equal(profile.schema_version, 1);
  assert.equal(profile.source.repo, "MaisonMeta/NormaKamali");
  assert.equal(profile.source.access, "read_only");
  assert.match(profile.source.commit, /^[0-9a-f]{40}$/);
});

test("core Norma capabilities are present for relevance scoring", async () => {
  const profile = await loadStackProfile(path.join(projectRoot, STACK_PROFILE_PATH));
  const ids = profile.capabilities.map((capability) => capability.id);
  for (const required of [
    "ai_stylist_conversational_commerce",
    "voice_commerce",
    "virtual_try_on_image_gen",
    "headless_shopify",
    "personalization_client_memory",
    "google_gemini"
  ]) {
    assert.ok(ids.includes(required), `missing capability ${required}`);
  }
});

test("relevance term groups flatten to lowercase terms", async () => {
  const profile = await loadStackProfile(path.join(projectRoot, STACK_PROFILE_PATH));
  const groups = relevanceTermGroups(profile);
  assert.ok(groups.length >= 6);
  for (const group of groups) {
    assert.ok(group.terms.length > 0);
    assert.ok(group.terms.every((term) => term === term.toLowerCase()));
  }
});

test("the profile summary is compact and redaction-safe", async () => {
  const profile = await loadStackProfile(path.join(projectRoot, STACK_PROFILE_PATH));
  const summary = describeStackProfile(profile);
  assert.equal(summary.sourceCommit.length, 12);
  assert.equal(summary.capabilityCount, profile.capabilities.length);
});

test("the committed profile contains no secret-shaped values", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path.join(projectRoot, STACK_PROFILE_PATH), "utf8");
  assert.doesNotMatch(raw, /(sk|re|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{12,}/);
  assert.doesNotMatch(raw, /AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-/);
  assert.doesNotMatch(raw, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(raw, /ACCESS_TOKEN|SERVICE_ROLE|API_KEY/);
});

test("validation fails closed on a broken profile", () => {
  assert.throws(() => validateStackProfile({ schema_version: 2 }), /schema_version/);
  assert.throws(() => validateStackProfile({
    schema_version: 1, profile_version: "1.0.0", generated_at: "2026-07-24",
    source: { repo: "x/y", commit: "abc", access: "read_write" },
    capabilities: [{ id: "a", label: "A", why: "w", terms: ["t"] }]
  }), /read_only/);
});

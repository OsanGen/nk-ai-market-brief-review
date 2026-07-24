import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODEL_REGISTRY_PATH,
  PRIMARY_REASONING_MODEL,
  REASONING_ROLES,
  describeModelPolicy,
  loadModelRegistry,
  resolveModel,
  validateModelRegistry
} from "../src/model-registry.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function loadRaw() {
  return JSON.parse(await readFile(path.join(projectRoot, MODEL_REGISTRY_PATH), "utf8"));
}

test("the canonical registry loads and is schema v1", async () => {
  const registry = await loadModelRegistry(path.join(projectRoot, MODEL_REGISTRY_PATH));
  assert.equal(registry.schema_version, 1);
  assert.equal(typeof registry.registry_version, "string");
});

test("every reasoning role binds claude-opus-4-8 as primary (not the fallback tiers)", async () => {
  const registry = await loadModelRegistry(path.join(projectRoot, MODEL_REGISTRY_PATH));
  assert.equal(PRIMARY_REASONING_MODEL, "claude-opus-4-8");
  for (const role of REASONING_ROLES) {
    const { primary } = resolveModel(registry, role);
    assert.equal(primary, "claude-opus-4-8", `${role} primary must be Opus 4.8`);
    assert.notEqual(primary, "claude-haiku-4-5");
    assert.notEqual(primary, "claude-sonnet-5");
  }
});

test("Sonnet 5 and Haiku 4.5 appear only as fallbacks", async () => {
  const registry = await loadModelRegistry(path.join(projectRoot, MODEL_REGISTRY_PATH));
  assert.deepEqual(resolveModel(registry, "public_semantic_parser").fallbacks, [
    "claude-sonnet-5",
    "claude-haiku-4-5"
  ]);
  assert.deepEqual(resolveModel(registry, "private_finalist_reviewer").fallbacks, ["claude-sonnet-5"]);
  assert.deepEqual(resolveModel(registry, "private_adversarial_reviewer").fallbacks, ["claude-sonnet-5"]);
});

test("prohibited private-context models are declared and never bound to a private role", async () => {
  const registry = await loadModelRegistry(path.join(projectRoot, MODEL_REGISTRY_PATH));
  assert.ok(registry.prohibited_for_private_context.includes("claude-fable-5"));
  assert.ok(registry.prohibited_for_private_context.includes("claude-mythos-5"));
});

test("the model policy descriptor logs Opus 4.8 as primary and marks the lane planned/inactive", async () => {
  const registry = await loadModelRegistry(path.join(projectRoot, MODEL_REGISTRY_PATH));
  const policy = describeModelPolicy(registry);
  assert.equal(policy.primaryReasoningModel, "claude-opus-4-8");
  assert.equal(policy.laneActive, false);
  assert.equal(policy.status, "planned");
  assert.match(policy.authoritySpec, /MODEL_QUALITY_UPGRADE/);
});

test("validation REJECTS a reasoning role primary set to a weaker model", async () => {
  const raw = await loadRaw();
  raw.roles.public_semantic_parser.primary = "claude-haiku-4-5";
  assert.throws(() => validateModelRegistry(raw), /must be "claude-opus-4-8"/);
});

test("validation rejects a role primary that is not defined in models", async () => {
  const raw = await loadRaw();
  raw.roles.private_finalist_reviewer.primary = "gpt-4o";
  assert.throws(() => validateModelRegistry(raw), /not defined in models|must be "claude-opus-4-8"/);
});

test("validation rejects binding a prohibited model to a private-context role", async () => {
  const raw = await loadRaw();
  raw.models["claude-mythos-5"] = {
    provider: "anthropic",
    model_id: "claude-mythos-5",
    retention_class: "standard_not_zdr",
    structured_output_supported: true,
    input_price_per_million_usd: 1,
    output_price_per_million_usd: 1
  };
  raw.roles.private_finalist_reviewer.fallbacks = ["claude-mythos-5"];
  assert.throws(() => validateModelRegistry(raw), /prohibited model/);
});

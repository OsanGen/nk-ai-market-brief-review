import { readFile } from "node:fs/promises";
import path from "node:path";

// Norma stack-profile loader (REC-REPO-SNAPSHOT-lite).
// config/norma-stack-profile.json is a deterministic, sanitized snapshot of what
// the MaisonMeta/NormaKamali platform actually runs (vendors, capabilities, and
// the terms that make a news story *Norma-relevant*). It is generated locally
// from a read-only scan and committed, so CI can consume it without repo access.
// Validation style matches src/source-registry.mjs: per-field checks, fail closed.

export const STACK_PROFILE_PATH = "config/norma-stack-profile.json";
export const STACK_PROFILE_SCHEMA_VERSION = 1;

export async function loadStackProfile(filePath = STACK_PROFILE_PATH) {
  const fullPath = path.resolve(filePath);
  let payload;
  try {
    payload = JSON.parse(await readFile(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`stack profile ${filePath} could not be read or parsed: ${error.message}`);
  }
  return validateStackProfile(payload);
}

export function validateStackProfile(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("stack profile must be a JSON object");
  }
  if (payload.schema_version !== STACK_PROFILE_SCHEMA_VERSION) {
    throw new Error(
      `stack profile schema_version must be ${STACK_PROFILE_SCHEMA_VERSION}, got ${JSON.stringify(payload.schema_version)}`
    );
  }
  assertString(payload.profile_version, "profile_version");
  assertString(payload.generated_at, "generated_at");

  const source = payload.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("stack profile source must be an object");
  }
  assertString(source.repo, "source.repo");
  assertString(source.commit, "source.commit");
  if (source.access !== "read_only") {
    throw new Error('stack profile source.access must be "read_only"');
  }

  if (!Array.isArray(payload.capabilities) || payload.capabilities.length === 0) {
    throw new Error("stack profile must contain a non-empty capabilities array");
  }
  const seen = new Set();
  for (const [index, capability] of payload.capabilities.entries()) {
    const label = (field) => `capabilities[${index}].${field}`;
    if (!capability || typeof capability !== "object") {
      throw new Error(`capabilities[${index}] must be an object`);
    }
    assertString(capability.id, label("id"));
    if (seen.has(capability.id)) {
      throw new Error(`${label("id")} "${capability.id}" is a duplicate`);
    }
    seen.add(capability.id);
    assertString(capability.label, label("label"));
    assertString(capability.why, label("why"));
    if (!Array.isArray(capability.terms) || capability.terms.length === 0
      || !capability.terms.every((term) => typeof term === "string" && term.trim())) {
      throw new Error(`${label("terms")} must be a non-empty array of non-empty strings`);
    }
  }
  return payload;
}

// Flattened term groups for the scorer: [{id, label, terms}] with lowercase terms.
export function relevanceTermGroups(profile) {
  return profile.capabilities.map((capability) => ({
    id: capability.id,
    label: capability.label,
    terms: capability.terms.map((term) => term.toLowerCase())
  }));
}

// Small, redaction-safe summary for logs and the public run receipt.
export function describeStackProfile(profile) {
  return {
    profileVersion: profile.profile_version,
    generatedAt: profile.generated_at,
    sourceRepo: profile.source.repo,
    sourceCommit: String(profile.source.commit).slice(0, 12),
    capabilityCount: profile.capabilities.length,
    capabilityIds: profile.capabilities.map((capability) => capability.id)
  };
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

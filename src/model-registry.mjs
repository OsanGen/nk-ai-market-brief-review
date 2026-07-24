import { readFile } from "node:fs/promises";
import path from "node:path";

// Model registry loader (REC-MODEL, spec section 17.5).
// This is the single source of truth for model-role bindings. It follows the
// same fail-closed validation style as src/source-registry.mjs: per-field checks,
// throw on any invalid shape, precise error messages.
//
// The AUTHORITATIVE policy (docs/NORMA_WEEKLY_AI_MODEL_QUALITY_UPGRADE.md) binds
// every reasoning role to claude-opus-4-8 as primary, with Sonnet 5 -> Haiku 4.5
// as fallbacks only. REQ-ROUTE-015 forbids hardcoding a model id in domain logic:
// callers MUST resolve a model by role through this registry.

export const MODEL_REGISTRY_PATH = "config/model-registry.json";
export const MODEL_REGISTRY_SCHEMA_VERSION = 1;

// The three reasoning roles that MUST run on the primary reasoning model. The
// optional public_web_discovery role is deliberately excluded (it is a discovery
// helper on Sonnet, never a reasoning stage).
export const REASONING_ROLES = Object.freeze([
  "public_semantic_parser",
  "private_finalist_reviewer",
  "private_adversarial_reviewer"
]);

// The one and only primary reasoning model. This is the lock the user asked for:
// no run may bind a weaker model to a reasoning role.
export const PRIMARY_REASONING_MODEL = "claude-opus-4-8";

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
export const DATA_CLASSES = ["public_only", "minimum_required_internal_metadata"];
export const RETENTION_CLASSES = ["standard_not_zdr", "zdr_verified", "unknown"];

export async function loadModelRegistry(filePath = MODEL_REGISTRY_PATH) {
  const fullPath = path.resolve(filePath);
  let payload;
  try {
    payload = JSON.parse(await readFile(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`model registry ${filePath} could not be read or parsed: ${error.message}`);
  }
  return validateModelRegistry(payload);
}

export function validateModelRegistry(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("model registry must be a JSON object");
  }
  if (payload.schema_version !== MODEL_REGISTRY_SCHEMA_VERSION) {
    throw new Error(
      `model registry schema_version must be ${MODEL_REGISTRY_SCHEMA_VERSION}, got ${JSON.stringify(payload.schema_version)}`
    );
  }
  assertString(payload.registry_version, "registry_version");

  const authority = payload.authority;
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    throw new Error("model registry authority must be an object");
  }
  assertString(authority.primary_spec, "authority.primary_spec");

  const laneStatus = payload.lane_status;
  if (!laneStatus || typeof laneStatus !== "object" || Array.isArray(laneStatus)) {
    throw new Error("model registry lane_status must be an object");
  }
  if (typeof laneStatus.active !== "boolean") {
    throw new Error("model registry lane_status.active must be a boolean");
  }
  assertString(laneStatus.status, "lane_status.status");

  assertStringArray(payload.prohibited_for_private_context, "prohibited_for_private_context", {
    allowEmpty: true
  });

  const models = payload.models;
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    throw new Error("model registry models must be an object keyed by model id");
  }
  const modelIds = Object.keys(models);
  if (modelIds.length === 0) {
    throw new Error("model registry models must contain at least one model");
  }
  for (const modelId of modelIds) {
    validateModel(models[modelId], modelId);
  }

  const roles = payload.roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) {
    throw new Error("model registry roles must be an object keyed by role name");
  }
  const prohibited = new Set(payload.prohibited_for_private_context);
  for (const [roleName, role] of Object.entries(roles)) {
    validateRole(role, roleName, modelIds, prohibited);
  }

  // The core invariant: every reasoning role binds to the primary reasoning model.
  // This is what prevents a regression to a weaker "fallback" model as primary.
  for (const roleName of REASONING_ROLES) {
    const role = roles[roleName];
    if (!role) {
      throw new Error(`model registry roles.${roleName} is required (reasoning role missing)`);
    }
    if (role.primary !== PRIMARY_REASONING_MODEL) {
      throw new Error(
        `model registry roles.${roleName}.primary must be "${PRIMARY_REASONING_MODEL}" ` +
        `(the authoritative reasoning model per ${authority.primary_spec}); got ${JSON.stringify(role.primary)}. ` +
        `Sonnet 5 / Haiku 4.5 may appear only as fallbacks.`
      );
    }
  }

  return payload;
}

function validateModel(model, modelId) {
  const label = (field) => `models.${modelId}.${field}`;
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    throw new Error(`models.${modelId} must be an object`);
  }
  assertString(model.provider, label("provider"));
  assertString(model.model_id, label("model_id"));
  assertEnum(model.retention_class, RETENTION_CLASSES, label("retention_class"));
  if (typeof model.structured_output_supported !== "boolean") {
    throw new Error(`${label("structured_output_supported")} must be a boolean`);
  }
  for (const key of ["input_price_per_million_usd", "output_price_per_million_usd"]) {
    if (typeof model[key] !== "number" || model[key] < 0) {
      throw new Error(`${label(key)} must be a non-negative number`);
    }
  }
}

function validateRole(role, roleName, modelIds, prohibited) {
  const label = (field) => `roles.${roleName}.${field}`;
  if (!role || typeof role !== "object" || Array.isArray(role)) {
    throw new Error(`roles.${roleName} must be an object`);
  }
  assertString(role.primary, label("primary"));
  if (!modelIds.includes(role.primary)) {
    throw new Error(`${label("primary")} "${role.primary}" is not defined in models`);
  }
  assertStringArray(role.fallbacks, label("fallbacks"), { allowEmpty: true });
  for (const fallback of role.fallbacks) {
    if (!modelIds.includes(fallback)) {
      throw new Error(`${label("fallbacks")} references "${fallback}" which is not defined in models`);
    }
  }
  assertEnum(role.effort, EFFORT_LEVELS, label("effort"));
  assertEnum(role.data_classification, DATA_CLASSES, label("data_classification"));

  // A prohibited (non-ZDR) model must never bind to a role that can see private
  // context (spec section 2 covered_models). Public-only roles may still not use
  // them here because none are declared, but we enforce the private case strictly.
  if (role.data_classification === "minimum_required_internal_metadata") {
    for (const id of [role.primary, ...role.fallbacks]) {
      if (prohibited.has(id)) {
        throw new Error(
          `${label("primary/fallbacks")} binds prohibited model "${id}" to a private-context role; ` +
          `prohibited_for_private_context models require 30-day retention and are not ZDR-eligible`
        );
      }
    }
  }
}

// Resolve the model chain for a role (REQ-ROUTE-015 role resolution).
export function resolveModel(registry, roleName) {
  const role = registry?.roles?.[roleName];
  if (!role) {
    throw new Error(`unknown model role "${roleName}"`);
  }
  return { primary: role.primary, fallbacks: [...role.fallbacks] };
}

// Compact, redaction-safe policy descriptor for logging / the public run receipt.
// Deliberately fixes primaryReasoningModel to the locked constant so the value
// that lands in logs and site/run.json is unambiguous.
export function describeModelPolicy(registry) {
  const roles = {};
  for (const [roleName, role] of Object.entries(registry.roles)) {
    roles[roleName] = { primary: role.primary, fallbacks: [...role.fallbacks] };
  }
  return {
    status: registry.lane_status.status,
    laneActive: registry.lane_status.active,
    registryVersion: registry.registry_version,
    authoritySpec: registry.authority.primary_spec,
    overlayVersion: registry.authority.overlay_version ?? "",
    primaryReasoningModel: PRIMARY_REASONING_MODEL,
    reasoningRoles: [...REASONING_ROLES],
    roles,
    prohibitedForPrivateContext: [...registry.prohibited_for_private_context],
    budgetUsd: registry.budget_usd ?? {}
  };
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(value)})`);
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    throw new Error(`${label} must be a${allowEmpty ? "n" : " non-empty"} array of non-empty strings`);
  }
}

import { readFile } from "node:fs/promises";
import path from "node:path";

// Source registry v2 loader (spec section 10, REC-SOURCE / source-record.schema.json).
// Extends the validation style of the legacy loader in src/sources.mjs (REQ-0913, REQ-1001):
// per-field checks, fail-closed on any invalid row (REQ-1002), precise error naming the row.

export const SOURCE_REGISTRY_PATH = "config/source-registry.json";
export const SOURCE_REGISTRY_SCHEMA_VERSION = 2;

// Canonical enums (spec section 9; defined once there, mirrored here for validation).
export const SOURCE_ROLES = [
  "official_authority",
  "independent_reporting",
  "vendor_signal",
  "primary_research",
  "website_pattern"
];
export const AUTHORITY_TIERS = ["a", "b", "c", "d"];
export const SOURCE_FAMILIES = [
  "official_ai_labs_and_model_providers",
  "official_commerce_platforms_and_developer_changelogs",
  "official_martech_and_ecommerce_vendors",
  "independent_retail_ecommerce_fashion_reporting",
  "ux_performance_accessibility_trust_experimentation",
  "primary_research_feeds",
  "website_pattern_panel"
];
export const COMMERCIAL_BIAS_CLASSES = [
  "none_declared",
  "vendor_interest",
  "sponsored",
  "affiliate",
  "unknown"
];
export const SOURCE_STATUSES = ["proposed", "shadow", "active", "paused", "retired"];
export const SOURCE_WAVES = ["p0", "p1", "p2", "seed"];
export const INTAKE_METHODS = [
  "rss",
  "mixed",
  "changelog",
  "page",
  "public_api",
  "research_feed",
  "website_observation"
];
export const ACCESS_CLASSES = ["public_feed", "public_page", "public_api"];
export const SRC002_STATUSES = ["pending", "available"];
// Ring model (SOURCE_RINGS overlay): optional per-row field, additive expand-contract.
export const SOURCE_RINGS = ["core", "extended", "discovery"];

// Health-policy defaults (spec 10.6; freshness defaults of 9.6).
export const HEALTH_POLICY_DEFAULTS = Object.freeze({
  poll_cadence: "daily",
  stale_after_hours: 168,
  silent_after_days: 30,
  consecutive_failure_pause_threshold: 10
});
export const POLL_CADENCES = ["daily", "weekly"];

const RECORD_ID = /^[a-z][a-z0-9_]{0,127}$/;
const GATE_ID = /^GATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

// REQ-1008: at most 40 active rows whose intake_method is not website_observation.
export const MAX_ACTIVE_NON_PANEL_SOURCES = 40;

export async function loadSourceRegistry(filePath = SOURCE_REGISTRY_PATH) {
  const fullPath = path.resolve(filePath);
  let payload;
  try {
    payload = JSON.parse(await readFile(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`source registry ${filePath} could not be read or parsed: ${error.message}`);
  }
  return validateRegistry(payload);
}

export function validateRegistry(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("source registry must be a JSON object");
  }
  if (payload.schema_version !== SOURCE_REGISTRY_SCHEMA_VERSION) {
    throw new Error(
      `source registry schema_version must be ${SOURCE_REGISTRY_SCHEMA_VERSION}, got ${JSON.stringify(payload.schema_version)}`
    );
  }
  assertString(payload.registry_version, "registry_version");
  assertEnum(payload.src002_status, SRC002_STATUSES, "src002_status");
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) {
    throw new Error("source registry must contain a non-empty sources array");
  }

  const seen = new Set();
  const sources = payload.sources.map((row, index) => {
    const validated = validateRow(row, index);
    if (seen.has(validated.record_id)) {
      throw new Error(`source[${index}].record_id "${validated.record_id}" is a duplicate; record_id must be unique`);
    }
    seen.add(validated.record_id);
    return validated;
  });

  const activeNonPanel = sources.filter(
    (row) => row.status === "active" && row.intake_method !== "website_observation"
  ).length;
  if (activeNonPanel > MAX_ACTIVE_NON_PANEL_SOURCES) {
    throw new Error(
      `source registry has ${activeNonPanel} active non-website_observation rows; REQ-1008 caps this at ${MAX_ACTIVE_NON_PANEL_SOURCES}`
    );
  }

  return {
    schema_version: payload.schema_version,
    registry_version: payload.registry_version,
    src002_status: payload.src002_status,
    sources
  };
}

function validateRow(row, index) {
  const prefix = `source[${index}]`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`${prefix} must be an object`);
  }
  const label = (field) => `${prefix}${row.record_id ? ` (${row.record_id})` : ""}.${field}`;

  if (row.schema_version !== SOURCE_REGISTRY_SCHEMA_VERSION) {
    throw new Error(`${label("schema_version")} must be ${SOURCE_REGISTRY_SCHEMA_VERSION}`);
  }
  assertString(row.record_id, label("record_id"));
  if (!RECORD_ID.test(row.record_id)) {
    throw new Error(`${label("record_id")} must be lower_snake_case ASCII (got "${row.record_id}")`);
  }
  assertEnum(row.status, SOURCE_STATUSES, label("status"));
  assertIsoDate(row.created_at, label("created_at"));
  if (row.updated_at !== undefined && row.updated_at !== null) {
    assertIsoDate(row.updated_at, label("updated_at"));
  }
  assertString(row.producer_version, label("producer_version"));
  assertStringArray(row.source_refs, label("source_refs"));
  if (typeof row.confidence !== "number" || row.confidence < 0 || row.confidence > 1) {
    throw new Error(`${label("confidence")} must be a number between 0 and 1`);
  }
  assertString(row.display_name, label("display_name"));
  assertEnum(row.source_role, SOURCE_ROLES, label("source_role"));
  assertEnum(row.authority_tier, AUTHORITY_TIERS, label("authority_tier"));
  assertEnum(row.source_family, SOURCE_FAMILIES, label("source_family"));
  assertEnum(row.commercial_bias_class, COMMERCIAL_BIAS_CLASSES, label("commercial_bias_class"));
  assertEnum(row.activation_wave, SOURCE_WAVES, label("activation_wave"));
  if (row.rank !== null && (!Number.isInteger(row.rank) || row.rank < 1)) {
    throw new Error(`${label("rank")} must be an integer >= 1 or null`);
  }
  if (row.activation_wave === "seed" && row.rank !== null) {
    throw new Error(`${label("rank")} must be null for seed rows until SRC-002 re-ranking (REQ-1019)`);
  }
  assertString(row.inclusion_reason, label("inclusion_reason"));
  assertStringArray(row.claim_scope, label("claim_scope"));
  assertEnum(row.intake_method, INTAKE_METHODS, label("intake_method"));
  const intakeConfig = validateIntakeConfig(row, label);
  if (row.legacy_weight !== undefined && row.legacy_weight !== null && typeof row.legacy_weight !== "number") {
    throw new Error(`${label("legacy_weight")} must be a number or null`);
  }
  assertStringArray(row.categories, label("categories"), { allowEmpty: true });
  // Activation discipline (spec 10.2, REQ-1009): activation_gate is null only for
  // seed rows; every other wave must name the GATE- id that governs its activation,
  // and activation evidence must be a machine-checkable gate pass record.
  if (row.activation_gate === null) {
    if (row.activation_wave !== "seed") {
      throw new Error(
        `${label("activation_gate")} may be null only for seed rows (spec 10.2); wave "${row.activation_wave}" rows must name a GATE- id`
      );
    }
  } else if (typeof row.activation_gate !== "string" || !GATE_ID.test(row.activation_gate)) {
    throw new Error(`${label("activation_gate")} must be a GATE- id (e.g. GATE-SOURCE-SMOKE) or null`);
  }
  const activationEvidence = validateActivationEvidence(row, label);
  const healthPolicy = validateHealthPolicy(row.health_policy, label);
  const caps = validateCaps(row.caps, label);
  assertEnum(row.access_class, ACCESS_CLASSES, label("access_class"));
  if (row.source_ring !== undefined && row.source_ring !== null) {
    assertEnum(row.source_ring, SOURCE_RINGS, label("source_ring"));
  }

  return {
    ...row,
    legacy_weight: row.legacy_weight ?? null,
    activation_evidence: activationEvidence,
    intake_config: intakeConfig,
    health_policy: healthPolicy,
    caps
  };
}

// REQ-1009: when present, activation_evidence must be a structured gate pass record
// (gate_id, passed_at, evidence_refs), and non-seed active rows must carry one.
function validateActivationEvidence(row, label) {
  const evidence = row.activation_evidence ?? null;
  if (evidence === null) {
    if (row.activation_wave !== "seed" && row.status === "active") {
      throw new Error(`${label("activation_evidence")} is required for non-seed active rows (REQ-1009)`);
    }
    return null;
  }
  if (typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(
      `${label("activation_evidence")} must be an object with gate_id, passed_at, evidence_refs (REQ-1009)`
    );
  }
  assertString(evidence.gate_id, label("activation_evidence.gate_id"));
  if (!GATE_ID.test(evidence.gate_id)) {
    throw new Error(`${label("activation_evidence.gate_id")} must be a GATE- id (e.g. GATE-SOURCE-SMOKE)`);
  }
  assertIsoDate(evidence.passed_at, label("activation_evidence.passed_at"));
  assertStringArray(evidence.evidence_refs, label("activation_evidence.evidence_refs"));
  return evidence;
}

function validateIntakeConfig(row, label) {
  const config = row.intake_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${label("intake_config")} must be an object`);
  }
  if (config.aggregator !== undefined) {
    if (config.aggregator !== "google_news_rss") {
      throw new Error(`${label("intake_config.aggregator")} must be "google_news_rss" when present`);
    }
    if (config.per_item_authority_resolution !== true) {
      throw new Error(
        `${label("intake_config.per_item_authority_resolution")} must be true for aggregator-backed rows (REQ-0916)`
      );
    }
    assertString(config.query, label("intake_config.query"));
  } else if (row.intake_method === "rss") {
    const feedUrl = config.feed_url ?? config.query;
    if (typeof feedUrl !== "string" || !feedUrl.trim()) {
      throw new Error(`${label("intake_config")} must carry feed_url or query for intake_method "rss"`);
    }
  } else if (row.intake_method === "page") {
    // Spec 10.2: intake_config is method-specific; a page row without page_url is unfetchable
    // (and REQ-0915's page-justification rule needs the URL to be enforceable).
    assertString(config.page_url, label("intake_config.page_url"));
  } else if (row.intake_method === "public_api") {
    assertString(config.api_endpoint, label("intake_config.api_endpoint"));
  } else if (row.intake_method === "website_observation") {
    // REQ-1106: panel rows enumerate their observable surfaces explicitly.
    if (!Array.isArray(config.surfaces) || config.surfaces.length === 0) {
      throw new Error(`${label("intake_config.surfaces")} must be a non-empty array of surfaces (REQ-1106)`);
    }
  } else {
    // changelog, research_feed, mixed: no dedicated adapter yet (P2, REQ-0914) — fail
    // closed unless the row names at least one concrete intake target.
    const targets = [config.feed_url, config.page_url, config.api_endpoint, config.query];
    if (!targets.some((value) => typeof value === "string" && value.trim())) {
      throw new Error(
        `${label("intake_config")} must carry feed_url, page_url, api_endpoint, or query for intake_method "${row.intake_method}"`
      );
    }
  }
  if (config.homepage_url !== undefined && config.homepage_url !== null) {
    assertString(config.homepage_url, label("intake_config.homepage_url"));
  }
  if (config.per_item_authority_resolution !== undefined && typeof config.per_item_authority_resolution !== "boolean") {
    throw new Error(`${label("intake_config.per_item_authority_resolution")} must be a boolean`);
  }
  return { ...config };
}

function validateHealthPolicy(policy, label) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error(`${label("health_policy")} must be an object (10.6 defaults apply per absent key)`);
  }
  const merged = { ...HEALTH_POLICY_DEFAULTS, ...policy };
  if (!POLL_CADENCES.includes(merged.poll_cadence)) {
    throw new Error(`${label("health_policy.poll_cadence")} must be one of: ${POLL_CADENCES.join(", ")}`);
  }
  for (const key of ["stale_after_hours", "silent_after_days", "consecutive_failure_pause_threshold"]) {
    if (!Number.isInteger(merged[key]) || merged[key] < 1) {
      throw new Error(`${label(`health_policy.${key}`)} must be a positive integer`);
    }
  }
  return merged;
}

function validateCaps(caps, label) {
  if (!caps || typeof caps !== "object" || Array.isArray(caps)) {
    throw new Error(`${label("caps")} must be an object with max_items_per_run and max_items_per_week`);
  }
  for (const key of ["max_items_per_run", "max_items_per_week"]) {
    if (!Number.isInteger(caps[key]) || caps[key] < 1) {
      throw new Error(`${label(`caps.${key}`)} must be a positive integer`);
    }
  }
  return { ...caps };
}

// Adapter: project registry v2 rows into the exact legacy shape that src/sources.mjs
// callers consume today (id, name, mode, query, homepageUrl, weight, enabled, categories),
// so downstream fetch/score behavior is byte-identical (REQ-0913 legacy mode mapping).
export function toLegacySources(registry) {
  return registry.sources
    .filter((row) => row.intake_method === "rss")
    .map((row) => {
      const aggregated = row.intake_config.aggregator === "google_news_rss";
      return {
        id: row.record_id,
        name: row.display_name,
        mode: aggregated ? "google_news_rss" : "direct_rss",
        query: aggregated ? row.intake_config.query : (row.intake_config.feed_url ?? row.intake_config.query),
        homepageUrl: row.intake_config.homepage_url ?? null,
        weight: row.legacy_weight ?? 0,
        // P1: only active rows are fetched. REQ-1007 requires shadow rows to be fetched
        // and receipted while excluded from scoring/report; that needs fetch eligibility
        // (active|shadow) split from scoring eligibility (active only), which lands in P2
        // alongside the exclusion mechanism. Do not add shadow rows before that split.
        enabled: row.status === "active",
        categories: [...row.categories],
        // Ring + per-run item cap flow into fetch so per-publisher volume limits
        // (spec per-publisher caps) are enforced at intake, not just declared.
        ring: row.source_ring ?? null,
        maxItemsPerRun: row.caps.max_items_per_run
      };
    });
}

// Compact ring summary for logs and the public receipt.
export function summarizeRings(registry) {
  const summary = { total: registry.sources.length, active: 0, shadow: 0, rings: {} };
  for (const row of registry.sources) {
    if (row.status === "active") summary.active += 1;
    if (row.status === "shadow") summary.shadow += 1;
    const ring = row.source_ring ?? "unassigned";
    summary.rings[ring] = summary.rings[ring] ?? { total: 0, active: 0 };
    summary.rings[ring].total += 1;
    if (row.status === "active") summary.rings[ring].active += 1;
  }
  return summary;
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function assertIsoDate(value, label) {
  assertString(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO 8601 date string (got "${value}")`);
  }
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

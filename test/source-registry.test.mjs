import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_TIERS,
  COMMERCIAL_BIAS_CLASSES,
  HEALTH_POLICY_DEFAULTS,
  SOURCE_FAMILIES,
  SOURCE_ROLES,
  loadSourceRegistry,
  toLegacySources,
  validateRegistry
} from "../src/source-registry.mjs";
import { loadSources } from "../src/sources.mjs";

const registryPath = fileURLToPath(new URL("../config/source-registry.json", import.meta.url));
const legacyPath = fileURLToPath(new URL("../newsletter-sources.json", import.meta.url));

async function freshRegistryDocument() {
  return JSON.parse(await readFile(registryPath, "utf8"));
}

test("registry v2.1 loads the ring network: 57 rows, 40 active, every row valid", async () => {
  const registry = await loadSourceRegistry(registryPath);

  assert.equal(registry.schema_version, 2);
  assert.equal(registry.registry_version, "2.1.0");
  assert.equal(registry.src002_status, "pending");
  assert.equal(registry.sources.length, 57);

  const seedRows = registry.sources.filter((row) => row.activation_wave === "seed");
  const migratedRows = registry.sources.filter((row) => row.activation_wave !== "seed");
  assert.equal(seedRows.length, 12);
  assert.equal(migratedRows.length, 45);
  assert.equal(registry.sources.filter((row) => row.status === "active").length, 40);

  for (const row of registry.sources) {
    assert.equal(row.schema_version, 2);
    assert.equal(row.intake_method, "rss");
    assert.equal(row.intake_config.aggregator, "google_news_rss");
    assert.equal(row.intake_config.per_item_authority_resolution, true);
    assert.equal(SOURCE_ROLES.includes(row.source_role), true);
    assert.equal(AUTHORITY_TIERS.includes(row.authority_tier), true);
    assert.equal(SOURCE_FAMILIES.includes(row.source_family), true);
    assert.equal(COMMERCIAL_BIAS_CLASSES.includes(row.commercial_bias_class), true);
    assert.equal(["core", "extended", "discovery"].includes(row.source_ring), true);
    assert.equal(row.access_class, "public_feed");
  }
  for (const row of seedRows) {
    assert.equal(row.status, "active");
    assert.equal(row.rank, null);
    assert.equal(row.activation_gate, null);
    assert.deepEqual(row.health_policy, HEALTH_POLICY_DEFAULTS);
  }
  for (const row of migratedRows) {
    assert.equal(row.activation_gate, "GATE-SOURCE-SMOKE");
    assert.equal(Number.isInteger(row.rank) && row.rank >= 1, true);
    if (row.status === "active") {
      assert.equal(row.activation_evidence.gate_id, "GATE-SOURCE-SMOKE");
      assert.equal(row.activation_evidence.evidence_refs.length >= 1, true);
    } else {
      assert.equal(row.status, "shadow");
      assert.equal(row.activation_evidence, null);
    }
  }

  const byId = new Map(registry.sources.map((row) => [row.record_id, row]));
  assert.equal(byId.get("shopify_agentic_commerce").source_family, "official_commerce_platforms_and_developer_changelogs");
  assert.equal(byId.get("shopify_agentic_commerce").authority_tier, "a");
  assert.equal(byId.get("openai_commerce").source_family, "official_ai_labs_and_model_providers");
  assert.equal(byId.get("vogue_business_ai").source_role, "independent_reporting");
  assert.equal(byId.get("anthropic_news").source_ring, "core");
  // Klaviyo is in Norma's live stack; its scan lane must exist in the network.
  const klaviyoRow = registry.sources.find((row) => row.record_id.startsWith("klaviyo"));
  assert.ok(klaviyoRow, "expected a klaviyo scan lane in the registry");
  assert.equal(klaviyoRow.source_ring, "extended");
});

test("registry rejects an unsupported schema_version fail-closed", async () => {
  const doc = await freshRegistryDocument();
  doc.schema_version = 3;
  assert.throws(() => validateRegistry(doc), /schema_version must be 2/);
});

test("registry rejects a row with a missing required field, naming row and field", async () => {
  const doc = await freshRegistryDocument();
  delete doc.sources[0].source_role;
  assert.throws(
    () => validateRegistry(doc),
    /source\[0\] \(vogue_business_ai\)\.source_role/
  );
});

test("registry rejects a row with a bad enum value, naming row and field", async () => {
  const doc = await freshRegistryDocument();
  doc.sources[1].authority_tier = "platinum";
  assert.throws(
    () => validateRegistry(doc),
    /source\[1\] \(business_of_fashion_ai\)\.authority_tier must be one of: a, b, c, d/
  );
});

test("registry rejects duplicate record_id values", async () => {
  const doc = await freshRegistryDocument();
  doc.sources[2].record_id = doc.sources[0].record_id;
  assert.throws(() => validateRegistry(doc), /record_id "vogue_business_ai" is a duplicate/);
});

test("registry rejects an unknown status", async () => {
  const doc = await freshRegistryDocument();
  doc.sources[3].status = "enabled";
  assert.throws(
    () => validateRegistry(doc),
    /source\[3\] \(beautymatter_ai\)\.status must be one of: proposed, shadow, active, paused, retired/
  );
});

test("registry rejects aggregator rows without per_item_authority_resolution (REQ-0916)", async () => {
  const doc = await freshRegistryDocument();
  doc.sources[4].intake_config.per_item_authority_resolution = false;
  assert.throws(
    () => validateRegistry(doc),
    /per_item_authority_resolution.*must be true for aggregator-backed rows/
  );
});

function validActivationEvidence() {
  return {
    gate_id: "GATE-SOURCE-SMOKE",
    passed_at: "2026-07-23T00:00:00Z",
    evidence_refs: ["run:weekly-run-1"]
  };
}

test("registry rejects non-seed rows with a null activation_gate (fail-closed, spec 10.2)", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.activation_wave = "p1";
  row.activation_gate = null;
  row.activation_evidence = validActivationEvidence();
  assert.throws(
    () => validateRegistry(doc),
    /activation_gate.*may be null only for seed rows/
  );
});

test("registry rejects a malformed activation_gate id", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.activation_wave = "p1";
  row.activation_gate = "smoke-gate";
  row.activation_evidence = validActivationEvidence();
  assert.throws(() => validateRegistry(doc), /activation_gate.*must be a GATE- id/);
});

test("registry rejects non-object activation_evidence (REQ-1009)", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.activation_wave = "p1";
  row.activation_gate = "GATE-SOURCE-SMOKE";
  row.activation_evidence = "yes";
  assert.throws(
    () => validateRegistry(doc),
    /activation_evidence.*must be an object with gate_id, passed_at, evidence_refs/
  );
});

test("registry rejects activation_evidence with empty evidence_refs (REQ-1009)", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.activation_wave = "p1";
  row.activation_gate = "GATE-SOURCE-SMOKE";
  row.activation_evidence = { ...validActivationEvidence(), evidence_refs: [] };
  assert.throws(() => validateRegistry(doc), /activation_evidence\.evidence_refs/);
});

test("registry accepts a non-seed active row with a proper gate and evidence record", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.activation_wave = "p1";
  row.activation_gate = "GATE-SOURCE-SMOKE";
  row.activation_evidence = validActivationEvidence();
  const registry = validateRegistry(doc);
  assert.deepEqual(registry.sources[0].activation_evidence, validActivationEvidence());
});

test("registry rejects more than 40 active non-website_observation rows (REQ-1008)", async () => {
  const doc = await freshRegistryDocument();
  // The live registry sits exactly at the 40-active cap; one more active row
  // must fail closed.
  assert.equal(doc.sources.filter((row) => row.status === "active").length, 40);
  doc.sources.push({
    ...structuredClone(doc.sources[0]),
    record_id: "cap_probe_41"
  });
  assert.throws(() => validateRegistry(doc), /REQ-1008 caps this at 40/);
});

test("registry rejects a non-ISO created_at", async () => {
  const doc = await freshRegistryDocument();
  doc.sources[0].created_at = "yesterday";
  assert.throws(
    () => validateRegistry(doc),
    /source\[0\] \(vogue_business_ai\)\.created_at must be an ISO 8601 date string/
  );
});

test("registry rejects a page row whose intake_config lacks page_url (spec 10.2 method-specific config)", async () => {
  const doc = await freshRegistryDocument();
  const row = doc.sources[0];
  row.intake_method = "page";
  row.intake_config = {};
  assert.throws(() => validateRegistry(doc), /intake_config\.page_url/);
});

test("adapter: the 12 legacy seed rows survive byte-identically, plus the 28 ring activations", async () => {
  const registry = await loadSourceRegistry(registryPath);
  const legacyPayload = JSON.parse(await readFile(legacyPath, "utf8"));

  // Legacy loader contract for the original 12 rows (projection to legacy fields;
  // ring/maxItemsPerRun are additive expand-contract fields).
  const legacyParse = legacyPayload.sources.filter((source) => source.enabled).map((source) => ({
    id: source.id,
    name: source.name,
    mode: source.mode,
    query: source.query,
    homepageUrl: source.homepageUrl,
    weight: source.weight,
    enabled: source.enabled,
    categories: source.categories
  }));

  const adapted = toLegacySources(registry).filter((source) => source.enabled);
  assert.equal(adapted.length, 40);

  const projectLegacy = ({ id, name, mode, query, homepageUrl, weight, enabled, categories }) =>
    ({ id, name, mode, query, homepageUrl, weight, enabled, categories });
  const legacyIds = new Set(legacyParse.map((source) => source.id));
  const adaptedLegacyRows = adapted.filter((source) => legacyIds.has(source.id)).map(projectLegacy);
  assert.deepEqual(adaptedLegacyRows, legacyParse);

  // Every adapted row carries the ring + per-run cap the fetch layer enforces.
  for (const source of adapted) {
    assert.equal(["core", "extended", "discovery"].includes(source.ring), true);
    assert.equal(Number.isInteger(source.maxItemsPerRun) && source.maxItemsPerRun >= 1, true);
  }

  // The public loader (used by run-newsletter) returns the identical adapted shape.
  const loaded = await loadSources(registryPath);
  assert.deepEqual(loaded, adapted);
});

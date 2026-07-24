// AI lane orchestrator (P7, CMP-EXTRACTOR public batch stage) — key-gated.
//
// The lane is fully built but inactive until BOTH are true:
//   1. env.ANTHROPIC_API_KEY is present (the operator wires this in; this code
//      never reads the value into any log, receipt, or packet), and
//   2. env.NEWSLETTER_AI_LANE_ENABLED === "true" (feature flag, default off).
// Until then every run performs a DRY RUN: builds the real packets and batch
// requests, runs the real budget preflight, and records evidence — so the day
// the key lands, activation is a config change, not a build.
//
// Model resolution honors config/model-registry.json (Opus 4.8 primary; the
// registry loader fail-closes if a reasoning role binds a weaker primary).

import { describeModelPolicy, loadModelRegistry, resolveModel } from "../model-registry.mjs";
import { blocksPrivateRouting, budgetPreflight, estimateBatchCost, getPrivacyReceipt } from "./budget.mjs";
import { buildBatchRequests, buildPublicPackets } from "./packets.mjs";

export const ANTHROPIC_BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";
export const ANTHROPIC_VERSION = "2023-06-01";
export const LANE_FLAG = "NEWSLETTER_AI_LANE_ENABLED";

export function laneReadiness(env = {}) {
  const keyPresent = Boolean(env.ANTHROPIC_API_KEY);
  const flagEnabled = env[LANE_FLAG] === "true";
  if (keyPresent && flagEnabled) return "active";
  if (!keyPresent) return "ready_pending_key";
  return "disabled_by_flag";
}

export async function runAiLane({
  stories,
  env = {},
  runId = "",
  capabilityIds = [],
  fetchImpl = globalThis.fetch,
  modelRegistryPath
} = {}) {
  const registry = modelRegistryPath ? await loadModelRegistry(modelRegistryPath) : await loadModelRegistry();
  const policy = describeModelPolicy(registry);
  const role = resolveModel(registry, "public_semantic_parser");
  const model = registry.models[role.primary];
  const privacy = getPrivacyReceipt();

  const packets = buildPublicPackets(stories);
  const requests = buildBatchRequests(packets, {
    model: role.primary,
    allowedCapabilityIds: capabilityIds
  });
  const estimate = estimateBatchCost(requests, model);
  const capUsd = registry.budget_usd?.weekly_hard_stop ?? 8;
  const budget = budgetPreflight({ estimate, capUsd, runId });

  const readiness = laneReadiness(env);
  const summary = {
    status: readiness,
    role: "public_semantic_parser",
    model: role.primary,
    fallbacks: role.fallbacks,
    packetCount: packets.length,
    estimatedCostUsd: budget.estimated_cost_usd,
    budgetCapUsd: budget.cap_usd,
    withinBudgetCap: budget.within_cap,
    privateRoutingBlocked: blocksPrivateRouting(privacy),
    privacyStatus: privacy.status,
    laneFlag: LANE_FLAG,
    primaryReasoningModel: policy.primaryReasoningModel
  };

  if (readiness !== "active") {
    return { mode: "dry_run", summary, budget, privacy, requestCount: requests.length };
  }
  if (!budget.within_cap) {
    return { mode: "blocked_over_cap", summary: { ...summary, status: "blocked_over_cap" }, budget, privacy, requestCount: requests.length };
  }

  // Live submission (only reachable with key + flag). The key is passed as a
  // header and never returned, logged, or attached to any receipt.
  const response = await fetchImpl(ANTHROPIC_BATCHES_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  if (!response.ok) {
    return {
      mode: "submit_failed",
      summary: { ...summary, status: "submit_failed", providerStatus: response.status },
      budget,
      privacy,
      requestCount: requests.length
    };
  }
  const data = await response.json();
  return {
    mode: "submitted",
    summary: { ...summary, status: "submitted", batchId: data.id ?? "" },
    budget,
    privacy,
    requestCount: requests.length
  };
}

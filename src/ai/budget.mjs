// Budget preflight (INV-008) and provider-privacy stub for the AI lane.
//
// Costs are estimated deterministically from registry prices — never from a
// provider call — so the preflight works with no API key. The estimate is
// conservative: ~4 characters per token for input, full max_tokens for output.

export const CHARS_PER_TOKEN = 4;

export function estimateBatchCost(requests, model) {
  if (!model || typeof model.batch_input_price_per_million_usd !== "number") {
    throw new Error("estimateBatchCost requires a model with batch prices");
  }
  let inputTokens = 0;
  let outputTokens = 0;
  for (const request of requests) {
    const promptChars = request.params.messages.reduce(
      (total, message) => total + String(message.content ?? "").length,
      0
    );
    inputTokens += Math.ceil(promptChars / CHARS_PER_TOKEN);
    outputTokens += request.params.max_tokens;
  }
  const estimatedUsd =
    (inputTokens / 1e6) * model.batch_input_price_per_million_usd +
    (outputTokens / 1e6) * model.batch_output_price_per_million_usd;
  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedUsd: Number(estimatedUsd.toFixed(4))
  };
}

// REC-BUDGET receipt: preflight decision against the per-run ceiling (the weekly
// hard stop from config/model-registry.json budget_usd; the run is weekly).
export function budgetPreflight({ estimate, capUsd, runId }) {
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("budgetPreflight requires a positive capUsd");
  const withinCap = estimate.estimatedUsd <= capUsd;
  return {
    record_type: "REC-BUDGET",
    schema_version: 1,
    run_id: runId,
    estimated_input_tokens: estimate.estimatedInputTokens,
    estimated_output_tokens: estimate.estimatedOutputTokens,
    estimated_cost_usd: estimate.estimatedUsd,
    cap_usd: capUsd,
    within_cap: withinCap,
    decision: withinCap ? "proceed" : "blocked_over_cap"
  };
}

// REC-PRIVACY stub (spec 17.6). Until a real ZDR verification is recorded, the
// receipt is "unverified" and blocks every non-public route. The public batch
// extraction route only carries public data, so it is not blocked by this.
export function getPrivacyReceipt() {
  return {
    record_type: "REC-PRIVACY",
    schema_version: 1,
    status: "unverified",
    zdr_verified: false,
    verified_at: null,
    expires_at: null,
    note: "No provider ZDR verification recorded yet; private-context routing is blocked (REQ-ROUTE-012/017)."
  };
}

export function blocksPrivateRouting(receipt) {
  return !(receipt && receipt.zdr_verified === true);
}

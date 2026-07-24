import { sanitizeAttributes } from "./observability/redaction.mjs";

export function publicRunReceipt(run) {
  return sanitizeAttributes({
    schemaVersion: 1,
    runId: run.runId,
    correlationId: run.correlationId,
    generatedAt: run.generatedAt,
    mode: run.mode,
    skipped: Boolean(run.skipped),
    skippedReason: run.skippedReason || "",
    config: publicConfig(run.config),
    health: publicHealth(run.health),
    reviewReady: Boolean(run.reviewReady),
    minReviewItems: run.minReviewItems,
    reviewReasons: run.reviewReasons ?? [],
    sourceCount: run.sourceCount ?? 0,
    sourceErrorCount: run.sourceErrorCount ?? 0,
    sourceResults: (run.sourceResults ?? []).map(publicSourceResult),
    fetchedItemCount: run.fetchedItemCount ?? 0,
    candidateItemCount: run.candidateItemCount ?? 0,
    acceptedItemCount: run.acceptedItemCount ?? 0,
    rejectedItemCount: run.rejectedItemCount ?? 0,
    selectedItemCount: run.selectedItemCount ?? 0,
    itemCount: run.itemCount ?? 0,
    rejectedReasonCounts: run.rejectedReasonCounts ?? {},
    sendStatus: run.sendStatus || "",
    send: {
      sent: Boolean(run.send?.sent),
      skippedReason: run.send?.skippedReason || ""
    },
    automationDefinitionConfigured: Boolean(run.automationConfigured),
    automationConfigured: Boolean(run.automationConfigured),
    githubActionsWorkflowFound: Boolean(run.githubActionsWorkflowFound),
    scheduledRefreshConfigured: Boolean(run.scheduledRefreshConfigured),
    githubPagesDeployConfigured: Boolean(run.githubPagesDeployConfigured),
    observabilityConfigured: Boolean(run.observabilityConfigured),
    liveVerificationConfigured: Boolean(run.liveVerificationConfigured),
    githubPagesDeployGatedBy: run.githubPagesDeployGatedBy || "",
    schedule: run.schedule ?? [],
    timezone: run.timezone || run.config?.timezone || "",
    targetHourLocal: run.targetHourLocal ?? run.config?.targetHourLocal,
    manualPushRequiredAfterSetup: Boolean(run.manualPushRequiredAfterSetup),
    modelPolicy: publicModelPolicy(run.modelPolicy),
    stackProfile: publicStackProfile(run.stackProfile),
    aiLane: publicAiLane(run.aiLane),
    sourceRings: run.sourceRings ?? null,
    watchlist: (run.watchlist ?? []).map(publicWatchlistEntry),
    observability: publicObservability(run.observability)
  });
}

function publicStackProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  // Deliberately no sourceRepo here: the public receipt carries only the commit
  // prefix as an integrity pointer, not the private repository's name.
  return {
    profileVersion: profile.profileVersion || "",
    generatedAt: profile.generatedAt || "",
    sourceCommit: profile.sourceCommit || "",
    capabilityCount: profile.capabilityCount ?? 0,
    status: profile.status || "recorded"
  };
}

function publicAiLane(lane) {
  if (!lane || typeof lane !== "object") return null;
  return {
    status: lane.status || "unavailable",
    role: lane.role || "",
    model: lane.model || "",
    fallbacks: lane.fallbacks ?? [],
    packetCount: lane.packetCount ?? 0,
    estimatedCostUsd: lane.estimatedCostUsd ?? 0,
    budgetCapUsd: lane.budgetCapUsd ?? 0,
    withinBudgetCap: Boolean(lane.withinBudgetCap),
    privateRoutingBlocked: lane.privateRoutingBlocked !== false,
    privacyStatus: lane.privacyStatus || "unverified"
  };
}

function publicWatchlistEntry(entry) {
  return {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    sourceOutlet: entry.sourceOutlet || "",
    publishedAt: entry.publishedAt || "",
    normaRelevance: entry.normaRelevance
      ? { capabilities: (entry.normaRelevance.capabilities ?? []).map((capability) => capability.label) }
      : null
  };
}

function publicModelPolicy(policy) {
  if (!policy || typeof policy !== "object") return null;
  return {
    status: policy.status || "unavailable",
    laneActive: Boolean(policy.laneActive),
    registryVersion: policy.registryVersion || "",
    authoritySpec: policy.authoritySpec || "",
    primaryReasoningModel: policy.primaryReasoningModel || "",
    reasoningRoles: policy.reasoningRoles ?? [],
    roles: policy.roles ?? {},
    prohibitedForPrivateContext: policy.prohibitedForPrivateContext ?? [],
    budgetUsd: policy.budgetUsd ?? {}
  };
}

function publicSourceResult(source) {
  return {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    status: source.status,
    itemCount: source.itemCount ?? 0,
    errorCode: source.errorCode || "",
    errorFingerprint: source.errorFingerprint || "",
    durationMs: source.durationMs ?? 0
  };
}

function publicConfig(config = {}) {
  return {
    timezone: config.timezone || "",
    targetHourLocal: config.targetHourLocal,
    maxItems: config.maxItems,
    minItems: config.minItems,
    lookbackHours: config.lookbackHours,
    mondayLookbackHours: config.mondayLookbackHours,
    reviewLookbackHours: config.reviewLookbackHours,
    minReviewItems: config.minReviewItems,
    activeLookbackHours: config.activeLookbackHours,
    emailEnabled: Boolean(config.emailEnabled)
  };
}

function publicHealth(health = {}) {
  return {
    status: health.status || "unknown",
    pipelineStatus: health.pipelineStatus || "unknown",
    contentStatus: health.contentStatus || "unknown",
    deploymentStatus: health.deploymentStatus || "not_verified",
    liveStatus: health.liveStatus || "not_verified",
    sourceCount: health.sourceCount ?? 0,
    successfulSourceCount: health.successfulSourceCount ?? 0,
    failedSourceCount: health.failedSourceCount ?? 0,
    reasonCodes: health.reasonCodes ?? []
  };
}

function publicObservability(observability = {}) {
  return {
    schemaVersion: observability.schemaVersion,
    runId: observability.runId || "",
    correlationId: observability.correlationId || "",
    manifest: observability.manifest || "",
    summary: observability.summary || "",
    events: observability.events || ""
  };
}

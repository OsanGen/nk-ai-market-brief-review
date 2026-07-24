export function deriveRunHealth({ sourceResults = [], itemCount = 0, minReviewItems = 0, skippedReason = "" } = {}) {
  if (skippedReason) {
    return {
      status: "skipped",
      pipelineStatus: "skipped",
      contentStatus: "not_evaluated",
      deploymentStatus: "not_evaluated",
      liveStatus: "not_evaluated",
      reasonCodes: [skippedReason]
    };
  }

  const sourceCount = sourceResults.length;
  const failedSourceCount = sourceResults.filter((source) => source.status === "error").length;
  const successfulSourceCount = sourceCount - failedSourceCount;
  const pipelineStatus = sourceCount === 0 || failedSourceCount === sourceCount
    ? "failed"
    : failedSourceCount > 0
      ? "degraded"
      : "healthy";
  const contentStatus = itemCount === 0
    ? "empty_valid"
    : itemCount < minReviewItems
      ? "limited"
      : "ready";
  const reasonCodes = [];
  if (sourceCount === 0) reasonCodes.push("no_sources_configured");
  else if (failedSourceCount === sourceCount) reasonCodes.push("all_sources_failed");
  else if (failedSourceCount > 0) reasonCodes.push("partial_source_failure");
  if (contentStatus === "empty_valid") reasonCodes.push("no_qualifying_items");
  else if (contentStatus === "limited") reasonCodes.push("limited_qualifying_items");

  return {
    status: pipelineStatus === "failed" ? "failed" : pipelineStatus === "degraded" ? "degraded" : "healthy",
    pipelineStatus,
    contentStatus,
    deploymentStatus: "not_verified",
    liveStatus: "not_verified",
    sourceCount,
    successfulSourceCount,
    failedSourceCount,
    reasonCodes
  };
}

export function shouldFailRun(run) {
  return run?.health?.pipelineStatus === "failed";
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runAiLane } from "./ai/lane.mjs";
import { getAutomationStatus } from "./automation-status.mjs";
import { loadConfig, outputDate } from "./config.mjs";
import { isoWeekId, writeCoverageReceipt } from "./coverage-receipt.mjs";
import { describeModelPolicy, loadModelRegistry } from "./model-registry.mjs";
import { loadSourceRegistry, summarizeRings } from "./source-registry.mjs";
import { dedupeItems } from "./dedupe.mjs";
import { fetchFeeds } from "./fetch-feeds.mjs";
import { filterAndScoreItems } from "./filter-score.mjs";
import { startTelemetryRun, withTelemetry } from "./observability/telemetry.mjs";
import { renderHtml } from "./render-html.mjs";
import { renderReviewPage } from "./render-review-page.mjs";
import { renderText } from "./render-text.mjs";
import { reviewStatus } from "./review-status.mjs";
import { deriveRunHealth } from "./run-health.mjs";
import { publicRunReceipt } from "./run-receipt.mjs";
import { sendNewsletter } from "./send-resend.mjs";
import { loadSources } from "./sources.mjs";
import { describeStackProfile, loadStackProfile, relevanceTermGroups } from "./stack-profile.mjs";
import { selectDiverseItems } from "./story-diversity.mjs";
import { summarizeItems } from "./summarize.mjs";
import { shouldRunScheduledSend } from "./time-guard.mjs";

export async function runNewsletter({
  mode = "preview",
  now = new Date(),
  force = false,
  env = process.env,
  observability = {}
} = {}) {
  const date = now instanceof Date ? now : new Date(now);
  const telemetry = await startTelemetryRun({
    mode,
    logRoot: observability.logRoot ?? env.NEWSLETTER_LOG_DIR ?? ".newsletter-logs",
    runId: observability.runId ?? env.NEWSLETTER_RUN_ID,
    env,
    stdout: observability.stdout === undefined ? process.stdout : observability.stdout,
    now: observability.now ?? (() => new Date()),
    metadata: { force }
  });

  return withTelemetry(telemetry, async () => {
    try {
      const config = await telemetry.phase({
        name: "config.load",
        component: "config",
        attributes: { mode }
      }, async () => loadConfig(env, date, { mode }));
      const day = outputDate(date, config.timezone);
      const automation = await telemetry.phase({
        name: "automation.inspect",
        component: "automation"
      }, async () => getAutomationStatus());

      // Record the authoritative model-role policy into the run log and receipt.
      // The AI model lane is planned (inactive) today, but this fixes the fact that
      // every reasoning role binds to claude-opus-4-8 primary — so no run can later
      // publish a page whose evidence implies a weaker model was ever the plan.
      const modelPolicy = await recordModelPolicy(telemetry);
      // Load the Norma stack profile (repo-truth snapshot) that powers the
      // normaRelevance scoring signal. Fail-soft: a missing profile leaves the
      // pipeline running with editorial scoring only.
      const stack = await recordStackProfile(telemetry);

      if (mode === "auto" && !force && !shouldRunScheduledSend(date, config)) {
        const review = reviewStatus(0, config.minReviewItems);
        const health = deriveRunHealth({ skippedReason: "outside_target_window" });
        const skippedRun = {
          runId: telemetry.runId,
          correlationId: telemetry.correlationId,
          generatedAt: date.toISOString(),
          mode,
          skipped: true,
          skippedReason: "outside_target_window",
          config: publicConfig(config),
          health,
          reviewReady: false,
          minReviewItems: config.minReviewItems,
          sourceCount: 0,
          sourceResults: [],
          candidateItemCount: 0,
          selectedItemCount: 0,
          sourceErrorCount: 0,
          itemCount: 0,
          sourceErrors: [],
          sendStatus: "outside_target_window",
          reviewReasons: review.reasons,
          send: { sent: false, messageIdFingerprint: "", skippedReason: "outside_target_window" },
          modelPolicy,
          observability: telemetry.reference(),
          ...automation
        };
        await telemetry.phase({
          name: "output.write",
          component: "output",
          attributes: { target: "site_only" }
        }, async () => writeSiteOnly(skippedRun, date.toISOString()));
        await telemetry.complete({
          status: "skipped",
          reasonCode: "outside_target_window",
          health,
          summary: runSummary(skippedRun)
        });
        return skippedRun;
      }

      const { sources, sourceRings } = await telemetry.phase({
        name: "source.load",
        component: "sources"
      }, async () => {
        const loaded = await loadSources();
        // Ring summary for the receipt/page; fail-soft if the registry read for
        // the summary is unavailable (the sources themselves already loaded).
        let rings = null;
        try {
          rings = summarizeRings(await loadSourceRegistry());
        } catch {
          rings = null;
        }
        return { sources: loaded, sourceRings: rings };
      });
      const { items, sourceResults } = await telemetry.phase({
        name: "source.fetch_all",
        component: "feed_fetch",
        attributes: { sourceCount: sources.length }
      }, async () => fetchFeeds(sources));
      const { accepted, rejected } = await telemetry.phase({
        name: "content.filter",
        component: "content",
        attributes: { inputItemCount: items.length, lookbackHours: config.activeLookbackHours }
      }, async () => filterAndScoreItems(items, {
        now: date,
        lookbackHours: config.activeLookbackHours,
        relevanceGroups: stack.relevanceGroups
      }));
      await telemetry.event({
        event: "content.filter.summary",
        component: "content",
        phase: "content.filter",
        status: "completed",
        attributes: {
          inputItemCount: items.length,
          acceptedItemCount: accepted.length,
          rejectedItemCount: rejected.length,
          rejectedReasonCounts: countReasons(rejected)
        }
      });

      let watchlist = [];
      const stories = await telemetry.phase({
        name: "content.select",
        component: "content",
        attributes: { maxItems: config.maxItems, mode }
      }, async () => {
        const deduped = dedupeItems(accepted);
        const selectedItems = selectItemsForMode(deduped, config.maxItems, mode);
        // Watchlist: strongest qualifying items that did NOT make the issue —
        // the "keep an eye on" tail for the review page.
        const selectedIds = new Set(selectedItems.map((item) => item.id));
        watchlist = deduped
          .filter((item) => !selectedIds.has(item.id))
          .slice(0, 5)
          .map(watchlistEntry);
        return summarizeItems(selectedItems);
      });
      await telemetry.event({
        event: "content.select.summary",
        component: "content",
        phase: "content.select",
        status: stories.length ? "completed" : "empty_valid",
        reasonCode: stories.length ? "" : "no_qualifying_items",
        attributes: { selectedItemCount: stories.length }
      });

      // Key-gated AI lane: dry-run (packets + budget preflight + receipts) until
      // the operator wires ANTHROPIC_API_KEY and flips the lane flag. Fail-soft.
      const aiLane = await recordAiLane({ telemetry, stories, env, stack });

      const { html, text } = await telemetry.phase({
        name: "content.render",
        component: "render",
        attributes: { storyCount: stories.length }
      }, async () => ({
        html: renderHtml({ stories, generatedAt: date.toISOString() }),
        text: renderText({ stories, generatedAt: date.toISOString() })
      }));
      const sendMode = mode === "auto" ? "auto" : mode;
      // Weekly review runs never invoke the send path: the guard short-circuits
      // before sendNewsletter is called, keeping send gated and daily-only.
      const send = weeklySendGuard(mode) ?? await telemetry.phase({
        name: "email.send",
        component: "email",
        attributes: { mode: sendMode, itemCount: stories.length }
      }, async () => sendNewsletter({ mode: sendMode, html, text, stories, config, date: day }));
      await telemetry.event({
        event: send.sent ? "email.send.accepted" : "email.send.skipped",
        level: send.sent ? "info" : "debug",
        component: "email",
        phase: "email.send",
        status: send.sent ? "accepted" : "skipped",
        reasonCode: send.skippedReason,
        attributes: {
          providerStatus: send.providerStatus,
          messageIdFingerprint: send.messageIdFingerprint
        }
      });

      const outDir = path.join(config.outputDir, day);
      const review = reviewStatus(stories.length, config.minReviewItems);
      const sourceErrors = sourceResults.filter((result) => result.status === "error");
      const health = deriveRunHealth({
        sourceResults,
        itemCount: stories.length,
        minReviewItems: config.minReviewItems
      });
      let coverage = null;
      if (mode === "weekly") {
        const weekId = isoWeekId(date);
        coverage = await telemetry.phase({
          name: "coverage.receipt",
          component: "coverage",
          attributes: { weekId }
        }, async () => writeCoverageReceipt({
          telemetry,
          registry: await loadSourceRegistry(),
          sourceResults,
          acceptedItems: accepted,
          now: date,
          lookbackHours: config.activeLookbackHours
        }));
      }

      const run = {
        runId: telemetry.runId,
        correlationId: telemetry.correlationId,
        generatedAt: date.toISOString(),
        mode,
        skipped: false,
        outputDir: outDir,
        siteDir: "site",
        config: publicConfig(config),
        health,
        reviewReady: review.reviewReady,
        minReviewItems: config.minReviewItems,
        sourceCount: sources.length,
        sourceResults,
        sourceErrors,
        sourceErrorCount: sourceErrors.length,
        fetchedItemCount: items.length,
        candidateItemCount: items.length,
        acceptedItemCount: accepted.length,
        rejectedItemCount: rejected.length,
        selectedItemCount: stories.length,
        itemCount: stories.length,
        rejectedReasonCounts: countReasons(rejected),
        sendStatus: send.sent ? "sent" : send.skippedReason,
        reviewReasons: review.reasons,
        stories: stories.map(publicStory),
        send,
        modelPolicy,
        stackProfile: stack.summary,
        aiLane,
        sourceRings,
        watchlist,
        ...(coverage ? {
          weekId: coverage.receipt.week_id,
          coverage: {
            recordId: coverage.receipt.record_id,
            weekId: coverage.receipt.week_id,
            file: coverage.file,
            registryCompleteness: coverage.receipt.registry_completeness,
            knownBlindSpots: coverage.receipt.known_blind_spots
          }
        } : {}),
        observability: telemetry.reference(),
        ...automation
      };

      const siteHtml = await telemetry.phase({
        name: "review.render",
        component: "render",
        attributes: { storyCount: stories.length }
      }, async () => renderReviewPage({ stories, run, generatedAt: date.toISOString() }));
      await telemetry.phase({
        name: "output.write",
        component: "output",
        attributes: { outDir, target: "outbox_and_site" }
      }, async () => writeOutputs({ outDir, html, text, run, siteHtml }));

      await telemetry.complete({
        status: health.status === "failed" ? "failed" : health.status === "degraded" ? "degraded" : "completed",
        reasonCode: health.reasonCodes[0] || "",
        health,
        summary: runSummary(run)
      });
      return run;
    } catch (error) {
      await telemetry.fail(error);
      throw error;
    }
  });
}

// Run the key-gated AI lane and record its evidence. Fail-soft: the lane can
// never break the deterministic newsletter; an error records ai.lane.failed and
// the run continues with laneStatus "unavailable".
async function recordAiLane({ telemetry, stories, env, stack }) {
  try {
    const capabilityIds = (stack.summary?.capabilityIds ?? []);
    const result = await runAiLane({
      stories,
      env,
      runId: telemetry.runId,
      capabilityIds
    });
    await telemetry.event({
      event: result.mode === "dry_run" ? "ai.lane.dry_run" : `ai.lane.${result.mode}`,
      component: "ai_lane",
      status: result.mode === "submit_failed" ? "failed" : "completed",
      level: result.mode === "submit_failed" ? "warn" : "info",
      reasonCode: result.mode === "dry_run" ? result.summary.status : "",
      attributes: result.summary
    });
    return result.summary;
  } catch (error) {
    await telemetry.event({
      event: "ai.lane.failed",
      level: "warn",
      component: "ai_lane",
      status: "skipped",
      reasonCode: "ai_lane_unavailable"
    });
    return { status: "unavailable", reasonCode: "ai_lane_unavailable" };
  }
}

// Load the Norma stack profile and emit its summary as a machine-log event.
// Fail-soft: without a profile the run continues with editorial scoring only and
// records why, so the receipt never silently implies stack-aware ranking ran.
async function recordStackProfile(telemetry) {
  try {
    const profile = await loadStackProfile();
    const summary = describeStackProfile(profile);
    await telemetry.event({
      event: "stack.profile.recorded",
      component: "stack_profile",
      status: "completed",
      attributes: summary
    });
    return { relevanceGroups: relevanceTermGroups(profile), summary };
  } catch (error) {
    await telemetry.event({
      event: "stack.profile.unavailable",
      level: "warn",
      component: "stack_profile",
      status: "skipped",
      reasonCode: "stack_profile_unavailable"
    });
    return {
      relevanceGroups: [],
      summary: { status: "unavailable", reasonCode: "stack_profile_unavailable" }
    };
  }
}

// Load the model-role registry and emit it as a machine-log event. Fail-soft:
// the model lane is planned, not active, so a missing/invalid registry must never
// break the deterministic newsletter — it records an "unavailable" marker instead.
async function recordModelPolicy(telemetry) {
  try {
    const registry = await loadModelRegistry();
    const policy = describeModelPolicy(registry);
    await telemetry.event({
      event: "model.policy.recorded",
      component: "model_policy",
      status: "completed",
      attributes: policy
    });
    return policy;
  } catch (error) {
    await telemetry.event({
      event: "model.policy.unavailable",
      level: "warn",
      component: "model_policy",
      status: "skipped",
      reasonCode: "model_registry_unavailable"
    });
    return {
      status: "unavailable",
      laneActive: false,
      primaryReasoningModel: null,
      reasonCode: "model_registry_unavailable"
    };
  }
}

export const WEEKLY_SEND_SKIP_REASON = "weekly_mode_send_prohibited";

// Weekly runs are review-only: this guard returns the skip record for mode "weekly"
// so the send path (sendNewsletter) is never invoked; all other modes return null
// and keep their existing send-gate behavior unchanged.
export function weeklySendGuard(mode) {
  if (mode !== "weekly") return null;
  return { sent: false, messageIdFingerprint: "", skippedReason: WEEKLY_SEND_SKIP_REASON };
}

function selectItemsForMode(items, maxItems, mode) {
  if (mode !== "preview") return items.slice(0, maxItems);
  return selectDiverseItems(items, maxItems);
}

function publicConfig(config) {
  return {
    timezone: config.timezone,
    targetHourLocal: config.targetHourLocal,
    maxItems: config.maxItems,
    minItems: config.minItems,
    lookbackHours: config.lookbackHours,
    mondayLookbackHours: config.mondayLookbackHours,
    reviewLookbackHours: config.reviewLookbackHours,
    minReviewItems: config.minReviewItems,
    activeLookbackHours: config.activeLookbackHours,
    outputDir: config.outputDir,
    emailEnabled: config.sendEnabled
  };
}

function publicStory(story) {
  return {
    id: story.id,
    sourceId: story.sourceId,
    sourceName: story.sourceName,
    sourceOutlet: story.sourceOutlet,
    scanLabel: story.scanLabel,
    topicCluster: story.topicCluster,
    title: story.title,
    headline: story.headline,
    url: story.url,
    publishedAt: story.publishedAt,
    summary: story.summary,
    whyItMatters: story.whyItMatters,
    category: story.category,
    categories: story.categories,
    score: story.score,
    normaRelevance: story.normaRelevance
      ? {
        bonus: story.normaRelevance.bonus,
        capabilities: (story.normaRelevance.capabilities ?? []).map((capability) => ({
          id: capability.id,
          label: capability.label,
          matchedIn: capability.matchedIn
        }))
      }
      : null
  };
}

// Public-safe watchlist projection (title/outlet/url/cluster/relevance only).
function watchlistEntry(item) {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    sourceOutlet: item.sourceOutlet || "",
    sourceName: item.sourceName,
    publishedAt: item.publishedAt,
    score: item.score,
    normaRelevance: item.normaRelevance
      ? {
        bonus: item.normaRelevance.bonus,
        capabilities: (item.normaRelevance.capabilities ?? []).map((capability) => ({
          id: capability.id,
          label: capability.label,
          matchedIn: capability.matchedIn
        }))
      }
      : null
  };
}

function countReasons(rejected) {
  return rejected.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    return counts;
  }, {});
}

function runSummary(run) {
  return {
    mode: run.mode,
    outputDir: run.outputDir || "",
    itemCount: run.itemCount ?? 0,
    sourceCount: run.sourceCount ?? 0,
    sourceErrorCount: run.sourceErrorCount ?? 0,
    sendStatus: run.sendStatus || "",
    reviewReady: Boolean(run.reviewReady)
  };
}

async function writeOutputs({ outDir, html, text, run, siteHtml }) {
  await mkdir(outDir, { recursive: true });
  await mkdir("site", { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "newsletter.html"), html, "utf8"),
    writeFile(path.join(outDir, "newsletter.txt"), text, "utf8"),
    writeFile(path.join(outDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8"),
    writeFile(path.join("site", "index.html"), siteHtml, "utf8"),
    writeFile(path.join("site", "newsletter.txt"), text, "utf8"),
    writeFile(path.join("site", "run.json"), `${JSON.stringify(publicRunReceipt(run))}\n`, "utf8")
  ]);
}

async function writeSiteOnly(run, generatedAt) {
  const html = renderReviewPage({ stories: [], run, generatedAt });
  const text = renderText({ stories: [], generatedAt });
  await mkdir("site", { recursive: true });
  await Promise.all([
    writeFile(path.join("site", "index.html"), html, "utf8"),
    writeFile(path.join("site", "newsletter.txt"), text, "utf8"),
    writeFile(path.join("site", "run.json"), `${JSON.stringify(publicRunReceipt(run))}\n`, "utf8")
  ]);
}

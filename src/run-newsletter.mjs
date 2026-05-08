import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAutomationStatus } from "./automation-status.mjs";
import { loadConfig, outputDate } from "./config.mjs";
import { dedupeItems } from "./dedupe.mjs";
import { fetchFeeds } from "./fetch-feeds.mjs";
import { filterAndScoreItems } from "./filter-score.mjs";
import { loadSources } from "./sources.mjs";
import { summarizeItems } from "./summarize.mjs";
import { renderHtml } from "./render-html.mjs";
import { renderReviewPage } from "./render-review-page.mjs";
import { renderText } from "./render-text.mjs";
import { reviewStatus } from "./review-status.mjs";
import { sendNewsletter } from "./send-resend.mjs";
import { selectDiverseItems } from "./story-diversity.mjs";
import { shouldRunScheduledSend } from "./time-guard.mjs";

export async function runNewsletter({ mode = "preview", now = new Date(), force = false } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  const config = loadConfig(process.env, date, { mode });
  const day = outputDate(date, config.timezone);
  const automation = await getAutomationStatus();

  if (mode === "auto" && !force && !shouldRunScheduledSend(date, config)) {
    const status = reviewStatus(0, config.minReviewItems);
    const skippedRun = {
      generatedAt: date.toISOString(),
      mode,
      skipped: true,
      skippedReason: "outside_target_window",
      config: publicConfig(config),
      reviewReady: false,
      minReviewItems: config.minReviewItems,
      sourceCount: 0,
      candidateItemCount: 0,
      selectedItemCount: 0,
      sourceErrorCount: 0,
      itemCount: 0,
      sourceErrors: [],
      sendStatus: "outside_target_window",
      reviewReasons: status.reasons,
      send: { sent: false, messageId: "", skippedReason: "outside_target_window" },
      ...automation
    };
    await writeSiteOnly(skippedRun, date.toISOString());
    return skippedRun;
  }

  const sources = await loadSources();
  const { items, sourceResults } = await fetchFeeds(sources);
  const { accepted, rejected } = filterAndScoreItems(items, {
    now: date,
    lookbackHours: config.activeLookbackHours
  });
  const selectedItems = selectItemsForMode(dedupeItems(accepted), config.maxItems, mode);
  const stories = summarizeItems(selectedItems);
  const html = renderHtml({ stories, generatedAt: date.toISOString() });
  const text = renderText({ stories, generatedAt: date.toISOString() });
  const sendMode = mode === "auto" ? "auto" : mode;
  const send = await sendNewsletter({ mode: sendMode, html, text, stories, config, date: day });
  const outDir = path.join(config.outputDir, day);
  const status = reviewStatus(stories.length, config.minReviewItems);
  const sourceErrors = sourceResults.filter((result) => result.status === "error");
  const run = {
    generatedAt: date.toISOString(),
    mode,
    skipped: false,
    outputDir: outDir,
    siteDir: "site",
    config: publicConfig(config),
    reviewReady: status.reviewReady,
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
    reviewReasons: status.reasons,
    stories: stories.map(publicStory),
    send,
    ...automation
  };

  const siteHtml = renderReviewPage({ stories, run, generatedAt: date.toISOString() });
  await writeOutputs({ outDir, html, text, run, siteHtml });
  return run;
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
    score: story.score
  };
}

function countReasons(rejected) {
  return rejected.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    return counts;
  }, {});
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
    writeFile(path.join("site", "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8")
  ]);
}

async function writeSiteOnly(run, generatedAt) {
  const html = renderReviewPage({ stories: [], run, generatedAt });
  const text = renderText({ stories: [], generatedAt });
  await mkdir("site", { recursive: true });
  await Promise.all([
    writeFile(path.join("site", "index.html"), html, "utf8"),
    writeFile(path.join("site", "newsletter.txt"), text, "utf8"),
    writeFile(path.join("site", "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8")
  ]);
}

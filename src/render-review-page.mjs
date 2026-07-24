import { escapeHtml, safeUrl } from "./normalize.mjs";

const FOOTER = "Internal NK market brief. Summaries are deterministic and based on RSS metadata only.";

export function renderReviewPage({ stories = [], run = {}, generatedAt } = {}) {
  const [lead, ...rest] = stories;
  const generated = generatedAt || run.generatedAt || new Date().toISOString();
  const sourceResults = run.sourceResults ?? [];
  const sendLabel = run.sendStatus || sendStatus(run.send);
  const reviewLabel = run.reviewReady ? "Ready for review" : "Needs source tuning";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Internal preview of AI + fashion, beauty, e-commerce, and agentic commerce signals for NK.">
  <meta name="robots" content="noindex,nofollow">
  <title>NK AI Market Brief</title>
  <style>
    /* NK editorial type system: stark black/white, grotesque type, magazine folio. */
    body { margin: 0; background: #fff; color: #000; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; line-height: 1.5; }
    main { max-width: 1040px; margin: 0 auto; padding: 24px 18px 44px; }
    header, section, footer { border-top: 1px solid #000; padding-top: 18px; margin-top: 22px; }
    header { border-top: 0; margin-top: 0; padding-top: 0; border-bottom: 2px solid #000; padding-bottom: 20px; }
    .folio { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; border-bottom: 1px solid #000; padding-bottom: 10px; margin: 0; color: #000; }
    h1 { margin: 20px 0 10px; font-size: clamp(42px, 7.5vw, 74px); line-height: 0.95; letter-spacing: -0.01em; text-transform: uppercase; font-weight: 700; }
    h2, h3 { margin: 0 0 8px; line-height: 1.15; letter-spacing: 0; }
    section > h2 { text-transform: uppercase; font-size: 13px; letter-spacing: 0.14em; font-weight: 700; }
    p { margin: 8px 0; }
    a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    .meta, .summary-grid, footer { color: #333; }
    .deck { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: #000; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .badge { border: 1px solid #000; padding: 5px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #000; }
    .status-line { font-size: 15px; margin-top: 14px; }
    .signals-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em; color: #000; margin-bottom: 6px; font-weight: 700; }
    .lead-story { padding-bottom: 22px; }
    .lead-story h2 { font-size: clamp(26px, 4vw, 38px); line-height: 1.05; letter-spacing: -0.01em; text-transform: none; }
    .story-card h3 { font-size: 19px; }
    .story-meta strong, footer { text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
    .story-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .story-card { border: 1px solid #000; padding: 14px; min-width: 0; }
    .story-card h3 { font-size: 18px; }
    .note { border: 1px solid #000; padding: 12px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; font-size: 13px; }
    .summary-cell { border: 1px solid #999; padding: 8px; }
    .summary-cell strong { display: block; color: #000; font-size: 16px; }
    .story-meta { color: #333; font-size: 13px; }
    .nk-relevance { border-left: 3px solid #000; padding-left: 8px; font-size: 13px; color: #000; }
    .story-meta span { display: inline-block; margin-right: 10px; }
    .debug { color: #666; font-size: 12px; border-top-color: #ddd; margin-top: 30px; }
    .debug h2 { font-size: 15px; color: #333; }
    .debug .summary-cell { border-color: #ddd; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    @media (max-width: 760px) { .story-grid, .summary-grid { grid-template-columns: 1fr; } h1 { font-size: 28px; } .lead-story h2 { font-size: 23px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="folio"><span>Norma Kamali</span><span>AI Market Intelligence</span><span>Week ending ${escapeHtml(folioDate(generated))}</span></p>
      <h1>NK AI Market Brief</h1>
      <p class="deck">AI + fashion, beauty, e-commerce, AI shopping, and agentic commerce signals</p>
      <p class="meta">Generated ${escapeHtml(formatDateTime(generated))}</p>
      <div class="badges">
        <span class="badge">${escapeHtml(modeLabel(run.mode))}</span>
        <span class="badge">Email disabled</span>
        <span class="badge">Internal review</span>
        <span class="badge">${escapeHtml(aiLaneLabel(run.aiLane))}</span>
        ${run.stackProfile?.sourceCommit ? `<span class="badge">NK stack-aware ranking</span>` : ""}
      </div>
      <p class="status-line"><strong>Review status:</strong> ${escapeHtml(reviewLabel)}</p>
      ${renderReviewNote(run)}
    </header>
    <section>
      <p class="signals-label">Today's selected signals</p>
    </section>
    ${lead ? renderLead(lead) : renderEmpty()}
    ${renderCards(rest)}
    ${renderWatchlist(run.watchlist ?? [])}
    <section>
      <h2>Text version</h2>
      <p><a href="newsletter.txt">Open newsletter.txt</a></p>
    </section>
    ${renderRunSummary(run, sendLabel)}
    ${renderRingStats(run.sourceRings)}
    ${renderAiLanePanel(run.aiLane, run.modelPolicy)}
    ${renderSourceHealth(sourceResults)}
    ${renderAutomationStatus(run)}
    <footer>
      <p>${FOOTER}</p>
    </footer>
  </main>
</body>
</html>
`;
}

function renderLead(story) {
  return `<section class="lead-story">
  <p class="meta">Lead story</p>
  ${renderStoryMeta(story)}
  <h2>${escapeHtml(story.headline)}</h2>
  <p>${escapeHtml(story.summary)}</p>
  <p>${escapeHtml(story.whyItMatters)}</p>
  ${readLink(story)}
</section>`;
}

function renderCards(stories) {
  if (!stories.length) {
    return `<section>
  <p class="note">Not enough additional qualifying stories for the review grid. Source/filter tuning needed.</p>
</section>`;
  }
  return `<section>
  <h2>Story grid</h2>
  <div class="story-grid">
${stories.map(renderCard).join("\n")}
  </div>
</section>`;
}

function renderCard(story) {
  return `<article class="story-card">
  ${renderStoryMeta(story)}
  <h3>${escapeHtml(story.headline)}</h3>
  <p>${escapeHtml(story.summary)}</p>
  <p>${escapeHtml(story.whyItMatters)}</p>
  ${readLink(story)}
</article>`;
}

function renderRunSummary(run, sendLabel) {
  const sourceErrorCount = Number(run.sourceErrorCount ?? (Array.isArray(run.sourceErrors) ? run.sourceErrors.length : 0));
  return `<section class="debug">
  <h2>Technical diagnostics</h2>
  <div class="summary-grid">
    <div class="summary-cell"><strong>${escapeHtml(run.sourceCount ?? 0)}</strong>Sources scanned</div>
    <div class="summary-cell"><strong>${escapeHtml(run.candidateItemCount ?? run.fetchedItemCount ?? 0)}</strong>Candidate items fetched</div>
    <div class="summary-cell"><strong>${escapeHtml(run.selectedItemCount ?? run.itemCount ?? 0)}</strong>Selected items</div>
    <div class="summary-cell"><strong>${escapeHtml(sourceErrorCount)}</strong>Source errors</div>
    <div class="summary-cell"><strong>${escapeHtml(sendLabel)}</strong>Send status</div>
  </div>
</section>`;
}

function renderSourceHealth(sourceResults) {
  const items = sourceResults.length
    ? sourceResults.map((source) => `<li>${escapeHtml(source.sourceName)} | ${escapeHtml(source.status)} | ${escapeHtml(source.itemCount ?? 0)} fetched</li>`).join("\n")
    : "<li>No source results recorded.</li>";
  return `<section class="debug">
  <h2>Source fetch status</h2>
  <ul>
${items}
  </ul>
</section>`;
}

function renderAutomationStatus(run) {
  const autoLabel = run.automationConfigured ? "configured" : "not configured";
  const pagesLabel = run.githubPagesDeployConfigured ? `GitHub Pages when ${escapeHtml(run.githubPagesDeployGatedBy || "DEPLOY_GITHUB_PAGES")}=true` : "not configured";
  const schedule = Array.isArray(run.schedule) && run.schedule.length ? run.schedule.join(" and ") : "not configured";
  const liveLabel = run.health?.liveStatus || "not verified by this static build";
  return `<section class="debug">
  <h2>Automation status</h2>
  <ul>
    <li>Workflow definition: ${escapeHtml(autoLabel)}</li>
    <li>Schedule: weekly on Fridays around 4 a.m. Eastern with retry/watchdog runs (${escapeHtml(schedule)})</li>
    <li>Page deploy definition: ${pagesLabel}</li>
    <li>Live health: ${escapeHtml(liveLabel)}</li>
    <li>Fallback: GitHub Actions artifact</li>
    <li>Email: disabled unless explicitly enabled</li>
  </ul>
</section>`;
}

function renderReviewNote(run) {
  const notes = [];
  if (run.reviewReasons?.length) notes.push(...run.reviewReasons);
  if ((run.selectedItemCount ?? run.itemCount ?? 0) >= 3 && (run.selectedItemCount ?? run.itemCount ?? 0) < 6) {
    notes.push("Limited qualifying stories in current review window.");
  }
  return notes.length ? `<p class="note">${escapeHtml(notes.join(" "))}</p>` : "";
}

function renderEmpty() {
  return `<section class="lead-story">
  <h2>Lead story</h2>
  <p>No qualifying stories matched the current filters.</p>
</section>`;
}

function readLink(story) {
  const url = safeUrl(story.url);
  return url ? `<p><a href="${escapeHtml(url)}">Read source</a></p>` : "";
}

function renderStoryMeta(story) {
  const source = story.sourceOutlet || story.sourceName || "source unavailable";
  const scan = story.scanLabel || (story.sourceOutlet ? story.sourceName : "");
  return `<p class="story-meta">
    <span><strong>Source:</strong> ${escapeHtml(source)}</span>
    <span><strong>Category:</strong> ${escapeHtml(story.category ?? "market")}</span>
    ${scan ? `<span><strong>Scan:</strong> ${escapeHtml(scan)}</span>` : ""}
    <span><strong>Date:</strong> ${escapeHtml(formatDate(story.publishedAt))}</span>
  </p>${story.aiWritten ? `<p class="story-meta"><span><strong>Analysis:</strong> AI-written (Opus), evidence-bound</span></p>` : ""}${renderNormaBadge(story.normaRelevance)}`;
}

// NK-relevance badge: names the House capabilities this story touches, derived
// from the repo-truth stack profile — the "why this matters to what NK is
// actually building" marker.
function renderNormaBadge(normaRelevance) {
  const capabilities = normaRelevance?.capabilities ?? [];
  if (!capabilities.length) return "";
  const labels = capabilities.map((capability) => capability.label).join(", ");
  return `<p class="nk-relevance"><strong>NK stack signal:</strong> ${escapeHtml(labels)}</p>`;
}

function renderWatchlist(watchlist) {
  if (!watchlist.length) return "";
  const items = watchlist.map((entry) => {
    const url = safeUrl(entry.url);
    const title = url ? `<a href="${escapeHtml(url)}">${escapeHtml(entry.title)}</a>` : escapeHtml(entry.title);
    const outlet = entry.sourceOutlet ? ` — ${escapeHtml(entry.sourceOutlet)}` : "";
    const capabilities = entry.normaRelevance?.capabilities ?? [];
    const labels = capabilities.map((capability) => capability.label ?? capability).join(", ");
    const badge = labels ? ` <span class="story-meta">[NK: ${escapeHtml(labels)}]</span>` : "";
    return `<li>${title}${outlet}${badge}</li>`;
  }).join("\n");
  return `<section>
  <h2>Watchlist</h2>
  <p class="meta">Qualifying signals that did not make today's selection.</p>
  <ul>
${items}
  </ul>
</section>`;
}

function renderRingStats(sourceRings) {
  if (!sourceRings) return "";
  const rings = Object.entries(sourceRings.rings ?? {})
    .map(([ring, stats]) => `<div class="summary-cell"><strong>${escapeHtml(stats.active)}/${escapeHtml(stats.total)}</strong>${escapeHtml(ring)} ring active</div>`)
    .join("\n    ");
  return `<section class="debug">
  <h2>Source network</h2>
  <div class="summary-grid">
    <div class="summary-cell"><strong>${escapeHtml(sourceRings.active)}/${escapeHtml(sourceRings.total)}</strong>Sources active</div>
    ${rings}
  </div>
</section>`;
}

function renderAiLanePanel(aiLane, modelPolicy) {
  if (!aiLane) return "";
  const model = aiLane.model || modelPolicy?.primaryReasoningModel || "";
  return `<section class="debug">
  <h2>AI review lane</h2>
  <ul>
    <li>Status: ${escapeHtml(aiLaneLabel(aiLane))}</li>
    <li>Model: ${escapeHtml(model)} (fallbacks: ${escapeHtml((aiLane.fallbacks ?? []).join(", ") || "none")})</li>
    <li>Prepared packets: ${escapeHtml(aiLane.packetCount ?? 0)} | Estimated cost: $${escapeHtml(aiLane.estimatedCostUsd ?? 0)} (cap $${escapeHtml(aiLane.budgetCapUsd ?? 0)})</li>
    <li>Private-context routing: ${escapeHtml(aiLane.privateRoutingBlocked === false ? "permitted" : "blocked until ZDR verification")}</li>
  </ul>
</section>`;
}

function aiLaneLabel(aiLane) {
  const status = aiLane?.status || "unavailable";
  if (status === "ready_pending_key") return "AI review: ready, pending API key";
  if (status === "disabled_by_flag") return "AI review: built, flag off";
  if (status === "synthesized") return "AI review: active (Opus-written analysis)";
  if (status === "submitted" || status === "active") return "AI review: active";
  if (status === "blocked_over_cap") return "AI review: blocked by budget cap";
  if (status === "submit_failed" || status === "synthesis_invalid") return "AI review: errored, template copy shown";
  return "AI review: unavailable";
}

function modeLabel(mode) {
  return mode === "send" ? "Send mode" : mode === "auto" ? "Auto mode" : "Preview mode";
}

function sendStatus(send = {}) {
  if (send.sent) return "sent";
  return send.skippedReason || "disabled";
}

function formatDate(value) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toISOString().slice(0, 10);
}

// Magazine-folio date for the masthead, e.g. "July 24, 2026".
function folioDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

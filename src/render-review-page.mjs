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
    body { margin: 0; background: #fff; color: #000; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
    main { max-width: 1040px; margin: 0 auto; padding: 28px 18px 44px; }
    header, section, footer { border-top: 1px solid #000; padding-top: 18px; margin-top: 22px; }
    header { border-top: 0; margin-top: 0; padding-top: 0; border-bottom: 2px solid #000; padding-bottom: 18px; }
    h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.05; letter-spacing: 0; }
    h2, h3 { margin: 0 0 8px; line-height: 1.15; letter-spacing: 0; }
    p { margin: 8px 0; }
    a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    .deck, .meta, .badge, .summary-grid, footer { color: #333; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .badge { border: 1px solid #000; padding: 4px 8px; font-size: 13px; }
    .status-line { font-size: 16px; margin-top: 14px; }
    .signals-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0; color: #333; margin-bottom: 6px; }
    .lead-story { padding-bottom: 22px; }
    .lead-story h2 { font-size: 28px; }
    .story-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .story-card { border: 1px solid #000; padding: 14px; min-width: 0; }
    .story-card h3 { font-size: 18px; }
    .note { border: 1px solid #000; padding: 12px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; font-size: 13px; }
    .summary-cell { border: 1px solid #999; padding: 8px; }
    .summary-cell strong { display: block; color: #000; font-size: 16px; }
    .story-meta { color: #333; font-size: 13px; }
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
      <h1>NK AI Market Brief</h1>
      <p class="deck">Internal preview of AI + fashion, beauty, e-commerce, AI shopping, and agentic commerce signals for NK.</p>
      <p class="meta">Generated ${escapeHtml(formatDateTime(generated))}</p>
      <div class="badges">
        <span class="badge">${escapeHtml(modeLabel(run.mode))}</span>
        <span class="badge">Email disabled</span>
        <span class="badge">Internal review</span>
      </div>
      <p class="status-line"><strong>Review status:</strong> ${escapeHtml(reviewLabel)}</p>
      ${renderReviewNote(run)}
    </header>
    <section>
      <p class="signals-label">Today's selected signals</p>
    </section>
    ${lead ? renderLead(lead) : renderEmpty()}
    ${renderCards(rest)}
    <section>
      <h2>Text version</h2>
      <p><a href="newsletter.txt">Open newsletter.txt</a></p>
    </section>
    ${renderRunSummary(run, sendLabel)}
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
  return `<section class="debug">
  <h2>Automation status</h2>
  <ul>
    <li>Auto-refresh: ${escapeHtml(autoLabel)}</li>
    <li>Schedule: daily around 4 a.m. Eastern with retry/watchdog runs (${escapeHtml(schedule)})</li>
    <li>Page deploy: ${pagesLabel}</li>
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
  </p>`;
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

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

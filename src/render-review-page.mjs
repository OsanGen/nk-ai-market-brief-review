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
  <meta name="theme-color" content="#000000">
  <meta property="og:type" content="website">
  <meta property="og:title" content="NK AI Market Brief · Week ending ${escapeHtml(folioDate(generated))}">
  <meta property="og:description" content="${escapeHtml(run.weekOverview || "AI + fashion, beauty, e-commerce, AI shopping, and agentic commerce signals, curated weekly.")}">
  ${run.ogImageUrl ? `<meta property="og:image" content="${escapeHtml(run.ogImageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="apple-touch-icon" href="nk-icon.png">` : ""}
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23000'/%3E%3Ctext x='32' y='42' font-family='Helvetica,Arial,sans-serif' font-size='28' font-weight='700' fill='%23fff' text-anchor='middle'%3ENK%3C/text%3E%3C/svg%3E">
  <title>NK AI Market Brief</title>
  <style>
    /* NK editorial type system: stark black/white, grotesque type, magazine folio. */
    html { scroll-behavior: smooth; }
    body { margin: 0; background: #fff; color: #000; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; line-height: 1.5; }
    [id^="story-"] { scroll-margin-top: 14px; }
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
    /* B: week-in-five index */
    .week-five { list-style: none; margin: 12px 0 4px; padding: 0; }
    .week-five li { display: flex; gap: 14px; align-items: baseline; border-top: 1px solid #ddd; padding: 10px 2px; }
    .week-five li:first-child { border-top: 0; }
    .week-five a { text-decoration: none; font-weight: 600; font-size: 16px; line-height: 1.3; }
    .week-five a:hover { text-decoration: underline; }
    .five-num, .story-num { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #000; }
    /* C: editorial numerals + why-it-matters callout + source-type badge */
    .story-num { font-size: 26px; line-height: 1; margin: 0 0 8px; }
    .lead-story .story-num { display: inline-block; margin-right: 10px; font-size: 15px; }
    .why-callout { border-left: 4px solid #000; background: #f6f6f6; padding: 10px 12px; margin: 10px 0; }
    .why-callout strong { display: block; text-transform: uppercase; font-size: 10px; letter-spacing: 0.14em; margin-bottom: 3px; }
    .callout-line { display: block; }
    .callout-line + .callout-line { margin-top: 8px; }
    .next-move { font-weight: 700; }
    .wire-line { font-size: 12px; color: #333; margin: 2px 0 8px; }
    /* G: weekly standfirst */
    .the-week .standfirst { font-size: 19px; line-height: 1.5; max-width: 62ch; margin: 6px 0 4px; }
    /* №1: curation-funnel colophon (masthead folio spec echoed) */
    .curation-folio { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 400; color: #333; margin: 2px 0 12px; line-height: 1.6; }
    /* №2: THE MOVES action ledger */
    .moves { list-style: none; margin: 12px 0 4px; padding: 0; }
    .moves li { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; border-top: 1px solid #000; padding: 10px 2px; }
    .moves li:first-child { border-top: 0; }
    .move-text { font-weight: 700; font-size: 16px; line-height: 1.35; flex: 1 1 24ch; max-width: 62ch; }
    .move-ref { margin-left: auto; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #000; text-decoration: none; border-bottom: 1px solid #000; padding: 2px 0 1px; white-space: nowrap; }
    .move-ref:hover { border-bottom-width: 2px; }
    /* №3: signal-grade triage marks */
    .sig { display: inline-flex; gap: 3px; vertical-align: 1px; }
    .sig b { display: block; width: 7px; height: 7px; border: 1px solid #000; box-sizing: border-box; background: #fff; }
    .sig .on { background: #000; }
    .week-five .sig { margin-left: auto; padding-left: 14px; }
    .story-num .sig, .lead-story .meta .sig { margin-left: 10px; }
    .source-type { display: inline-block; border: 1px solid #000; padding: 1px 6px; margin-right: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; vertical-align: 1px; }
    /* D: pull-stat hero */
    .pull-stat { text-align: center; padding: 26px 12px 30px; }
    .pull-stat-value { font-size: clamp(64px, 12vw, 128px); font-weight: 700; letter-spacing: -0.02em; line-height: 1; margin: 0; }
    .pull-stat-caption { font-size: 18px; max-width: 34em; margin: 10px auto 0; }
    .pull-stat-source { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #333; margin-top: 8px; }
    /* E: collapsed system details */
    details.ops { border-top: 1px solid #000; margin-top: 26px; padding-top: 14px; }
    details.ops > summary { cursor: pointer; text-transform: uppercase; font-size: 12px; letter-spacing: 0.14em; font-weight: 700; padding: 8px 0; list-style-position: inside; }
    details.ops section { border-top-color: #ddd; }
    /* F: reading comfort + touch targets */
    .story-body, .why-callout, .lead-story > p { max-width: 68ch; }
    a { padding: 2px 0; }
    @media (max-width: 760px) {
      .week-five a { font-size: 15px; }
      .pull-stat-caption { font-size: 16px; }
      .story-card { padding: 16px; }
      .badges { gap: 10px; }
      .badge { padding: 7px 12px; }
      .move-text { font-size: 15px; }
    }
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
        ${run.stackProfile?.sourceCommit ? `<span class="badge">Ranked for NK relevance</span>` : ""}
      </div>
      ${renderReviewNote(run)}
    </header>
    ${renderWeekOverview(run.weekOverview)}
    <section>
      <p class="signals-label">This week's stories</p>
      ${renderCurationFolio(run)}
      ${renderWeekInFive(stories)}
    </section>
    ${renderTheMoves(stories)}
    ${renderPullStat(run.pullStat)}
    ${lead ? renderLead(lead) : renderEmpty()}
    ${renderCards(rest)}
    ${renderWatchlist(run.watchlist ?? [])}
    <section>
      <h2>Text version</h2>
      <p><a href="newsletter.txt">Open newsletter.txt</a></p>
    </section>
    <details class="ops">
      <summary>System details</summary>
      <p class="status-line"><strong>Review status:</strong> ${escapeHtml(reviewLabel)}</p>
      ${renderRunSummary(run, sendLabel)}
      ${renderRingStats(run.sourceRings)}
      ${renderAiLanePanel(run.aiLane, run.modelPolicy)}
      ${renderSourceHealth(sourceResults)}
      ${renderAutomationStatus(run)}
    </details>
    <footer>
      <p>${FOOTER}</p>
    </footer>
  </main>
</body>
</html>
`;
}

// G: the week's narrative as a magazine standfirst. Data-conditional — absent
// field, absent section.
function renderWeekOverview(weekOverview) {
  if (!weekOverview) return "";
  return `<section class="the-week">
  <p class="signals-label">The week</p>
  <p class="standfirst">${escapeHtml(weekOverview)}</p>
</section>`;
}

// №1: the curation-funnel colophon. Pipeline arithmetic promoted into editorial
// voice; renders only when the funnel is coherent and actually narrows, and
// never with AI involvement — these are the run's own counts.
function renderCurationFolio(run) {
  const candidate = Number(run.candidateItemCount);
  const accepted = Number(run.acceptedItemCount);
  const selected = Number(run.selectedItemCount ?? run.itemCount);
  if (!Number.isFinite(candidate) || !Number.isFinite(selected)) return "";
  if (candidate <= 0 || selected <= 0 || candidate <= selected) return "";
  const parts = [`This week we went through ${candidate.toLocaleString("en-US")} stories`];
  if (Number.isFinite(accepted) && accepted > 0) {
    if (!(candidate >= accepted && accepted >= selected)) return "";
    parts.push(`shortlisted ${accepted.toLocaleString("en-US")}`);
  }
  parts.push(`chose these ${selected.toLocaleString("en-US")}`);
  return `<p class="curation-folio">${escapeHtml(parts.join(" · "))}</p>`;
}

// №2: THE MOVES — the week's next-move imperatives gathered into one action
// ledger, each row back-referencing its story. Re-displays existing validated
// lines only; renders only when at least two stories carry a move.
function renderTheMoves(stories) {
  const rows = stories
    .map((story, index) => ({ story, index }))
    .filter((entry) => entry.story.nextMove);
  if (rows.length < 2) return "";
  const items = rows.map(({ story, index }) =>
    `    <li><span class="five-num">${padNum(index + 1)}</span><span class="move-text">${escapeHtml(story.nextMove)}</span><a class="move-ref" href="#story-${index + 1}">Story ${padNum(index + 1)}</a></li>`
  ).join("\n");
  return `<section>
  <h2>Where this connects</h2>
  <p class="meta">Five ways this week's news lines up with what NK is already building.</p>
  <ol class="moves">
${items}
  </ol>
</section>`;
}

// №3: signal-grade triage mark — three pure-CSS squares surfacing the relevance
// grade the AI lane already assigns (high 3/3, medium 2/3, low 1/3). Per-story
// conditional; no grade, no ink. Labeled as AI-assessed for honesty.
const SIGNAL_LEVELS = { high: 3, medium: 2, low: 1 };

function signalGlyph(story) {
  const level = story.aiRelevance;
  const filled = SIGNAL_LEVELS[level];
  if (!filled) return "";
  const cells = [1, 2, 3].map((cell) => `<b${cell <= filled ? ' class="on"' : ""}></b>`).join("");
  return `<span class="sig" role="img" title="Signal: ${level} (AI-assessed)" aria-label="Signal: ${level}, ${filled} of 3, AI-assessed">${cells}</span>`;
}

// Translation layer: the plain-language reader headline leads wherever reading
// happens; the factual original never leaves the page (wire line below).
function displayHeadline(story) {
  return story.readerHeadline || story.headline;
}

function wireLine(story) {
  if (!story.readerHeadline || story.readerHeadline === story.headline) return "";
  return `
  <p class="wire-line">Filed as: ${escapeHtml(story.headline)}</p>`;
}

// B: numbered one-line index of the issue, anchor-linked to each story.
function renderWeekInFive(stories) {
  if (!stories.length) return "";
  const items = stories.map((story, index) =>
    `    <li><span class="five-num">${padNum(index + 1)}</span><a href="#story-${index + 1}">${escapeHtml(displayHeadline(story))}</a>${signalGlyph(story)}</li>`
  ).join("\n");
  return `<ol class="week-five">
${items}
  </ol>`;
}

// D: one oversized, sourced editorial stat. Renders only when the edition
// provides one — never synthesized.
function renderPullStat(pullStat) {
  if (!pullStat || !pullStat.value || !pullStat.caption) return "";
  return `<section class="pull-stat">
  <p class="pull-stat-value">${escapeHtml(pullStat.value)}</p>
  <p class="pull-stat-caption">${escapeHtml(pullStat.caption)}</p>
  ${pullStat.sourceLabel ? `<p class="pull-stat-source">${escapeHtml(pullStat.sourceLabel)}</p>` : ""}
</section>`;
}

function renderLead(story) {
  return `<section class="lead-story" id="story-1">
  <p class="meta"><span class="story-num">01</span>Lead story${signalGlyph(story)}</p>
  ${renderStoryMeta(story)}
  <h2>${escapeHtml(displayHeadline(story))}</h2>${wireLine(story)}
  <p class="story-body">${escapeHtml(story.summary)}</p>
  ${whyCallout(story)}
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
${stories.map((story, index) => renderCard(story, index)).join("\n")}
  </div>
</section>`;
}

function renderCard(story, index) {
  return `<article class="story-card" id="story-${index + 2}">
  <p class="story-num">${padNum(index + 2)}${signalGlyph(story)}</p>
  ${renderStoryMeta(story)}
  <h3>${escapeHtml(displayHeadline(story))}</h3>${wireLine(story)}
  <p class="story-body">${escapeHtml(story.summary)}</p>
  ${whyCallout(story)}
  ${readLink(story)}
</article>`;
}

// C + I: "Why it matters" and the operator "Next move" as one calm two-line
// callout. The next-move line renders only when the edition provides it.
function whyCallout(story) {
  if (!story.whyItMatters && !story.nextMove) return "";
  const why = story.whyItMatters
    ? `<span class="callout-line"><strong>Why it matters</strong> ${escapeHtml(story.whyItMatters)}</span>`
    : "";
  const move = story.nextMove
    ? `<span class="callout-line next-move"><strong>Next move</strong> ${escapeHtml(story.nextMove)}</span>`
    : "";
  return `<p class="why-callout">${why}${move}</p>`;
}

function padNum(value) {
  return String(value).padStart(2, "0");
}

// C: compact claim-fit badge, shown only when the edition supplies sourceType.
const SOURCE_TYPE_LABELS = {
  official_primary: "Official",
  premium_independent: "Independent press",
  verified_expert: "Verified expert"
};

function sourceTypeBadge(story) {
  const label = SOURCE_TYPE_LABELS[story.sourceType];
  return label ? `<span class="source-type">${escapeHtml(label)}</span>` : "";
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
  // External sources open in a new tab so the brief stays put; noopener for safety.
  return url ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Read source</a></p>` : "";
}

function renderStoryMeta(story) {
  const source = story.sourceOutlet || story.sourceName || "source unavailable";
  const scan = story.scanLabel || (story.sourceOutlet ? story.sourceName : "");
  return `<p class="story-meta">
    <span><strong>Source:</strong> ${escapeHtml(source)}</span>${sourceTypeBadge(story)}
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
  return `<p class="nk-relevance"><strong>Why this touches NK:</strong> ${escapeHtml(labels)}</p>`;
}

function renderWatchlist(watchlist) {
  if (!watchlist.length) return "";
  const items = watchlist.map((entry) => {
    const url = safeUrl(entry.url);
    const title = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.title)}</a>` : escapeHtml(entry.title);
    const outlet = entry.sourceOutlet ? ` — ${escapeHtml(entry.sourceOutlet)}` : "";
    const capabilities = entry.normaRelevance?.capabilities ?? [];
    const labels = capabilities.map((capability) => capability.label ?? capability).join(", ");
    const badge = labels ? ` <span class="story-meta">[NK: ${escapeHtml(labels)}]</span>` : "";
    return `<li>${title}${outlet}${badge}</li>`;
  }).join("\n");
  return `<section>
  <h2>Also worth knowing</h2>
  <p class="meta">Stories that made the shortlist but not this week's five.</p>
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

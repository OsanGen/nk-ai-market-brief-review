import { escapeHtml, safeUrl } from "./normalize.mjs";

export function renderHtml({ stories, generatedAt }) {
  const [lead, ...rest] = stories;
  const body = lead ? `${renderLead(lead)}${renderCards(rest)}` : `<section><p>No qualifying stories matched the current filters.</p></section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NK AI Market Brief</title>
  <style>
    body { margin: 0; background: #fff; color: #000; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
    main { max-width: 960px; margin: 0 auto; padding: 28px 18px 40px; }
    header { border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.05; letter-spacing: 0; }
    h2, h3 { margin: 0; line-height: 1.15; letter-spacing: 0; }
    p { margin: 8px 0; }
    a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    .meta, footer { color: #333; font-size: 13px; }
    .lead { border-bottom: 1px solid #000; padding-bottom: 22px; margin-bottom: 22px; }
    .lead h2 { font-size: 28px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .card { border: 1px solid #000; padding: 14px; min-width: 0; }
    .card h3 { font-size: 18px; }
    footer { border-top: 1px solid #000; margin-top: 28px; padding-top: 14px; }
    @media (max-width: 680px) { .grid { grid-template-columns: 1fr; } h1 { font-size: 28px; } .lead h2 { font-size: 23px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>NK AI Market Brief</h1>
      <p>AI, fashion, beauty, e-commerce, AI shopping, and agentic commerce signals.</p>
      <p class="meta">Generated ${escapeHtml(formatDate(generatedAt))}</p>
    </header>
    ${body}
    <footer>
      <p>Internal NK market brief. Summaries are deterministic and based on RSS metadata only.</p>
    </footer>
  </main>
</body>
</html>
`;
}

function renderLead(story) {
  return `<section class="lead">
  <p class="meta">${escapeHtml(meta(story))}</p>
  <h2>${escapeHtml(story.headline)}</h2>
  <p>${escapeHtml(story.summary)}</p>
  <p>${escapeHtml(story.whyItMatters)}</p>
  ${readLink(story)}
</section>`;
}

function renderCards(stories) {
  if (!stories.length) return "";
  return `<section class="grid">${stories.map(renderCard).join("\n")}</section>`;
}

function renderCard(story) {
  return `<article class="card">
  <p class="meta">${escapeHtml(meta(story))}</p>
  <h3>${escapeHtml(story.headline)}</h3>
  <p>${escapeHtml(story.summary)}</p>
  <p>${escapeHtml(story.whyItMatters)}</p>
  ${readLink(story)}
</article>`;
}

function readLink(story) {
  const url = safeUrl(story.url);
  return url ? `<p><a href="${escapeHtml(url)}">Read source</a></p>` : "";
}

function meta(story) {
  return `${story.sourceName} | ${story.category ?? "market"} | ${formatDate(story.publishedAt)}`;
}

function formatDate(value) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "date unavailable" : date.toISOString().slice(0, 10);
}

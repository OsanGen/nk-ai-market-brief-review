import { sanitizeDisplayText, safeUrl } from "./normalize.mjs";

export function renderText({ stories, generatedAt, curation }) {
  const lines = [
    "NK AI Market Brief",
    `Generated ${generatedAt}`,
    "",
    "AI, fashion, beauty, e-commerce, AI shopping, and agentic commerce signals.",
    ""
  ];

  stories.forEach((story, index) => {
    lines.push(index === 0 ? "LEAD STORY" : `STORY ${index + 1}`);
    lines.push(clean(story.readerHeadline || story.headline));
    if (story.readerHeadline && story.readerHeadline !== story.headline) lines.push(`Filed as: ${clean(story.headline)}`);
    lines.push(`Source: ${clean(story.sourceOutlet || story.sourceName)}`);
    lines.push(`Category: ${clean(story.category ?? "market")}`);
    if (story.scanLabel || story.sourceOutlet) lines.push(`Scan: ${clean(story.scanLabel || story.sourceName)}`);
    if (story.publishedAt) lines.push(`Date: ${story.publishedAt.slice(0, 10)}`);
    lines.push(`Summary: ${clean(story.summary)}`);
    lines.push(`Why it matters: ${clean(story.whyItMatters)}`);
    lines.push(`Read source: ${safeUrl(story.url)}`);
    lines.push("");
  });

  if (!stories.length) lines.push("No qualifying stories matched the current filters.", "");
  // Curation-funnel parity with the web page (renders only when coherent).
  if (curation && curation.candidate > curation.selected && curation.selected > 0) {
    const middle = curation.accepted > 0 && curation.candidate >= curation.accepted && curation.accepted >= curation.selected
      ? `, shortlisted ${curation.accepted},`
      : "";
    lines.push(`This week we went through ${curation.candidate} stories${middle} and chose these ${curation.selected}.`, "");
  }
  lines.push("Internal NK market brief. Summaries are deterministic and based on RSS metadata only.");
  return `${lines.join("\n").trim()}\n`;
}

function clean(value) {
  return sanitizeDisplayText(value).replace(/[<>]/g, "");
}

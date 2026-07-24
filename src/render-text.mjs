import { sanitizeDisplayText, safeUrl } from "./normalize.mjs";

export function renderText({ stories, generatedAt }) {
  const lines = [
    "NK AI Market Brief",
    `Generated ${generatedAt}`,
    "",
    "AI, fashion, beauty, e-commerce, AI shopping, and agentic commerce signals.",
    ""
  ];

  stories.forEach((story, index) => {
    lines.push(index === 0 ? "LEAD STORY" : `STORY ${index + 1}`);
    lines.push(clean(story.headline));
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
  lines.push("Internal NK market brief. Summaries are deterministic and based on RSS metadata only.");
  return `${lines.join("\n").trim()}\n`;
}

function clean(value) {
  return sanitizeDisplayText(value).replace(/[<>]/g, "");
}

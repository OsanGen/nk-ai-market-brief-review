export function normalizeFeedItem(item, source) {
  const title = stripTags(item.title ?? "");
  const url = safeUrl(item.link ?? item.guid ?? "");
  const publishedAt = normalizeDate(item.isoDate ?? item.pubDate ?? item.date);
  const summary = stripTags(item.contentSnippet ?? item.summary ?? item.content ?? item.description ?? "");

  return {
    id: hash(`${source.id}|${url}|${title}|${publishedAt}`),
    sourceId: source.id,
    sourceName: source.name,
    sourceWeight: source.weight,
    title,
    url,
    publishedAt,
    summary,
    sourceHomepageUrl: source.homepageUrl,
    categories: source.categories,
    raw: {
      title: item.title ?? "",
      link: item.link ?? "",
      pubDate: item.pubDate ?? "",
      source: item.source ?? ""
    }
  };
}

export function stripTags(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[a-z][\s\S]*?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeHtml(value = "") {
  return sanitizeDisplayText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeDisplayText(value = "") {
  return String(value)
    .replace(/javascript:/gi, "blocked-protocol:")
    .replace(/\bon(?:error|click)\s*=/gi, "blocked-event=")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function hash(value) {
  let out = 0;
  for (const char of value) out = (out * 31 + char.charCodeAt(0)) >>> 0;
  return out.toString(36);
}

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref"]);

export function dedupeItems(items) {
  const kept = [];
  const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const item of sorted) {
    const canonical = canonicalUrl(item.url);
    const duplicate = kept.find((existing) => {
      if (canonical && canonical === canonicalUrl(existing.url)) return true;
      return titleOverlap(item.title, existing.title) > 0.82;
    });
    if (!duplicate) kept.push(item);
  }

  return kept.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function canonicalUrl(value = "") {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function titleOverlap(a = "", b = "") {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.max(left.size, right.size);
}

function titleTokens(title = "") {
  return new Set(
    title
      .toLowerCase()
      .replace(/\s[-–—]\s[^-–—|]{2,80}$/g, " ")
      .replace(/\s\|\s[^|]{2,80}$/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

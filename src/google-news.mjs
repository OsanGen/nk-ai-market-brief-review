const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";

export function buildGoogleNewsRssUrl(query) {
  return `${GOOGLE_NEWS_RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

// Private / loopback / link-local IPv4 ranges (incl. the cloud metadata IP).
const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./
];

// Guard direct_rss feed URLs: google_news_rss URLs are built to a fixed public
// host, but a direct_rss row is operator-supplied config and is passed straight
// to fetch. Reject non-http(s) schemes and obvious internal hosts so a mistaken
// or malicious registry row cannot turn the fetcher into an SSRF probe of the
// runner's internal network or the cloud metadata endpoint. (DNS-rebinding is out
// of scope for this synchronous shape check.)
export function assertSafeFeedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error("invalid_feed_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported_feed_scheme");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1") {
    throw new Error("blocked_internal_host");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && PRIVATE_IPV4.some((range) => range.test(host))) {
    throw new Error("blocked_internal_host");
  }
  return String(rawUrl);
}

export function sourceToFeedUrl(source) {
  if (source.mode === "google_news_rss") return buildGoogleNewsRssUrl(source.query);
  if (source.mode === "direct_rss") return assertSafeFeedUrl(source.query);
  throw new Error(`Unsupported source mode: ${source.mode}`);
}

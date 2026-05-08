const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";

export function buildGoogleNewsRssUrl(query) {
  return `${GOOGLE_NEWS_RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export function sourceToFeedUrl(source) {
  if (source.mode === "google_news_rss") return buildGoogleNewsRssUrl(source.query);
  if (source.mode === "direct_rss") return source.query;
  throw new Error(`Unsupported source mode: ${source.mode}`);
}

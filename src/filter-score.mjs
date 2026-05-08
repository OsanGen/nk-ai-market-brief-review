const HIGH_PRIORITY_PHRASES = [
  "agentic commerce",
  "ai shopping",
  "ai stylist",
  "ai product discovery",
  "ai recommendations",
  "ai retail",
  "ai beauty",
  "ai fashion",
  "virtual try-on",
  "instant checkout",
  "commerce protocol",
  "product feed",
  "catalog data",
  "shopify catalog",
  "agentic storefronts"
];
const CONTEXTUAL_HIGH_PRIORITY_PHRASES = ["ai search"];

const AI_TERMS = [
  "ai",
  "artificial intelligence",
  "agent",
  "agents",
  "agentic",
  "assistant",
  "assistants",
  "generative",
  "machine learning",
  "recommendations",
  "personalization",
  "search",
  "discovery"
];

const VERTICAL_TERMS = [
  "fashion",
  "beauty",
  "retail",
  "shopping",
  "shopper",
  "ecommerce",
  "e-commerce",
  "commerce",
  "brand",
  "brands",
  "luxury",
  "nike",
  "ralph lauren",
  "sephora",
  "ulta",
  "lvmh",
  "kering",
  "zara",
  "h&m",
  "revolve",
  "walmart",
  "target",
  "amazon",
  "shopify",
  "openai",
  "google",
  "meta"
];
const MARKET_TERMS = [
  "fashion",
  "beauty",
  "retail",
  "shopping",
  "shopper",
  "ecommerce",
  "e-commerce",
  "commerce",
  "luxury",
  "product",
  "products",
  "catalog",
  "checkout",
  "storefront",
  "brand",
  "brands"
];

const EXCLUDE_UNLESS_AI_CENTRAL = [
  "celebrity",
  "runway",
  "tariff",
  "tariffs",
  "earnings",
  "operations",
  "supply-chain",
  "supply chain",
  "meghan",
  "prince harry",
  "royal expert",
  "openpr.com",
  "market is going to boom",
  "market is going to booming"
];

export function filterAndScoreItems(items, options = {}) {
  const accepted = [];
  const rejected = [];
  const now = options.now ? new Date(options.now) : new Date();
  const lookbackHours = options.lookbackHours ?? 36;

  for (const item of items) {
    const result = evaluateItem(item, now, lookbackHours);
    if (!result.include) {
      rejected.push({ sourceId: item.sourceId, sourceName: item.sourceName, reason: result.reason });
      continue;
    }
    accepted.push({ ...item, score: result.score, matchSignals: result.signals });
  }

  return { accepted: accepted.sort(sortByScore), rejected };
}

export function evaluateItem(item, now = new Date(), lookbackHours = 36) {
  if (!item.title || !item.url) return reject("missing_title_or_url");

  const published = item.publishedAt ? new Date(item.publishedAt) : null;
  if (!published || Number.isNaN(published.getTime())) return reject("missing_or_invalid_date");

  const ageHours = (now.getTime() - published.getTime()) / 3600000;
  if (ageHours > lookbackHours) return reject("outside_lookback");
  if (ageHours < -1) return reject("future_date");

  const title = normalize(item.title);
  const summary = normalize(item.summary);
  const combined = `${title} ${summary}`;
  const highPriorityTitle = countMatches(title, HIGH_PRIORITY_PHRASES);
  const highPrioritySummary = countMatches(summary, HIGH_PRIORITY_PHRASES);
  const contextualPriorityTitle = countMatches(title, CONTEXTUAL_HIGH_PRIORITY_PHRASES);
  const contextualPrioritySummary = countMatches(summary, CONTEXTUAL_HIGH_PRIORITY_PHRASES);
  const aiTitle = countMatches(title, AI_TERMS);
  const aiSummary = countMatches(summary, AI_TERMS);
  const verticalTitle = countMatches(title, VERTICAL_TERMS);
  const verticalSummary = countMatches(summary, VERTICAL_TERMS);
  const marketTitle = countMatches(title, MARKET_TERMS);
  const marketSummary = countMatches(summary, MARKET_TERMS);
  const marketMatches = marketTitle + marketSummary;
  const highPriorityMatches = highPriorityTitle + highPrioritySummary;
  const contextualPriorityMatches = marketMatches > 0 ? contextualPriorityTitle + contextualPrioritySummary : 0;
  const totalPriorityMatches = highPriorityMatches + contextualPriorityMatches;
  const aiMatches = aiTitle + aiSummary;
  const verticalMatches = verticalTitle + verticalSummary;
  const hasExcludedContext = containsAny(combined, EXCLUDE_UNLESS_AI_CENTRAL);
  const aiCentral = totalPriorityMatches > 0 || aiTitle > 0;
  const include = totalPriorityMatches > 0 || (aiMatches > 0 && verticalMatches > 0 && marketMatches > 0 && (!hasExcludedContext || aiCentral));

  if (!include) return reject("not_relevant");

  const recency = Math.max(0, 10 - Math.floor(Math.max(ageHours, 0) / 6));
  const score =
    highPriorityTitle * 18 +
    contextualPriorityTitle * 12 +
    highPrioritySummary * 10 +
    contextualPrioritySummary * 6 +
    aiTitle * 8 +
    aiSummary * 3 +
    verticalTitle * 6 +
    verticalSummary * 2 +
    Number(item.sourceWeight ?? 1) +
    recency;

  return {
    include: true,
    score,
    signals: {
      highPriorityMatches,
      contextualPriorityMatches,
      aiMatches,
      verticalMatches,
      marketMatches,
      ageHours: Number(ageHours.toFixed(2))
    }
  };
}

function reject(reason) {
  return { include: false, reason, score: 0, signals: {} };
}

function countMatches(text, terms) {
  return terms.reduce((count, term) => (matchesTerm(text, term) ? count + 1 : count), 0);
}

function containsAny(text, terms) {
  return terms.some((term) => matchesTerm(text, term));
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesTerm(text, term) {
  const escaped = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function sortByScore(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return String(b.publishedAt).localeCompare(String(a.publishedAt));
}

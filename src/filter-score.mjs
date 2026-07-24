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
const HARD_EXCLUDE_TERMS = [
  "openpr.com",
  "market size",
  "market share",
  "market growth",
  "market forecast",
  "emerging growth trends",
  "compound annual growth"
];

export function filterAndScoreItems(items, options = {}) {
  const accepted = [];
  const rejected = [];
  const now = options.now ? new Date(options.now) : new Date();
  const lookbackHours = options.lookbackHours ?? 36;
  // Optional Norma stack-profile relevance groups ([{id,label,terms}], from
  // src/stack-profile.mjs). Absent groups leave scoring byte-identical.
  const relevanceGroups = Array.isArray(options.relevanceGroups) ? options.relevanceGroups : [];

  for (const item of items) {
    const result = evaluateItem(item, now, lookbackHours, relevanceGroups);
    if (!result.include) {
      rejected.push({ sourceId: item.sourceId, sourceName: item.sourceName, reason: result.reason });
      continue;
    }
    accepted.push({ ...item, score: result.score, matchSignals: result.signals, normaRelevance: result.normaRelevance });
  }

  return { accepted: accepted.sort(sortByScore), rejected };
}

// Norma-relevance: a story matters more when it touches a capability the House
// platform actually runs (AI stylist, try-on, headless Shopify, Klaviyo, ...).
// A capability "hits" when any of its terms word-boundary-matches; title hits
// score higher than summary-only hits, and the total boost is capped so stack
// affinity sharpens ranking without drowning the editorial signals.
const NORMA_TITLE_BONUS = 7;
const NORMA_SUMMARY_BONUS = 3;
const NORMA_BONUS_CAP = 24;

export function evaluateNormaRelevance(title, summary, relevanceGroups) {
  const capabilities = [];
  let bonus = 0;
  for (const group of relevanceGroups) {
    const inTitle = group.terms.some((term) => matchesTerm(title, term));
    const inSummary = !inTitle && group.terms.some((term) => matchesTerm(summary, term));
    if (!inTitle && !inSummary) continue;
    capabilities.push({ id: group.id, label: group.label, matchedIn: inTitle ? "title" : "summary" });
    bonus += inTitle ? NORMA_TITLE_BONUS : NORMA_SUMMARY_BONUS;
  }
  return { capabilities, bonus: Math.min(bonus, NORMA_BONUS_CAP) };
}

export function evaluateItem(item, now = new Date(), lookbackHours = 36, relevanceGroups = []) {
  if (!item.title || !item.url) return reject("missing_title_or_url");

  const published = item.publishedAt ? new Date(item.publishedAt) : null;
  if (!published || Number.isNaN(published.getTime())) return reject("missing_or_invalid_date");

  const ageHours = (now.getTime() - published.getTime()) / 3600000;
  if (ageHours > lookbackHours) return reject("outside_lookback");
  if (ageHours < -1) return reject("future_date");

  const title = normalize(item.title);
  const summary = normalize(item.summary);
  const combined = `${title} ${summary}`;
  if (containsAny(combined, HARD_EXCLUDE_TERMS)) return reject("blocked_market_noise");
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
  // The contextual phrase ("ai search") only counts as a signal in a commerce
  // context. Gate its SCORE contribution on the same marketMatches condition as
  // its inclusion contribution, so a non-commerce item cannot collect ranking
  // points for a signal the pipeline has decided is meaningless (and so the score
  // never contradicts the emitted contextualPriorityMatches signal).
  const contextualTitleScore = marketMatches > 0 ? contextualPriorityTitle : 0;
  const contextualSummaryScore = marketMatches > 0 ? contextualPrioritySummary : 0;
  const contextualPriorityMatches = contextualTitleScore + contextualSummaryScore;
  const totalPriorityMatches = highPriorityMatches + contextualPriorityMatches;
  const aiMatches = aiTitle + aiSummary;
  const verticalMatches = verticalTitle + verticalSummary;
  const hasExcludedContext = containsAny(combined, EXCLUDE_UNLESS_AI_CENTRAL);
  const aiCentral = totalPriorityMatches > 0 || aiTitle > 0;
  const include = totalPriorityMatches > 0 || (aiMatches > 0 && verticalMatches > 0 && marketMatches > 0 && (!hasExcludedContext || aiCentral));

  if (!include) return reject("not_relevant");

  const recency = Math.max(0, 10 - Math.floor(Math.max(ageHours, 0) / 6));
  const normaRelevance = evaluateNormaRelevance(title, summary, relevanceGroups);
  const score =
    highPriorityTitle * 18 +
    contextualTitleScore * 12 +
    highPrioritySummary * 10 +
    contextualSummaryScore * 6 +
    aiTitle * 8 +
    aiSummary * 3 +
    verticalTitle * 6 +
    verticalSummary * 2 +
    normaRelevance.bonus +
    Number(item.sourceWeight ?? 1) +
    recency;

  return {
    include: true,
    score,
    normaRelevance,
    signals: {
      highPriorityMatches,
      contextualPriorityMatches,
      aiMatches,
      verticalMatches,
      marketMatches,
      normaRelevanceMatches: normaRelevance.capabilities.length,
      normaRelevanceBonus: normaRelevance.bonus,
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

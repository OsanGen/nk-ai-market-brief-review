const CLUSTERS = [
  {
    id: "meta_instagram_shopping_agents",
    label: "Meta / Instagram / Hatch shopping agents",
    terms: ["meta", "instagram", "hatch", "tiktok shop"]
  },
  {
    id: "google_cloud_virtual_try_on",
    label: "Google Cloud / virtual try-on",
    terms: ["google cloud virtual try-on", "virtual try-on", "try-on"]
  },
  {
    id: "openai_chatgpt_commerce",
    label: "OpenAI / ChatGPT commerce",
    terms: ["openai", "chatgpt", "agentic commerce protocol", "instant checkout"]
  },
  {
    id: "shopify_catalog_agentic_storefronts",
    label: "Shopify / Shopify Catalog / Agentic Storefronts",
    terms: ["shopify", "shopify catalog", "agentic storefronts"]
  },
  {
    id: "beauty_ai_discovery",
    label: "beauty AI discovery",
    terms: ["beauty", "sephora", "ulta", "skin", "makeup"]
  },
  {
    id: "fashion_ai_discovery",
    label: "fashion AI discovery",
    terms: ["fashion", "luxury", "stylist", "pinterest", "discovery"]
  },
  {
    id: "agentic_commerce_platform_race",
    label: "agentic commerce platform race",
    terms: ["agentic commerce", "ai shopping", "shopping agent", "shopping assistant", "product discovery", "checkout"]
  }
];

const MAX_PER_CLUSTER = 2;
const MIN_REVIEW_ITEMS = 5;

export function selectDiverseItems(items, maxItems, options = {}) {
  const targetMin = options.minItems ?? MIN_REVIEW_ITEMS;
  const allowClusterLimit = items.length >= targetMin;
  const selected = [];
  const remaining = [...items].sort(sortByScore);
  const skipped = [];
  const clusterCounts = new Map();
  const sourceCounts = new Map();
  const categoryCounts = new Map();

  while (remaining.length && selected.length < maxItems) {
    const bestIndex = bestCandidateIndex(remaining, { clusterCounts, sourceCounts, categoryCounts, allowClusterLimit });
    const [item] = remaining.splice(bestIndex, 1);
    const cluster = topicCluster(item).id;

    if (allowClusterLimit && (clusterCounts.get(cluster) ?? 0) >= MAX_PER_CLUSTER) {
      skipped.push(item);
      continue;
    }

    selected.push(withCluster(item));
    increment(clusterCounts, cluster);
    increment(sourceCounts, sourceKey(item));
    increment(categoryCounts, item.categories?.[0] ?? "market");
  }

  for (const item of [...remaining, ...skipped].sort(sortByScore)) {
    if (selected.length >= maxItems || selected.length >= targetMin) break;
    if (selected.some((existing) => existing.id === item.id)) continue;
    selected.push(withCluster(item));
  }

  return selected;
}

export function topicCluster(item) {
  const text = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
  const cluster = CLUSTERS.find((entry) => entry.terms.some((term) => text.includes(term)));
  return cluster ?? { id: "other_ai_market_signal", label: "other AI market signal" };
}

export function outletName(item) {
  const raw = item.sourceOutlet || item.raw?.source || "";
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    return String(raw.title || raw.name || raw._ || "").trim();
  }
  return "";
}

function withCluster(item) {
  const cluster = topicCluster(item);
  return {
    ...item,
    topicCluster: cluster.label,
    sourceOutlet: outletName(item)
  };
}

function bestCandidateIndex(items, counts) {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < items.length; index += 1) {
    const score = diversityScore(items[index], counts);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function diversityScore(item, { clusterCounts, sourceCounts, categoryCounts, allowClusterLimit }) {
  const cluster = topicCluster(item).id;
  const clusterCount = clusterCounts.get(cluster) ?? 0;
  if (allowClusterLimit && clusterCount >= MAX_PER_CLUSTER) return Number.NEGATIVE_INFINITY;

  const sourceCount = sourceCounts.get(sourceKey(item)) ?? 0;
  const categoryCount = categoryCounts.get(item.categories?.[0] ?? "market") ?? 0;
  const otherPenalty = cluster === "other_ai_market_signal" ? 18 : 0;
  return (item.score ?? 0) - clusterCount * 24 - sourceCount * 8 - categoryCount * 5 - otherPenalty;
}

function sourceKey(item) {
  return outletName(item) || item.sourceName || item.sourceId || "source";
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortByScore(a, b) {
  if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
  return String(b.publishedAt).localeCompare(String(a.publishedAt));
}

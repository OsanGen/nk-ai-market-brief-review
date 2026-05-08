const SOURCE_SUFFIXES = [
  "glossy.co",
  "glossy",
  "vogue business",
  "bof",
  "business of fashion",
  "beautymatter",
  "retail touchpoints",
  "shopify",
  "openai developers",
  "google",
  "fast company",
  "msn",
  "emarketer",
  "ai magazine",
  "technology magazine",
  "fibre2fashion",
  "the information",
  "let's data science",
  "glenbrook partners",
  "bestmediainfo.com",
  "slashgear",
  "digital trends"
];

export function summarizeItems(items) {
  return items.map((item) => summarizeItem(item));
}

export function summarizeItem(item) {
  const category = item.categories?.[0] ?? "market";
  const title = cleanTitle(item.title, item.sourceName);
  const text = `${title} ${item.summary ?? ""}`;

  return {
    ...item,
    title,
    headline: sentence(title),
    summary: sentence(summaryFor(item, title)),
    whyItMatters: whyItMatters(text, category),
    category
  };
}

export function cleanTitle(value = "", sourceName = "") {
  let title = cleanText(value);
  title = stripSuffix(title, SOURCE_SUFFIXES);
  title = stripSuffix(title, sourceNameParts(sourceName));
  return title.replace(/\s+[-|]\s*$/g, "").trim();
}

function summaryFor(item, title) {
  const summary = cleanTitle(item.summary || "", item.sourceName);
  if (isUsefulSummary(summary, title)) return summary;
  return fallbackSummary(`${title} ${item.summary ?? ""}`, item.categories?.[0] ?? "market");
}

function fallbackSummary(text, category) {
  const normalized = text.toLowerCase();

  if (normalized.includes("pinterest") && normalized.includes("ai discovery")) {
    return "Pinterest is positioning AI as a discovery layer for luxury shopping rather than a direct answer engine.";
  }
  if (normalized.includes("agentic commerce")) {
    return "Agentic commerce is moving into shopping workflows that can affect discovery, checkout expectations, and catalog readiness.";
  }
  if (normalized.includes("ai shopping agent") || normalized.includes("ai shopping assistant") || normalized.includes("shopping agents")) {
    return "AI shopping agents are becoming a more visible path for product discovery and purchase decisions.";
  }
  if (normalized.includes("virtual try-on")) {
    return "Virtual try-on is becoming a more visible AI layer for fashion and beauty discovery.";
  }
  if (normalized.includes("ai beauty") || category === "beauty") {
    return "Beauty discovery is moving toward AI-assisted recommendations and product evaluation.";
  }
  if (normalized.includes("shopify") || normalized.includes("catalog") || normalized.includes("storefront")) {
    return "Commerce platforms are preparing product data and storefronts for AI-assisted shopping.";
  }
  if (normalized.includes("ai discovery") || normalized.includes("product discovery") || normalized.includes("ai search")) {
    return "AI-mediated discovery is becoming a more important layer before shoppers reach a product page.";
  }
  if (normalized.includes("fashion") || category === "fashion") {
    return "Fashion and retail teams are testing AI as part of product discovery and customer decision-making.";
  }

  return "This signal points to AI becoming a more active layer in retail, commerce, or brand discovery.";
}

function whyItMatters(text, category) {
  const normalized = text.toLowerCase();

  if (normalized.includes("agentic commerce") || normalized.includes("instant checkout") || normalized.includes("commerce protocol")) {
    return "This matters because agentic shopping channels can shift product discovery, checkout expectations, and catalog readiness.";
  }
  if (normalized.includes("virtual try-on")) {
    return "This matters because try-on experiences can change how fashion and beauty shoppers evaluate products before purchase.";
  }
  if (normalized.includes("ai beauty") || category === "beauty") {
    return "This matters because beauty discovery is moving toward algorithmic recommendations that may influence broader shopping behavior.";
  }
  if (platformMove(normalized)) {
    return "This matters because OpenAI, Shopify, Google, Meta, and major retailers can change how products surface in AI-assisted shopping.";
  }
  if (normalized.includes("ai discovery") || normalized.includes("product discovery") || normalized.includes("ai search")) {
    return "This matters because AI-mediated discovery may change how luxury and fashion brands are found before shoppers reach a product page.";
  }

  return "This matters because AI-assisted shopping can influence how consumers discover, compare, and buy products.";
}

function isUsefulSummary(summary, title) {
  if (!summary) return false;
  const summaryNorm = normalizeForCompare(summary);
  const titleNorm = normalizeForCompare(title);
  if (!summaryNorm || summaryNorm === titleNorm) return false;
  if (summaryNorm.includes(titleNorm) && summaryNorm.length <= titleNorm.length + 20) return false;
  return summary.split(/\s+/).length >= 8;
}

function stripSuffix(title, suffixes) {
  return suffixes.reduce((current, suffix) => {
    if (!suffix) return current;
    const escaped = escapeRegExp(suffix);
    return current
      .replace(new RegExp(`\\s[-–—]\\s*${escaped}\\.?$`, "i"), "")
      .replace(new RegExp(`\\s\\|\\s*${escaped}\\.?$`, "i"), "")
      .trim();
  }, title);
}

function sourceNameParts(sourceName = "") {
  return [
    sourceName,
    sourceName.replace(/\bAI\b/gi, "").trim(),
    sourceName.replace(/\bMarket Scan\b/gi, "").trim()
  ];
}

function sentence(value = "") {
  const clean = cleanText(value);
  if (!clean) return "No RSS summary was provided.";
  const first = clean.split(/(?<=[.!?])\s+/)[0].trim();
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function platformMove(text) {
  return ["openai", "shopify", "google", "meta", "amazon", "walmart"].some((term) => text.includes(term));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

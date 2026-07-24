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
  "digital trends",
  "campaign middle east"
];

export function summarizeItems(items) {
  const counts = { summaries: new Map(), reasons: new Map() };
  return items.map((item, index) => {
    const story = summarizeItem(item);
    story.summary = uniqueSentence(story.summary, summaryVariants(story, item), counts.summaries, index);
    story.whyItMatters = uniqueSentence(story.whyItMatters, whyVariants(story, item), counts.reasons, index);
    return story;
  });
}

export function summarizeItem(item) {
  const category = item.categories?.[0] ?? "market";
  let title = cleanTitle(item.title, item.sourceName);
  title = cleanTitle(title, item.sourceOutlet);
  const text = `${title} ${item.summary ?? ""}`;

  return {
    ...item,
    title,
    headline: sentence(title),
    summary: sentence(summaryFor(item, title)),
    whyItMatters: whyItMatters(text, category),
    category,
    scanLabel: item.sourceName,
    sourceOutlet: item.sourceOutlet || outletFromRaw(item.raw?.source)
  };
}

export function cleanTitle(value = "", sourceName = "") {
  let title = cleanText(value);
  title = stripSuffix(title, SOURCE_SUFFIXES);
  title = stripSuffix(title, sourceNameParts(sourceName));
  return title.replace(/\s+[-|]\s*$/g, "").trim();
}

function summaryFor(item, title) {
  let summary = cleanTitle(item.summary || "", item.sourceName);
  summary = stripTrailingOutlet(summary, item.sourceOutlet);
  if (isUsefulSummary(summary, title)) return summary;
  return fallbackSummary(`${title} ${item.summary ?? ""}`, item.categories?.[0] ?? "market");
}

function fallbackSummary(text, category) {
  const normalized = text.toLowerCase();

  if (normalized.includes("pinterest") && normalized.includes("ai discovery")) {
    return "Pinterest is positioning AI as a discovery layer for luxury shopping rather than a direct answer engine.";
  }
  if (normalized.includes("agentic commerce")) {
    return "This story points to AI shopping becoming a new discovery path before customers reach a brand site.";
  }
  if (normalized.includes("ai shopping agent") || normalized.includes("ai shopping assistant") || normalized.includes("shopping agents")) {
    return "This story shows AI assistants moving closer to the shopping interface on major platforms.";
  }
  if (normalized.includes("virtual try-on")) {
    return "This item points to virtual try-on becoming part of how shoppers evaluate luxury products before purchase.";
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
  if (normalized.includes("meta") || normalized.includes("instagram") || normalized.includes("hatch")) {
    return "This matters because social platforms can shift shopping discovery before shoppers reach a brand site.";
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

function uniqueSentence(current, variants, counts, index) {
  const choices = [current, ...variants].map(sentence).filter(Boolean);
  for (const choice of choices) {
    if ((counts.get(normalizeForCompare(choice)) ?? 0) < 2) {
      counts.set(normalizeForCompare(choice), (counts.get(normalizeForCompare(choice)) ?? 0) + 1);
      return choice;
    }
  }
  const fallback = choices[index % choices.length] ?? current;
  counts.set(normalizeForCompare(fallback), (counts.get(normalizeForCompare(fallback)) ?? 0) + 1);
  return fallback;
}

function summaryVariants(story, item) {
  const text = `${story.title} ${item.summary ?? ""}`.toLowerCase();
  if (text.includes("meta") || text.includes("instagram") || text.includes("hatch")) {
    return [
      "Meta's shopping-agent work points to AI becoming part of product discovery inside social commerce.",
      "This story shows AI assistants moving closer to the shopping interface on major social platforms."
    ];
  }
  if (text.includes("virtual try-on") || text.includes("try-on")) {
    return [
      "This item points to virtual try-on becoming part of how shoppers evaluate luxury products before purchase.",
      "Google Cloud virtual try-on is surfacing as a fashion and luxury market signal."
    ];
  }
  if (text.includes("shopify") || text.includes("catalog") || text.includes("storefront")) {
    return [
      "This story points to commerce platforms preparing product data for AI-assisted shopping.",
      "Shopify-related AI commerce moves signal that catalog readiness may become more important."
    ];
  }
  if (text.includes("openai") || text.includes("chatgpt")) {
    return [
      "This signal shows AI platforms competing to own product search and checkout paths.",
      "OpenAI-linked commerce stories point to shopping moving into conversational and agentic interfaces."
    ];
  }
  if (text.includes("agentic commerce") || text.includes("ai shopping") || text.includes("shopping agent")) {
    return [
      "This story points to AI shopping becoming a discovery path before customers reach a brand site.",
      "This signal shows platforms competing to own the shopper's AI-assisted product search and checkout path.",
      "The item highlights agentic commerce moving from concept into retail and marketplace tooling."
    ];
  }
  if (text.includes("beauty")) {
    return [
      "This story points to beauty discovery moving toward AI-assisted product evaluation.",
      "Beauty AI signals matter because recommendations and search can shape the shopper's consideration set."
    ];
  }
  return [
    "This signal shows AI becoming a more active layer in retail, commerce, or brand discovery.",
    "The item points to AI changing how shoppers discover, compare, or evaluate products."
  ];
}

function whyVariants(story, item) {
  const text = `${story.title} ${item.summary ?? ""}`.toLowerCase();
  if (text.includes("virtual try-on") || text.includes("try-on")) {
    return [
      "This matters because try-on tools can change product evaluation before shoppers commit to purchase.",
      "This matters because visual AI can move more of the fitting-room experience into digital discovery."
    ];
  }
  if (text.includes("shopify") || text.includes("catalog") || text.includes("storefront")) {
    return [
      "This matters because brands may need cleaner catalog data and product metadata for AI-mediated shopping.",
      "This matters because storefront and catalog readiness can affect how products appear in agent-driven commerce."
    ];
  }
  if (text.includes("meta") || text.includes("instagram") || text.includes("hatch")) {
    return [
      "This matters because social platforms can shift shopping discovery before shoppers reach a brand site.",
      "This matters because AI shopping assistants inside social channels can change where product decisions begin."
    ];
  }
  if (text.includes("agentic commerce") || text.includes("ai shopping") || text.includes("shopping agent")) {
    return [
      "This matters because brands may need cleaner catalog data and product metadata for AI-mediated shopping.",
      "This matters because discovery and checkout expectations can move upstream into AI agents."
    ];
  }
  if (text.includes("beauty")) {
    return [
      "This matters because beauty discovery is moving toward algorithmic recommendations that may influence broader shopping behavior.",
      "This matters because AI-guided product evaluation can shape which beauty products shoppers consider first."
    ];
  }
  return [
    "This matters because AI-assisted shopping can influence how consumers discover, compare, and buy products.",
    "This matters because AI-mediated discovery may change which brands and products shoppers see first."
  ];
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

function stripTrailingOutlet(value = "", outlet = "") {
  if (!outlet) return value;
  return value.replace(new RegExp(`\\s${escapeRegExp(outlet)}\\.?$`, "i"), "").trim();
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

function outletFromRaw(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "object") return cleanText(value.title || value.name || value._ || "");
  return "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

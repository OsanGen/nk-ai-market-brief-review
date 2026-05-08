import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadSources(filePath = "newsletter-sources.json") {
  const fullPath = path.resolve(filePath);
  const payload = JSON.parse(await readFile(fullPath, "utf8"));
  if (!Array.isArray(payload.sources)) {
    throw new Error("newsletter-sources.json must contain a sources array");
  }

  return payload.sources.map(validateSource).filter((source) => source.enabled);
}

function validateSource(source, index) {
  const prefix = `source[${index}]`;
  assertString(source.id, `${prefix}.id`);
  assertString(source.name, `${prefix}.name`);
  assertString(source.mode, `${prefix}.mode`);
  assertString(source.query, `${prefix}.query`);
  if (source.homepageUrl !== null) assertString(source.homepageUrl, `${prefix}.homepageUrl`);
  if (typeof source.weight !== "number") throw new Error(`${prefix}.weight must be a number`);
  if (typeof source.enabled !== "boolean") throw new Error(`${prefix}.enabled must be boolean`);
  if (!Array.isArray(source.categories) || !source.categories.every((entry) => typeof entry === "string")) {
    throw new Error(`${prefix}.categories must be an array of strings`);
  }
  if (!["google_news_rss", "direct_rss"].includes(source.mode)) {
    throw new Error(`${prefix}.mode must be google_news_rss or direct_rss`);
  }
  return source;
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
}

import { createHash } from "node:crypto";

const DEFAULT_MAX_STRING_LENGTH = 1000;
const DEFAULT_MAX_ARRAY_LENGTH = 50;
const DEFAULT_MAX_OBJECT_KEYS = 100;
const DEFAULT_MAX_DEPTH = 8;

const SENSITIVE_KEY = /(?:^|[_-])(?:api[_-]?key|authorization|auth|password|passwd|secret|token|cookie|session|credential|private[_-]?key|access[_-]?key|refresh[_-]?token)(?:$|[_-])/i;
const EMAIL_KEY = /(?:^|[_-])(?:email|recipient|recipients|reply[_-]?to|from|to|cc|bcc)(?:$|[_-])/i;
const URL_KEY = /(?:^|[_-])(?:url|uri|endpoint|link)(?:$|[_-])/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
// Known secret shapes. Prefix-based provider tokens (Anthropic sk-, Resend re_,
// GitHub gh*/github_pat), plus AWS access keys (AKIA…), Google API keys (AIza…),
// Slack tokens (xox…), and JWTs (eyJ.<b64>.<b64>). Kept to recognizable formats
// rather than a broad entropy heuristic to avoid corrupting legitimate log text.
const TOKEN_VALUE = new RegExp(
  [
    "\\b(?:sk|re|gho|ghp|ghs|ghr|ghu|github_pat)(?:-|_)[A-Za-z0-9_-]{12,}",
    "\\bAKIA[0-9A-Z]{16}\\b",
    "\\bAIza[0-9A-Za-z_-]{35}",
    "\\bxox[baprs]-[A-Za-z0-9-]{10,}",
    "\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{6,}"
  ].join("|"),
  "gi"
);

export function sanitizeAttributes(value, options = {}) {
  const limits = {
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    maxArrayLength: options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH
  };
  return sanitizeValue(value, "", 0, new WeakSet(), limits);
}

export function serializeError(error) {
  const source = error instanceof Error ? error : new Error(String(error));
  const message = sanitizeString(source.message || source.name || "unexpected error", DEFAULT_MAX_STRING_LENGTH);
  const errorCode = classifyError(source, message);
  return {
    errorName: safeIdentifier(source.name || "Error", "Error"),
    errorCode,
    errorFingerprint: fingerprint(`${source.name}:${errorCode}:${message}`),
    errorMessage: message
  };
}

export function fingerprint(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

export function containsUnredactedSensitiveValue(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return false;
  EMAIL_VALUE.lastIndex = 0;
  BEARER_VALUE.lastIndex = 0;
  TOKEN_VALUE.lastIndex = 0;
  return EMAIL_VALUE.test(text) || BEARER_VALUE.test(text) || TOKEN_VALUE.test(text);
}

function sanitizeValue(value, key, depth, seen, limits) {
  const normalizedKey = normalizeKey(key);
  if (SENSITIVE_KEY.test(normalizedKey)) return "<redacted>";
  if (EMAIL_KEY.test(normalizedKey) && value) return "<redacted:email>";
  if (value === null || value === undefined) return value ?? null;
  if (["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    const sanitized = URL_KEY.test(normalizedKey) ? sanitizeUrl(value) : sanitizeString(value, limits.maxStringLength);
    return sanitized;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (typeof value !== "object") return sanitizeString(String(value), limits.maxStringLength);
  if (depth >= limits.maxDepth) return "<redacted:max-depth>";
  if (seen.has(value)) return "<redacted:circular>";

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const sanitized = value
        .slice(0, limits.maxArrayLength)
        .map((entry) => sanitizeValue(entry, key, depth + 1, seen, limits));
      if (value.length > limits.maxArrayLength) sanitized.push(`<truncated:${value.length - limits.maxArrayLength}>`);
      return sanitized;
    }

    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, limits.maxObjectKeys);
    const output = {};
    for (const [entryKey, entryValue] of entries) {
      output[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1, seen, limits);
    }
    if (Object.keys(value).length > limits.maxObjectKeys) {
      output._truncatedKeys = Object.keys(value).length - limits.maxObjectKeys;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function sanitizeString(value, maxLength) {
  let output = String(value)
    .replace(BEARER_VALUE, "Bearer <redacted>")
    .replace(TOKEN_VALUE, "<redacted:token>")
    .replace(EMAIL_VALUE, "<redacted:email>")
    .replace(/\r\n|\r|\n/g, "\\n");
  output = redactUrlCredentials(output);
  if (output.length > maxLength) output = `${output.slice(0, maxLength)}<truncated:${output.length - maxLength}>`;
  return output;
}

function sanitizeUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return sanitizeString(value, DEFAULT_MAX_STRING_LENGTH);
  }
}

function redactUrlCredentials(value) {
  return value.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, "$1<redacted>:<redacted>@");
}

function classifyError(error, message) {
  if (error.name === "AbortError" || /aborted|timed?\s*out/i.test(message)) return "timeout";
  if (/^HTTP\s+\d{3}$/i.test(message)) return "http_status";
  if (error instanceof SyntaxError || /parse|invalid xml|unexpected token/i.test(message)) return "parse_error";
  if (typeof error.code === "string" && error.code.trim()) return safeIdentifier(error.code.toLowerCase(), "unexpected_error");
  if (/fetch|network|socket|dns|connection/i.test(message)) return "network_error";
  return "unexpected_error";
}

function safeIdentifier(value, fallback) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return normalized || fallback;
}

function normalizeKey(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

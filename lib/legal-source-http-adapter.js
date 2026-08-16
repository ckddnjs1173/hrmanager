import { stableHash, validateOfficialLegalUrl } from "./legal-change-contract.js";

export const LEGAL_SOURCE_HTTP_TIMEOUT_MS = 10_000;
export const LEGAL_SOURCE_HTTP_MAX_BYTES = 512 * 1024;
export const LEGAL_SOURCE_HTTP_MAX_REDIRECTS = 3;
export const LEGAL_SOURCE_EVIDENCE_MAX_CHARS = 32_000;

const ALLOWED_CONTENT_TYPES = Object.freeze([
  "text/html",
  "text/plain",
  "text/xml",
  "application/xml",
  "application/xhtml+xml",
  "application/json",
  "application/ld+json",
]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function contentTypeOnly(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]));
  }
  return value;
}

export function normalizeLegalSourceContent(raw, contentType) {
  const type = contentTypeOnly(contentType);
  if (["application/json", "application/ld+json"].includes(type)) {
    try {
      return JSON.stringify(canonicalizeJson(JSON.parse(raw)));
    } catch {
      throw new Error("legal_source_http_json_invalid");
    }
  }
  if (["text/html", "application/xhtml+xml"].includes(type)) {
    return normalizeWhitespace(
      String(raw || "")
        .replace(/<!--([\s\S]*?)-->/g, " ")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    );
  }
  return normalizeWhitespace(raw);
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("legal_source_http_response_too_large");
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error("legal_source_http_response_too_large");
    return buffer.toString("utf8");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error("legal_source_http_response_too_large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function validatedUrl(value) {
  const validation = validateOfficialLegalUrl(value);
  if (!validation.ok) throw new Error(validation.error);
  return validation.url;
}

export async function fetchOfficialLegalSource({
  url,
  fetchImpl = globalThis.fetch,
  timeoutMs = LEGAL_SOURCE_HTTP_TIMEOUT_MS,
  maxBytes = LEGAL_SOURCE_HTTP_MAX_BYTES,
  maxRedirects = LEGAL_SOURCE_HTTP_MAX_REDIRECTS,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("legal_source_http_fetch_required");
  let current = validatedUrl(url);
  let redirects = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("legal_source_http_timeout")), timeoutMs);
  timer.unref?.();
  try {
    while (true) {
      let response;
      try {
        response = await fetchImpl(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1",
            "user-agent": "Insaya-Legal-Monitor/1.0",
          },
        });
      } catch (error) {
        if (controller.signal.aborted) throw new Error("legal_source_http_timeout");
        throw new Error(`legal_source_http_fetch_failed:${error?.message || "unknown"}`);
      }

      if (REDIRECT_STATUS.has(response.status)) {
        const location = response.headers?.get?.("location");
        if (!location) throw new Error("legal_source_http_redirect_location_missing");
        redirects += 1;
        if (redirects > maxRedirects) throw new Error("legal_source_http_redirect_limit");
        current = validatedUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`legal_source_http_status:${response.status}`);

      const contentType = contentTypeOnly(response.headers?.get?.("content-type"));
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) throw new Error("legal_source_http_content_type_invalid");
      const raw = await readBoundedBody(response, maxBytes);
      const normalizedContent = normalizeLegalSourceContent(raw, contentType);
      if (!normalizedContent) throw new Error("legal_source_http_content_empty");
      const contentHash = stableHash(normalizedContent);
      return {
        finalUrl: current.toString(),
        httpStatus: response.status,
        contentType,
        contentHash,
        normalizedContent,
        evidenceText: normalizedContent.slice(0, LEGAL_SOURCE_EVIDENCE_MAX_CHARS),
        evidenceTruncated: normalizedContent.length > LEGAL_SOURCE_EVIDENCE_MAX_CHARS,
        etag: response.headers?.get?.("etag") || null,
        lastModified: response.headers?.get?.("last-modified") || null,
        fetchedAt: now.toISOString(),
        redirects,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

import fs from "node:fs";
import path from "node:path";

const LEGACY_ORIGIN_PATTERN = /(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|https:\/\/insaya\.onrender\.com)/gi;

export function resolvePublicSiteOrigin(env = process.env) {
  const raw = String(env.SITE_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function replaceAttribute(tag, name, value) {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[^"']*\\2`, "i");
  if (!pattern.test(tag)) return tag;
  return tag.replace(pattern, `$1"${value}"`);
}

function replaceMatchingTagAttribute(source, tagPattern, attribute, value) {
  return source.replace(tagPattern, (tag) => replaceAttribute(tag, attribute, value));
}

function rewriteJsonLd(head, origin) {
  return head.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (full, open, json, close) => {
    try {
      const parsed = JSON.parse(json);
      const visit = (value, key = "") => {
        if (Array.isArray(value)) return value.map((item) => visit(item));
        if (value && typeof value === "object") {
          for (const [childKey, childValue] of Object.entries(value)) value[childKey] = visit(childValue, childKey);
          return value;
        }
        if (typeof value !== "string") return value;
        if (LEGACY_ORIGIN_PATTERN.test(value)) {
          LEGACY_ORIGIN_PATTERN.lastIndex = 0;
          return value.replace(LEGACY_ORIGIN_PATTERN, origin);
        }
        LEGACY_ORIGIN_PATTERN.lastIndex = 0;
        if (value === "/" && ["url", "item", "mainEntityOfPage"].includes(key)) return `${origin}/`;
        return value;
      };
      return `${open}${JSON.stringify(visit(parsed))}${close}`;
    } catch {
      return full.replace(LEGACY_ORIGIN_PATTERN, origin);
    }
  });
}

export function rewritePublicDocumentMetadata(html = "", { siteOrigin = null, pathname = "/" } = {}) {
  const source = String(html || "");
  if (!siteOrigin) return source;

  let pathValue = String(pathname || "/").split("?", 1)[0];
  if (!pathValue.startsWith("/")) pathValue = `/${pathValue}`;
  const canonicalUrl = `${siteOrigin}${pathValue}`;
  const headClose = source.search(/<\/head>/i);
  if (headClose < 0) return source;

  let head = source.slice(0, headClose);
  const tail = source.slice(headClose);
  head = head.replace(LEGACY_ORIGIN_PATTERN, siteOrigin);
  head = replaceMatchingTagAttribute(head, /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, "href", canonicalUrl);
  head = replaceMatchingTagAttribute(head, /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/gi, "content", canonicalUrl);
  head = rewriteJsonLd(head, siteOrigin);
  return `${head}${tail}`;
}

export function createRobotsHandler({ env = process.env } = {}) {
  return (req, res) => {
    const origin = resolvePublicSiteOrigin(env) || `${req.protocol || "http"}://${req.get("host")}`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    res.send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  };
}

export function createSitemapHandler(rootDir, { env = process.env } = {}) {
  const sitemapPath = path.join(rootDir, "sitemap.xml");
  return (req, res, next) => {
    fs.readFile(sitemapPath, "utf8", (error, xml) => {
      if (error) return next(error);
      const origin = resolvePublicSiteOrigin(env) || `${req.protocol || "http"}://${req.get("host")}`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
      res.send(String(xml).replace(LEGACY_ORIGIN_PATTERN, origin));
    });
  };
}

export function createArticlePageHandler(rootDir, { env = process.env } = {}) {
  const articlesDir = path.join(rootDir, "articles");
  return (req, res, next) => {
    const match = /^\/articles\/([a-z0-9_-]+\.html)$/i.exec(req.path || "");
    if (!match) return next();
    const filePath = path.join(articlesDir, match[1]);
    fs.readFile(filePath, "utf8", (error, html) => {
      if (error) {
        if (error.code === "ENOENT") return next();
        return next(error);
      }
      const origin = resolvePublicSiteOrigin(env);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.send(rewritePublicDocumentMetadata(html, { siteOrigin: origin, pathname: req.path }));
    });
  };
}

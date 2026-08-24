import assert from "node:assert/strict";

const BASE = String(process.env.PRODUCTION_URL || "https://insaya.onrender.com").replace(/\/$/, "");

async function get(path, options = {}) {
  return fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...options,
    headers: { "cache-control": "no-cache", ...(options.headers || {}) },
  });
}

for (const privatePath of [
  "/package.json",
  "/package-lock.json",
  "/server.js",
  "/render.yaml",
  "/lib/application.js",
  "/scripts/release-check.mjs",
  "/tests/application-bootstrap.test.js",
  "/db/postgres/schema.sql",
  "/data/app.db",
]) {
  const response = await get(privatePath);
  assert.equal(response.status, 404, `${privatePath} must not be publicly served`);
  assert.match(response.headers.get("cache-control") || "", /no-store/, `${privatePath} must not be cached`);
}

const health = await get("/api/health");
assert.equal(health.status, 200, "health endpoint must be available");
assert.match(health.headers.get("cache-control") || "", /no-store/);
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.equal(health.headers.get("x-permitted-cross-domain-policies"), "none");
assert.equal(health.headers.get("cross-origin-opener-policy"), "same-origin");
assert.match(health.headers.get("content-security-policy") || "", /form-action 'self'/);
assert.match(health.headers.get("strict-transport-security") || "", /max-age=/);
assert.ok(health.headers.get("x-request-id"), "health response must include request correlation id");

const home = await get("/");
assert.equal(home.status, 200);
const homeHtml = await home.text();
assert.match(homeHtml, new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/["']`, "i"));
assert.doesNotMatch(homeHtml.slice(0, homeHtml.search(/<\/head>/i)), /localhost:\d+/i);

const article = await get("/articles/wage.html");
assert.equal(article.status, 200);
const articleHtml = await article.text();
assert.match(articleHtml, new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/articles\/wage\.html`));
assert.doesNotMatch(articleHtml.slice(0, articleHtml.search(/<\/head>/i)), /localhost:\d+/i);

const robots = await get("/robots.txt");
assert.equal(robots.status, 200);
const robotsText = await robots.text();
assert.match(robotsText, new RegExp(`Sitemap: ${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/sitemap\.xml`));
assert.doesNotMatch(robotsText, /localhost:\d+/i);

const sitemap = await get("/sitemap.xml");
assert.equal(sitemap.status, 200);
const sitemapText = await sitemap.text();
assert.match(sitemapText, new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/articles\/wage\.html`));
assert.doesNotMatch(sitemapText, /localhost:\d+/i);

const publicData = await get("/data/nomusa.json");
assert.equal(publicData.status, 200, "intentional public expert directory data must remain available");

console.log(`✅ production HTTP security + SEO smoke passed · ${BASE}`);

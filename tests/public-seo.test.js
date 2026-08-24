import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";

import {
  createArticlePageHandler,
  createRobotsHandler,
  createSitemapHandler,
  resolvePublicSiteOrigin,
  rewritePublicDocumentMetadata,
} from "../lib/public-seo.js";

test("public origin accepts deployment origins and rejects paths or non-http schemes", () => {
  assert.equal(resolvePublicSiteOrigin({ SITE_URL: "https://insaya.example/" }), "https://insaya.example");
  assert.equal(resolvePublicSiteOrigin({ RENDER_EXTERNAL_URL: "https://render.example" }), "https://render.example");
  assert.equal(resolvePublicSiteOrigin({ SITE_URL: "https://insaya.example/app" }), null);
  assert.equal(resolvePublicSiteOrigin({ SITE_URL: "javascript:alert(1)" }), null);
});

test("public metadata rewrites canonical, Open Graph and JSON-LD to the deployment origin", () => {
  const source = `<!doctype html><html><head>
<link rel="canonical" href="http://localhost:3000/articles/wage.html">
<meta property="og:url" content="http://localhost:3000/articles/wage.html">
<meta property="og:image" content="http://localhost:3000/assets/brand/og-default.png">
<link rel="icon" href="https://insaya.onrender.com/assets/brand/favicon.svg">
<script type="application/ld+json">{"@type":"WebSite","url":"/","mainEntityOfPage":"http://localhost:3000/articles/wage.html"}</script>
</head><body>https://insaya.onrender.com must not be rewritten outside head</body></html>`;
  const html = rewritePublicDocumentMetadata(source, { siteOrigin: "https://insaya.example", pathname: "/articles/wage.html" });

  assert.match(html, /rel="canonical" href="https:\/\/insaya\.example\/articles\/wage\.html"/);
  assert.match(html, /property="og:url" content="https:\/\/insaya\.example\/articles\/wage\.html"/);
  assert.match(html, /content="https:\/\/insaya\.example\/assets\/brand\/og-default\.png"/);
  assert.match(html, /href="https:\/\/insaya\.example\/assets\/brand\/favicon\.svg"/);
  assert.match(html, /"url":"https:\/\/insaya\.example\/"/);
  assert.match(html, /"mainEntityOfPage":"https:\/\/insaya\.example\/articles\/wage\.html"/);
  assert.match(html, /<body>https:\/\/insaya\.onrender\.com must not be rewritten outside head/);
});

test("robots, sitemap and article responses use SITE_URL instead of localhost metadata", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-seo-"));
  fs.mkdirSync(path.join(dir, "articles"));
  fs.writeFileSync(path.join(dir, "sitemap.xml"), '<?xml version="1.0"?><urlset><url><loc>http://localhost:3000/articles/wage.html</loc></url></urlset>');
  fs.writeFileSync(path.join(dir, "articles", "wage.html"), '<!doctype html><html><head><link rel="canonical" href="http://localhost:3000/articles/wage.html"><meta property="og:url" content="http://localhost:3000/articles/wage.html"></head><body>article</body></html>');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const env = { SITE_URL: "https://insaya.example" };
  const app = express();
  app.get("/robots.txt", createRobotsHandler({ env }));
  app.get("/sitemap.xml", createSitemapHandler(dir, { env }));
  app.get(/^\/articles\/[a-z0-9_-]+\.html$/i, createArticlePageHandler(dir, { env }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/insaya\.example\/sitemap\.xml/);

  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /https:\/\/insaya\.example\/articles\/wage\.html/);

  const article = await fetch(`${base}/articles/wage.html`);
  assert.equal(article.status, 200);
  const articleHtml = await article.text();
  assert.match(articleHtml, /https:\/\/insaya\.example\/articles\/wage\.html/);
  assert.doesNotMatch(articleHtml, /localhost:3000/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";

import { createPublicStaticGuard, isPrivateStaticPath } from "../lib/public-static.js";

test("private repository paths are blocked while intentional public assets remain available", () => {
  for (const blocked of [
    "/package.json",
    "/package-lock.json",
    "/server.js",
    "/README.md",
    "/render.yaml",
    "/.env.example",
    "/lib/application.js",
    "/scripts/release-check.mjs",
    "/tests/application-bootstrap.test.js",
    "/test/fixture.js",
    "/db/postgres/schema.sql",
    "/data/app.db",
    "/data/app.db-wal",
    "/backups/app.db.backup",
    "/%6c%69%62/application.js",
    "/%252e%252e/server.js",
  ]) assert.equal(isPrivateStaticPath(blocked), true, `${blocked} must be private`);

  for (const allowed of [
    "/product-ui.js",
    "/business.css",
    "/articles/wage.html",
    "/assets/brand/favicon.svg",
    "/content/home-navigation.js",
    "/data/nomusa.json",
    "/robots.txt",
    "/sitemap.xml",
  ]) assert.equal(isPrivateStaticPath(allowed), false, `${allowed} must remain public`);
});

test("static guard prevents Express from serving private files", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-static-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "package.json"), '{"private":true}');
  fs.writeFileSync(path.join(dir, "server.js"), "secret-server-source");
  fs.writeFileSync(path.join(dir, "lib", "secret.js"), "secret-library-source");
  fs.writeFileSync(path.join(dir, "data", "app.db"), "private-db");
  fs.writeFileSync(path.join(dir, "data", "nomusa.json"), '{"public":true}');
  fs.writeFileSync(path.join(dir, "product-ui.js"), "window.publicAsset=true;");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const app = express();
  app.use(createPublicStaticGuard());
  app.use(express.static(dir));
  app.use((_req, res) => res.status(404).end());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const privatePath of ["/package.json", "/server.js", "/lib/secret.js", "/data/app.db", "/%6c%69%62/secret.js"]) {
    const response = await fetch(`${base}${privatePath}`);
    assert.equal(response.status, 404, `${privatePath} must return 404`);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  }

  const asset = await fetch(`${base}/product-ui.js`);
  assert.equal(asset.status, 200);
  assert.match(await asset.text(), /publicAsset/);

  const publicData = await fetch(`${base}/data/nomusa.json`);
  assert.equal(publicData.status, 200);
  assert.deepEqual(await publicData.json(), { public: true });
});

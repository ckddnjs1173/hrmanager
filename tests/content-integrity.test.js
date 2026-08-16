import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContentIntegrity } from "../lib/content-integrity.js";
import { extractBrowserGlobal, extractLegacyContent } from "../lib/legacy-content-reader.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("content integrity rejects missing catalog articles and broken related links", () => {
  const result = validateContentIntegrity({
    topics: { worker: [{ k: "wage" }, { k: "missing" }], employer: [{ k: "wage" }] },
    articles: {
      wage: { title: "임금", cat: "근로자", from: "worker", lead: "설명" },
    },
    extras: {
      wage: { related: ["ghost"] },
      orphan: {},
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("topic_missing_article:missing"));
  assert.ok(result.errors.includes("duplicate_topic_key:wage"));
  assert.ok(result.errors.includes("related_article_missing:wage->ghost"));
  assert.ok(result.errors.includes("extra_missing_article:orphan"));
});

test("real guide catalog resolves to complete legacy article content", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const guideSource = fs.readFileSync(path.join(ROOT, "content/guide-catalog.js"), "utf8");
  const legacy = extractLegacyContent(html, ["ARTICLES", "ART_EXTRA"]);
  const catalog = extractBrowserGlobal(guideSource, "INSAYA_GUIDE_CATALOG");
  const result = validateContentIntegrity({
    topics: catalog.TOPICS,
    articles: legacy.ARTICLES,
    extras: legacy.ART_EXTRA,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.counts.workerTopics, 23);
  assert.equal(result.counts.employerTopics, 10);
  assert.ok(result.counts.articles >= result.counts.topics);
});

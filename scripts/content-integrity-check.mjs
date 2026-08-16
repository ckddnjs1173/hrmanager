import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContentIntegrity } from "../lib/content-integrity.js";
import { extractBrowserGlobal, extractLegacyContent } from "../lib/legacy-content-reader.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const guideSource = fs.readFileSync(path.join(ROOT, "content/guide-catalog.js"), "utf8");

const legacy = extractLegacyContent(html, ["ARTICLES", "ART_EXTRA"]);
const catalog = extractBrowserGlobal(guideSource, "INSAYA_GUIDE_CATALOG");
const result = validateContentIntegrity({
  topics: catalog?.TOPICS,
  articles: legacy.ARTICLES,
  extras: legacy.ART_EXTRA,
});

if (!result.ok) {
  for (const error of result.errors) console.error(`✖ content integrity: ${error}`);
  process.exit(1);
}

console.log(
  `✅ content integrity passed · ${result.counts.workerTopics} worker topics · ` +
  `${result.counts.employerTopics} employer topics · ${result.counts.articles} articles · ` +
  `${result.counts.extras} article extras`,
);

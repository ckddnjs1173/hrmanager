import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const commit = String(process.env.RENDER_GIT_COMMIT || "").trim();

if (!commit) {
  console.log("ℹ build-info.json skipped (not a Render build)");
  process.exit(0);
}

const payload = {
  service: "insaya",
  commit,
  branch: String(process.env.RENDER_GIT_BRANCH || ""),
  repo: String(process.env.RENDER_GIT_REPO_SLUG || ""),
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(root, "build-info.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`✅ build-info.json · ${commit.slice(0, 12)}`);

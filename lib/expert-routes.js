import express from "express";
import fs from "node:fs";
import path from "node:path";
import { nomusa } from "./repo.js";

export function seedNomusa({ rootDir }) {
  if (!rootDir) throw new Error("expert_router_root_required");
  try {
    if (nomusa.count() !== 0) return { seeded: 0, skipped: true };
    const source = path.join(rootDir, "data", "nomusa.json");
    const list = JSON.parse(fs.readFileSync(source, "utf-8"));
    if (!Array.isArray(list) || !list.length) return { seeded: 0, skipped: true };
    nomusa.replaceAll(list);
    console.log(`   노무사 ${list.length}건 DB 시드 완료`);
    return { seeded: list.length, skipped: false };
  } catch {
    return { seeded: 0, skipped: true };
  }
}

export function createExpertRouter({ rootDir }) {
  seedNomusa({ rootDir });
  const router = express.Router();

  router.get("/nomu", (req, res) => {
    res.json(nomusa.publicList({ region: (req.query.region || "").toString().trim() }));
  });

  return router;
}

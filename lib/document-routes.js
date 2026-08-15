import express from "express";
import { listDocs, renderDoc, listPacks, renderPack } from "./docs.js";

export function createDocumentRouter() {
  const router = express.Router();

  router.get("/docs", (_req, res) => {
    res.json(listDocs());
  });

  router.post("/doc", (req, res) => {
    const { key, values } = req.body || {};
    const doc = renderDoc(key, values || {});
    if (!doc) return res.status(404).json({ error: "unknown_doc" });
    return res.json(doc);
  });

  router.get("/docpacks", (_req, res) => {
    res.json(listPacks());
  });

  router.post("/docpack", (req, res) => {
    const { key, values } = req.body || {};
    const pack = renderPack(key, values || {});
    if (!pack) return res.status(404).json({ error: "unknown_pack" });
    return res.json(pack);
  });

  return router;
}

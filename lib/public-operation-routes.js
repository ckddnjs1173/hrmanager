import express from "express";
import crypto from "node:crypto";
import { bookings, leads, events, EVENT_TYPES, feedback } from "./runtime-repo.js";
import { queuePrivacyDeletion } from "./privacy-operations.js";
import { notify } from "./notify.js";

export function createPublicOperationRouter({ rateLimit, clean }) {
  if (typeof rateLimit !== "function") throw new Error("public_operation_rate_limit_required");
  if (typeof clean !== "function") throw new Error("public_operation_clean_required");
  const router = express.Router();

  router.post("/lead", rateLimit({ max: 20 }), async (req, res) => {
    const contact = clean(req.body?.contact); if (!contact) return res.status(400).json({ error: "contact_required" });
    const record = await leads.insert({ kind: clean(req.body?.kind) || "general", name: clean(req.body?.name), contact, message: clean(req.body?.message) });
    await events.add("lead", record.kind); return res.json({ ok: true, id: record.id });
  });

  router.post("/booking", rateLimit({ max: 20 }), async (req, res) => {
    const contact = clean(req.body?.contact); if (!contact) return res.status(400).json({ error: "contact_required" });
    if (!req.body?.consent) return res.status(400).json({ error: "consent_required" });
    const token = crypto.randomBytes(16).toString("hex");
    const record = await bookings.insert({ nomu: clean(req.body?.nomu), name: clean(req.body?.name), contact, message: clean(req.body?.message), summary: clean(req.body?.summary), consent: true, token, expires: new Date(Date.now() + 7 * 864e5).toISOString() });
    await events.add("booking", record.nomu || "");
    notify({ template: "new_booking", recipient: "operator", subject: "새 상담 접수", body: `${record.name || "(미입력)"} · 희망: ${record.nomu || "-"}` }).catch(() => {});
    return res.json({ ok: true, id: record.id });
  });

  router.post("/event", rateLimit({ max: 120 }), async (req, res) => {
    const type = String(req.body?.type || ""); if (!EVENT_TYPES.includes(type)) return res.status(400).json({ error: "bad_type" });
    await events.add(type, clean(req.body?.ref).slice(0, 60)); return res.json({ ok: true });
  });

  router.post("/feedback", rateLimit({ max: 20 }), async (req, res) => {
    await feedback.add({ kind: clean(req.body?.kind) || "answer", ref: clean(req.body?.ref), message: clean(req.body?.message) });
    return res.json({ ok: true });
  });

  router.post("/privacy/delete", rateLimit({ max: 10 }), async (req, res) => {
    const contact = clean(req.body?.contact);
    if (contact) return res.status(202).json(await queuePrivacyDeletion(contact));
    return res.status(400).json({ error: "contact_required" });
  });

  return router;
}

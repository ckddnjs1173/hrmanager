import express from "express";
import crypto from "node:crypto";
import { bookings, leads, privacy, events, EVENT_TYPES, feedback } from "./repo.js";
import { notify } from "./notify.js";

export function createPublicOperationRouter({ rateLimit, clean }) {
  if (typeof rateLimit !== "function") throw new Error("public_operation_rate_limit_required");
  if (typeof clean !== "function") throw new Error("public_operation_clean_required");

  const router = express.Router();

  router.post("/lead", rateLimit({ max: 20 }), (req, res) => {
    const contact = clean(req.body?.contact);
    if (!contact) return res.status(400).json({ error: "contact_required" });
    const record = leads.insert({
      kind: clean(req.body?.kind) || "general",
      name: clean(req.body?.name),
      contact,
      message: clean(req.body?.message),
    });
    events.add("lead", record.kind);
    return res.json({ ok: true, id: record.id });
  });

  router.post("/booking", rateLimit({ max: 20 }), (req, res) => {
    const contact = clean(req.body?.contact);
    if (!contact) return res.status(400).json({ error: "contact_required" });
    if (!req.body?.consent) return res.status(400).json({ error: "consent_required" });
    const token = crypto.randomBytes(16).toString("hex");
    const record = bookings.insert({
      nomu: clean(req.body?.nomu),
      name: clean(req.body?.name),
      contact,
      message: clean(req.body?.message),
      summary: clean(req.body?.summary),
      consent: true,
      token,
      expires: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    events.add("booking", record.nomu || "");
    notify({ template: "new_booking", recipient: "operator", subject: "새 상담 접수", body: `${record.name || "(미입력)"} · 희망: ${record.nomu || "-"}` }).catch(() => {});
    return res.json({ ok: true, id: record.id });
  });

  router.post("/event", rateLimit({ max: 120 }), (req, res) => {
    const type = String(req.body?.type || "");
    if (!EVENT_TYPES.includes(type)) return res.status(400).json({ error: "bad_type" });
    events.add(type, clean(req.body?.ref).slice(0, 60));
    return res.json({ ok: true });
  });

  router.post("/feedback", rateLimit({ max: 20 }), (req, res) => {
    feedback.add({ kind: clean(req.body?.kind) || "answer", ref: clean(req.body?.ref), message: clean(req.body?.message) });
    return res.json({ ok: true });
  });

  router.post("/privacy/delete", rateLimit({ max: 10 }), (req, res) => {
    const token = clean(req.body?.token);
    const contact = clean(req.body?.contact);
    if (token) return res.json({ ok: true, deleted: privacy.deleteByToken(token) });
    if (contact) {
      // A contact string is not proof of identity. Queue a verification request instead of
      // allowing anyone who knows another person's email/phone to destroy their records.
      feedback.add({
        kind: "privacy_delete_request",
        ref: contact,
        message: "본인 확인 후 개인정보 삭제 처리 필요",
      });
      return res.status(202).json({ ok: true, status: "verification_required" });
    }
    return res.status(400).json({ error: "token_or_contact_required" });
  });

  return router;
}

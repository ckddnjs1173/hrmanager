import { db, nowISO } from "./db.js";
import { feedback, privacy } from "./repo.js";

export function deleteByActivePrivacyToken(token, now = Date.now()) {
  if (!token) return 0;
  const row = db.prepare("SELECT id,expires FROM bookings WHERE token=? AND deleted_at IS NULL").get(token);
  if (!row) return 0;
  const expiresAt = Date.parse(row.expires || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 0;

  const at = nowISO();
  const deleted = db.prepare("UPDATE bookings SET deleted_at=? WHERE id=? AND deleted_at IS NULL").run(at, row.id).changes;
  if (deleted) {
    db.prepare("INSERT INTO booking_events (booking_id,at,type,actor,note) VALUES (?,?,?,?,?)")
      .run(row.id, at, "deleted:user", "user", "privacy token");
  }
  return deleted;
}

export function queuePrivacyDeletion(contact) {
  feedback.add({
    kind: "privacy_delete_request",
    ref: contact,
    message: "본인 확인 후 개인정보 삭제 처리 필요",
  });
  return { ok: true, status: "verification_required" };
}

export function fulfillPrivacyDeletion(contact) {
  const deleted = privacy.deleteByContact(contact);
  const requestsResolved = db.prepare(
    "UPDATE feedback SET status='done' WHERE kind='privacy_delete_request' AND ref=? AND status='new'",
  ).run(contact).changes;
  return { ok: true, deleted, requestsResolved };
}

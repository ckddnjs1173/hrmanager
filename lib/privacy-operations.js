import { db } from "./db.js";
import { feedback, privacy } from "./repo.js";

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

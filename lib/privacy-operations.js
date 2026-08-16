import { feedback, privacy } from "./runtime-repo.js";

export async function queuePrivacyDeletion(contact) {
  await feedback.add({ kind: "privacy_delete_request", ref: contact, message: "본인 확인 후 개인정보 삭제 처리 필요" });
  return { ok: true, status: "verification_required" };
}

export async function fulfillPrivacyDeletion(contact) {
  const deleted = await privacy.deleteByContact(contact);
  const requestsResolved = await feedback.resolvePrivacyDeleteRequests(contact);
  return { ok: true, deleted, requestsResolved };
}

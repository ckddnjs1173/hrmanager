// 알림 추상화 (틀) — 키 없이 콘솔/발송함(outbox)에 적재. 키 확보 시 어댑터만 교체하면 자동화.
// 채널: console(기본) · email(SMTP) · kakao(알림톡). email/kakao는 키 설정 시 활성.
import { db, nowISO } from "./db.js";

// ── 어댑터 (외부 키가 있을 때만 활성. 지금은 틀만) ──
const adapters = {
  console: async (m) => { console.log(`🔔 [알림→${m.recipient || "운영자"}] ${m.subject}${m.body ? " — " + m.body : ""}`); return "logged"; },
  // 예: SMTP_URL 설정 시 nodemailer 등으로 실제 발송 (지금은 미구현 → 콘솔 폴백)
  email: process.env.SMTP_URL ? async (m) => { /* TODO: 실제 SMTP 발송 */ console.log(`📧 (email 미구현) ${m.recipient}`); return "pending"; } : null,
  // 예: KAKAO_API_KEY 설정 시 알림톡 발송 (지금은 미구현 → 콘솔 폴백)
  kakao: process.env.KAKAO_API_KEY ? async (m) => { /* TODO: 카카오 알림톡 */ console.log(`💬 (kakao 미구현) ${m.recipient}`); return "pending"; } : null,
};

// 사용 가능한 외부 채널(키 설정된 것). 없으면 콘솔.
export function availableChannels() { return Object.entries(adapters).filter(([k, v]) => k !== "console" && v).map(([k]) => k); }

// notify({channel, recipient, subject, body, template})
export async function notify({ channel = "auto", recipient = "operator", subject = "", body = "", template = "" } = {}) {
  let ch = channel;
  if (ch === "auto") ch = availableChannels()[0] || "console";
  const adapter = adapters[ch] || adapters.console;
  let status = "logged";
  try { status = (await adapter({ recipient, subject, body, template })) || "logged"; }
  catch (e) { status = "error"; console.warn("notify error:", e?.message || e); }
  // 발송함 기록(대시보드에서 수동 전달 추적 가능)
  try { db.prepare("INSERT INTO notifications (at,channel,recipient,template,subject,body,status) VALUES (?,?,?,?,?,?,?)").run(nowISO(), ch, recipient, template, subject, body, status); } catch { /* */ }
  return { channel: ch, status };
}

// 발송함 조회/통계
export const notifications = {
  recent(n = 20) { return db.prepare("SELECT * FROM notifications ORDER BY at DESC LIMIT ?").all(n); },
  pendingCount() { return db.prepare("SELECT COUNT(*) c FROM notifications WHERE status IN ('logged','pending')").get().c; },
};

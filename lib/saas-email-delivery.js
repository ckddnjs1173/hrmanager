import crypto from "node:crypto";

function clean(value) { return String(value || "").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch])); }
function normalizeBaseUrl(value) {
  const raw = clean(value).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.origin;
  } catch { return ""; }
}
function idem(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }

export function getSaasEmailDeliveryConfig(env = process.env) {
  const provider = clean(env.SAAS_EMAIL_PROVIDER).toLowerCase();
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.SAAS_EMAIL_FROM);
  const siteUrl = normalizeBaseUrl(env.SITE_URL || env.RENDER_EXTERNAL_URL);
  const enabled = provider === "resend" && !!apiKey && !!from && !!siteUrl;
  return { enabled, provider, apiKey, from, siteUrl };
}

export function createSaasEmailDelivery({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = getSaasEmailDeliveryConfig(env);
  if (config.enabled && typeof fetchImpl !== "function") throw new Error("saas_email_fetch_required");

  async function send({ to, subject, html, idempotencyKey }) {
    if (!config.enabled) throw new Error("saas_email_delivery_not_configured");
    const recipient = clean(to).toLowerCase();
    if (!recipient || !recipient.includes("@")) throw new Error("invalid_email");
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "user-agent": "insaya-saas-email/1.0",
        "idempotency-key": idem(idempotencyKey),
      },
      body: JSON.stringify({ from: config.from, to: [recipient], subject, html }),
    });
    if (!response.ok) throw new Error("saas_email_delivery_failed");
    let body = {};
    try { body = await response.json(); } catch {}
    return { provider: "resend", messageId: clean(body?.id) || null };
  }

  async function sendMagicLink({ to, rawToken, expiresAt, challengeId }) {
    const link = `${config.siteUrl}/business-login.html#magic=${encodeURIComponent(rawToken)}`;
    return send({
      to,
      subject: "[인사야] Business 로그인 링크",
      idempotencyKey: `magic:${challengeId}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>인사야 Business 로그인</h2><p>아래 버튼을 눌러 회사 계정으로 로그인하세요.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-weight:700">인사야 Business 로그인</a></p><p style="font-size:12px;color:#667085">이 링크는 ${escapeHtml(expiresAt)}까지 유효하며 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p></div>`,
    });
  }

  async function sendAdvisorInvitation({ to, rawToken, invitationId, businessCaseTitle, invitationExpiresAt }) {
    const link = `${config.siteUrl}/advisor.html#invite=${encodeURIComponent(rawToken)}`;
    return send({
      to,
      subject: `[인사야] 외부 노무자문 검토 요청${businessCaseTitle ? ` - ${businessCaseTitle}` : ""}`,
      idempotencyKey: `advisor-invite:${invitationId}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>외부 노무자문 검토 요청</h2><p>${businessCaseTitle ? `<b>${escapeHtml(businessCaseTitle)}</b> Case의 검토 요청이 도착했습니다.` : "검토 요청이 도착했습니다."}</p><p>초대를 수락하면 공유된 Business Case와 해당 Case의 검토 문서에만 접근할 수 있습니다.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-weight:700">검토 요청 확인</a></p><p style="font-size:12px;color:#667085">초대 링크는 ${escapeHtml(invitationExpiresAt)}까지 유효합니다. 링크를 다른 사람에게 전달하지 마세요.</p></div>`,
    });
  }

  return { config, sendMagicLink, sendAdvisorInvitation };
}

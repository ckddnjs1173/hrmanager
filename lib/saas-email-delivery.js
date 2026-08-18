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

  const mailShell = ({ eyebrow, title, body, buttonLabel, link, footer }) => `<div style="margin:0;padding:32px 16px;background:#f7f7fb;font-family:Pretendard,Arial,sans-serif;color:#15151b"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e7ef;border-radius:16px;padding:32px"><div style="font-size:13px;font-weight:800;color:#5b4bff;margin-bottom:10px">${escapeHtml(eyebrow)}</div><h2 style="margin:0 0 14px;font-size:24px;line-height:1.35;color:#17171d">${escapeHtml(title)}</h2><div style="font-size:15px;line-height:1.7;color:#4c4b57">${body}</div><p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#5b4bff;color:#fff;text-decoration:none;font-size:14px;font-weight:800">${escapeHtml(buttonLabel)}</a></p><p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #eeedf3;font-size:12px;line-height:1.6;color:#7d7b88">${footer}</p></div></div>`;

  async function sendMagicLink({ to, rawToken, expiresAt, challengeId }) {
    const link = `${config.siteUrl}/business-login.html#magic=${encodeURIComponent(rawToken)}`;
    return send({
      to,
      subject: "[인사야] Business 로그인 링크",
      idempotencyKey: `magic:${challengeId}`,
      html: mailShell({
        eyebrow: "INSAYA BUSINESS",
        title: "회사 계정 로그인",
        body: "아래 버튼을 눌러 인사야 Business에 로그인하세요. 이 링크는 한 번만 사용할 수 있습니다.",
        buttonLabel: "인사야 Business 로그인",
        link,
        footer: `링크 유효기간: ${escapeHtml(expiresAt)} · 본인이 요청하지 않았다면 이 메일을 무시하세요.`,
      }),
    });
  }

  async function sendOrganizationInvitation({ to, rawToken, invitationId, roleKey, organizationName, expiresAt }) {
    const link = `${config.siteUrl}/business-login.html#org-invite=${encodeURIComponent(rawToken)}`;
    const roleLabel = ({ HR_ADMIN:"인사관리자", MANAGER:"관리자", EMPLOYEE:"구성원", BILLING_ADMIN:"결제관리자" })[roleKey] || roleKey || "구성원";
    return send({
      to,
      subject: `[인사야] ${organizationName || "회사"} Business 초대`,
      idempotencyKey: `organization-invite:${invitationId}`,
      html: mailShell({
        eyebrow: "INSAYA BUSINESS INVITATION",
        title: `${organizationName || "회사"}에서 초대했습니다`,
        body: `인사야 Business의 <b>${escapeHtml(roleLabel)}</b> 권한으로 초대되었습니다. 초대를 받은 이메일 계정으로 로그인한 뒤 수락해 주세요.`,
        buttonLabel: "회사 초대 확인",
        link,
        footer: `초대 유효기간: ${escapeHtml(expiresAt)} · 이 링크를 다른 사람에게 전달하지 마세요.`,
      }),
    });
  }

  async function sendAdvisorInvitation({ to, rawToken, invitationId, businessCaseTitle, invitationExpiresAt }) {
    const link = `${config.siteUrl}/advisor.html#invite=${encodeURIComponent(rawToken)}`;
    return send({
      to,
      subject: `[인사야] 외부 노무자문 검토 요청${businessCaseTitle ? ` - ${businessCaseTitle}` : ""}`,
      idempotencyKey: `advisor-invite:${invitationId}`,
      html: mailShell({
        eyebrow: "INSAYA ADVISOR",
        title: "외부 노무자문 검토 요청",
        body: `${businessCaseTitle ? `<b>${escapeHtml(businessCaseTitle)}</b> Case의 ` : ""}검토 요청이 도착했습니다. 초대를 수락하면 공유된 Business Case와 해당 Case의 검토 문서에만 접근할 수 있습니다.`,
        buttonLabel: "검토 요청 확인",
        link,
        footer: `초대 유효기간: ${escapeHtml(invitationExpiresAt)} · 링크를 다른 사람에게 전달하지 마세요.`,
      }),
    });
  }

  return { config, sendMagicLink, sendOrganizationInvitation, sendAdvisorInvitation };
}

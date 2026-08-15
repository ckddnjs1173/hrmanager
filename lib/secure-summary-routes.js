import express from "express";
import crypto from "node:crypto";
import { bookings, accessLogs } from "./repo.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function telephoneHref(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  return digits.length >= 9 ? digits : "";
}

function stateMarkup(icon, title, description) {
  return `<div class="rv-state"><div class="ic">${icon}</div><div class="t">${title}</div><p>${description}</p></div>`;
}

function pageMarkup(title, inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/><title>${title} · 인사야</title>
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg"/>
  <link rel="stylesheet" href="/assets/brand/app.css"/>
  <style>
    body{padding:0}
    .rv-top{background:#fff;border-bottom:1px solid var(--line);padding:1rem 1.2rem;display:flex;align-items:center;gap:.5rem;font-weight:800;color:var(--ink-900)}
    .rv-top .b{color:var(--accent)}
    .rv-wrap{max-width:640px;margin:0 auto;padding:1.4rem 1.1rem}
    .rv-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:1.5rem 1.4rem;box-shadow:var(--e1)}
    .rv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1rem}
    .rv-eb{font-size:.74rem;font-weight:800;color:var(--accent-ink)}
    .rv-title{font-size:1.25rem;font-weight:800;color:var(--ink-900);margin-top:.2rem}
    .rv-row{display:flex;gap:.8rem;padding:.6rem 0;border-bottom:1px dashed var(--line);font-size:.95rem}
    .rv-row .k{width:88px;color:var(--ink-400);font-weight:700;flex-shrink:0}
    .rv-row .v{color:var(--ink-800)}
    .rv-sum{margin-top:1rem}
    .rv-sum .k{color:var(--accent-ink);font-weight:800;font-size:.9rem;margin-bottom:.4rem}
    .rv-sum pre{white-space:pre-wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:1rem;font-family:inherit;font-size:.92rem;color:var(--ink-700);margin:0}
    .rv-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem}
    .rv-note{margin-top:1.2rem;background:var(--accent-soft);border-radius:var(--r-md);padding:.9rem 1rem;font-size:.82rem;color:var(--ink-600);line-height:1.6}
    .rv-state{text-align:center;padding:2.5rem 1rem}
    .rv-state .ic{font-size:3rem}
    .rv-state .t{font-size:1.2rem;font-weight:800;color:var(--ink-900);margin:.6rem 0 .3rem}
    .rv-state p{color:var(--ink-400);font-size:.92rem;margin:0}
    @media print{.no-print{display:none!important}.rv-top{border:none}.rv-card{box-shadow:none;border:none}body{background:#fff}}
  </style></head>
  <body>
    <div class="rv-top no-print"><span class="b">●</span> 인사야</div>
    <div class="rv-wrap"><div class="rv-card">${inner}</div></div>
  </body></html>`;
}

export function createSecureSummaryRouter({ sessionSecret }) {
  if (typeof sessionSecret !== "string" || !sessionSecret) throw new Error("secure_summary_session_secret_required");

  const router = express.Router();

  router.get("/r/:token", (req, res) => {
    const record = bookings.byToken(req.params.token);
    res.set("Content-Type", "text/html; charset=utf-8");

    if (!record) {
      return res.status(404).send(pageMarkup("링크를 찾을 수 없습니다", stateMarkup("🔍", "유효하지 않은 링크예요", "주소가 정확한지 확인하거나, 운영자에게 링크 재발급을 요청해 주세요.")));
    }

    if (record.expires && new Date(record.expires) < new Date()) {
      return res.status(410).send(pageMarkup("만료된 링크", stateMarkup("⏰", "만료된 열람 링크예요", "보안을 위해 링크는 발급 후 일정 기간만 유효합니다. 운영자에게 재발급을 요청해 주세요.")));
    }

    accessLogs.add({
      booking_id: record.id,
      token: record.token,
      ip_hash: crypto.createHash("sha256").update((req.ip || "") + sessionSecret).digest("hex").slice(0, 16),
      ua: req.get("user-agent"),
    });

    const tel = telephoneHref(record.contact);
    const body = `
      <div class="rv-head">
        <div><div class="rv-eb">노무사 전달용 · 상담 요약서</div><div class="rv-title">${escapeHtml(record.nomu) || "노무 상담"} 요청</div></div>
        <span class="badge info dot">접수 ${escapeHtml((record.at || "").slice(0, 10))}</span>
      </div>
      <div class="rv-grid">
        <div class="rv-row"><span class="k">신청자</span><span class="v">${escapeHtml(record.name) || "(미입력)"}</span></div>
        <div class="rv-row"><span class="k">연락처</span><span class="v">${tel ? `<a href="tel:${tel}">${escapeHtml(record.contact)}</a>` : escapeHtml(record.contact) || "-"}</span></div>
        <div class="rv-row"><span class="k">희망 노무사</span><span class="v">${escapeHtml(record.nomu) || "-"}</span></div>
        ${record.message ? `<div class="rv-row"><span class="k">남긴 말</span><span class="v">${escapeHtml(record.message)}</span></div>` : ""}
      </div>
      ${record.summary ? `<div class="rv-sum"><div class="k">상담 요약 (AI 정리)</div><pre>${escapeHtml(record.summary)}</pre></div>` : ""}
      <div class="rv-actions no-print">
        ${tel ? `<a class="btn primary" href="tel:${tel}">📞 신청자에게 전화</a>` : ""}
        <button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF</button>
      </div>
      <div class="rv-note">
        <b>안내</b> · 회사명·실명 등 민감정보는 <b>마스킹</b>되어 있습니다. 본 링크는 <b>${escapeHtml((record.expires || "").slice(0, 10))}</b>까지 유효하며, <b>상담 목적 외 사용을 금합니다</b>. 열람 기록은 보안을 위해 저장됩니다.
      </div>`;

    return res.send(pageMarkup("상담 요약서 (노무사 전달용)", body));
  });

  return router;
}

export { escapeHtml, telephoneHref };

import express from "express";
import crypto from "node:crypto";
import { bookings, accessLogs } from "./runtime-repo.js";
import { escapeHtml, renderBrandedPage, renderStateMarkup } from "./branded-page.js";

function telephoneHref(value){const digits=String(value||"").replace(/[^\d+]/g,"");return digits.length>=9?digits:"";}

export function createSecureSummaryRouter({sessionSecret}){
  if(typeof sessionSecret!=="string"||!sessionSecret)throw new Error("secure_summary_session_secret_required");
  const router=express.Router();
  router.get("/r/:token",async(req,res)=>{
    const record=await bookings.byToken(req.params.token);res.set("Content-Type","text/html; charset=utf-8");
    if(!record)return res.status(404).send(renderBrandedPage("링크를 찾을 수 없습니다",renderStateMarkup("🔍","유효하지 않은 링크예요","주소가 정확한지 확인하거나, 운영자에게 링크 재발급을 요청해 주세요.")));
    if(record.expires&&new Date(record.expires)<new Date())return res.status(410).send(renderBrandedPage("만료된 링크",renderStateMarkup("⏰","만료된 열람 링크예요","보안을 위해 링크는 발급 후 일정 기간만 유효합니다. 운영자에게 재발급을 요청해 주세요.")));
    await accessLogs.add({booking_id:record.id,token:record.token,ip_hash:crypto.createHash("sha256").update((req.ip||"")+sessionSecret).digest("hex").slice(0,16),ua:req.get("user-agent")});
    const tel=telephoneHref(record.contact);
    const body=`
      <div class="rv-head"><div><div class="rv-eb">노무사 전달용 · 상담 요약서</div><div class="rv-title">${escapeHtml(record.nomu)||"노무 상담"} 요청</div></div><span class="badge info dot">접수 ${escapeHtml((record.at||"").slice(0,10))}</span></div>
      <div class="rv-grid"><div class="rv-row"><span class="k">신청자</span><span class="v">${escapeHtml(record.name)||"(미입력)"}</span></div><div class="rv-row"><span class="k">연락처</span><span class="v">${tel?`<a href="tel:${tel}">${escapeHtml(record.contact)}</a>`:escapeHtml(record.contact)||"-"}</span></div><div class="rv-row"><span class="k">희망 노무사</span><span class="v">${escapeHtml(record.nomu)||"-"}</span></div>${record.message?`<div class="rv-row"><span class="k">남긴 말</span><span class="v">${escapeHtml(record.message)}</span></div>`:""}</div>
      ${record.summary?`<div class="rv-sum"><div class="k">상담 요약 (AI 정리)</div><pre>${escapeHtml(record.summary)}</pre></div>`:""}
      <div class="rv-actions no-print">${tel?`<a class="btn primary" href="tel:${tel}">📞 신청자에게 전화</a>`:""}<button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF</button></div>
      <div class="rv-note"><b>안내</b> · 회사명·실명 등 민감정보는 <b>마스킹</b>되어 있습니다. 본 링크는 <b>${escapeHtml((record.expires||"").slice(0,10))}</b>까지 유효하며, <b>상담 목적 외 사용을 금합니다</b>. 열람 기록은 보안을 위해 저장됩니다.</div>`;
    return res.send(renderBrandedPage("상담 요약서 (노무사 전달용)",body));
  });
  return router;
}
export{telephoneHref};

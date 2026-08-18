const ADVISOR_API="/api/saas";
const advisorState={csrf:"",user:null,magicToken:"",inviteToken:"",preview:null,grants:[],selectedGrantId:"",reviewNotes:[],documents:[]};
const a$=(id)=>document.getElementById(id);
const aEsc=(value)=>String(value??"").replace(/[&<>'"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const aFmt=(value)=>value?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"-";
const aSize=(value)=>{const n=Number(value)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;};
const DOC_STATUS={DRAFT:"초안",IN_REVIEW:"검토 요청",CHANGES_REQUESTED:"수정 요청됨",APPROVED:"검토 완료",WITHDRAWN:"철회됨"};
const DOC_KIND={EMPLOYMENT_CONTRACT:"근로계약서",NOTICE:"통지서",AGREEMENT:"합의서",PAYROLL_SUPPORT:"임금·급여 자료",EVIDENCE:"증빙 자료",OTHER:"기타"};

function advisorView(id){for(const name of ["advisor-loading","advisor-disabled","advisor-login","advisor-invite-view","advisor-workspace"])a$(name).hidden=name!==id;}
function errorTo(id,message=""){const node=a$(id);if(node)node.textContent=message;}
async function advisorApi(path,options={}){
  const headers={...(options.headers||{})};if(options.body!==undefined)headers["content-type"]="application/json";
  if(advisorState.csrf&&!["GET","HEAD"].includes((options.method||"GET").toUpperCase()))headers["x-csrf-token"]=advisorState.csrf;
  const response=await fetch(`${ADVISOR_API}${path}`,{credentials:"same-origin",...options,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  let body=null;try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body?.error||`http_${response.status}`);error.status=response.status;throw error;}return body;
}

function consumeInvitationFragment(){const hash=new URLSearchParams(location.hash.replace(/^#/,""));const token=String(hash.get("invite")||"").trim();if(token)advisorState.inviteToken=token;if(location.hash)history.replaceState(null,"",`${location.pathname}${location.search}`);}
function permissionLabel(permission){return ({"case.read":"Case 열람","comment.create":"의견 작성","document.read":"문서 열람","document.review":"문서 검토"})[permission]||permission;}
function renderPreview(){
  const data=advisorState.preview;if(!data)return;
  a$("advisor-invite-preview").innerHTML=`<div class="preview-row"><small>회사</small><strong>${aEsc(data.organization?.displayName||"-")}</strong></div><div class="preview-row"><small>Business Case</small><strong>${aEsc(data.businessCase?.title||"-")}</strong><div class="meta">상태 ${aEsc(data.businessCase?.status||"-")}</div></div><div class="preview-row"><small>허용 범위</small><strong>${(data.invitation?.permissions||[]).map(permissionLabel).map(aEsc).join(" · ")}</strong><div class="meta">이 Case와 공유 문서만 접근할 수 있으며 회사 직원·급여·조직설정에는 접근할 수 없습니다.</div></div><div class="preview-row"><small>초대 만료</small><div>${aEsc(aFmt(data.invitation?.invitationExpiresAt))}</div></div><div class="preview-row"><small>Case 접근 만료</small><div>${aEsc(aFmt(data.invitation?.grantExpiresAt))}</div></div>`;
}
async function previewInvitation(){if(!advisorState.inviteToken)return false;try{advisorState.preview=await advisorApi("/advisor/invitations/preview",{method:"POST",body:{token:advisorState.inviteToken}});renderPreview();advisorView("advisor-invite-view");return true;}catch(error){errorTo("advisor-workspace-error",`초대를 확인할 수 없습니다: ${error.message}`);advisorState.inviteToken="";return false;}}

function grantStatus(grant){return grant.effectiveStatus||grant.status||"-";}
function renderGrants(){
  const host=a$("advisor-grant-list");if(!advisorState.grants.length){host.innerHTML=`<div class="empty">현재 공유받은 Case가 없습니다.</div>`;a$("advisor-case-detail").innerHTML=`<div class="empty">회사에서 공유 초대를 수락하면 Case가 여기에 표시됩니다.</div>`;return;}
  host.innerHTML=advisorState.grants.map(grant=>`<button type="button" class="grant-item ${grant.id===advisorState.selectedGrantId?"active":""}" data-advisor-grant-id="${aEsc(grant.id)}"><strong>Business Case</strong><div class="meta">${(grant.permissions||[]).map(permissionLabel).map(aEsc).join(" · ")}</div><div class="meta">만료 ${aEsc(aFmt(grant.expiresAt))}</div><div style="margin-top:7px"><span class="chip">${aEsc(grantStatus(grant))}</span></div></button>`).join("");
}
function renderReviewNotes(grant){
  const notes=advisorState.reviewNotes||[];const notesHtml=notes.length?notes.map(note=>`<div class="review-note"><div><b>${note.authorType==="ADVISOR"?"외부 전문가":"회사"}</b><span>${aEsc(aFmt(note.createdAt))}</span></div><p>${aEsc(note.body)}</p></div>`).join(""):`<div class="review-empty">아직 Case 검토 의견이 없습니다.</div>`;
  const form=(grant.permissions||[]).includes("comment.create")?`<form id="advisor-review-form" class="review-form"><label>Case 의견<textarea id="advisor-review-body" rows="3" maxlength="5000" required placeholder="회사에 전달할 Case 관련 의견을 입력해 주세요."></textarea></label><button class="primary" type="submit">의견 남기기</button></form>`:`<div class="review-empty">이 공유에는 의견 작성 권한이 없습니다.</div>`;
  return `<section class="review-thread"><div class="review-head"><div><div class="eyebrow">CASE REVIEW</div><h2>Case 의견</h2></div><button type="button" class="secondary" data-advisor-notes-refresh="1">새로고침</button></div><div class="review-list">${notesHtml}</div>${form}</section>`;
}
function advisorDocumentVersion(version,grantId){
  const url=`${ADVISOR_API}/advisor/share-grants/${encodeURIComponent(grantId)}/document-versions/${encodeURIComponent(version.id)}/download`;
  return `<div class="advisor-doc-version"><div><strong>v${aEsc(version.versionNo)}</strong><span>${aEsc(version.fileName)}</span></div><small>${aEsc(aSize(version.sizeBytes))} · ${aEsc(aFmt(version.createdAt))}</small><a href="${aEsc(url)}">파일 다운로드</a></div>`;
}
function advisorReviewHistory(reviews=[]){return reviews.length?`<div class="advisor-doc-history"><strong>검토 이력</strong>${reviews.map(review=>`<div class="advisor-doc-history-row"><span class="advisor-doc-state ${aEsc(review.decision)}">${review.decision==="APPROVED"?"승인":"수정 요청"}</span><p>${aEsc(review.reviewNote||"의견 없음")}</p><small>${aEsc(aFmt(review.createdAt))}</small></div>`).join("")}</div>`:"";}
function renderAdvisorDocuments(grant){
  if(!(grant.permissions||[]).includes("document.read"))return `<section class="advisor-documents"><div class="review-empty">이 공유에는 문서 열람 권한이 없습니다.</div></section>`;
  if(!advisorState.documents.length)return `<section class="advisor-documents"><div class="advisor-doc-head"><div><div class="eyebrow">DOCUMENT REVIEW</div><h2>검토 문서</h2></div></div><div class="review-empty">회사가 아직 검토 문서를 공유하지 않았습니다.</div></section>`;
  const canReview=(grant.permissions||[]).includes("document.review");
  const cards=advisorState.documents.map(entry=>{
    const detail=entry.detail||{document:entry,versions:[],reviews:[]};const document=detail.document||entry;const versions=detail.versions||[];const reviews=detail.reviews||[];
    const action=document.status==="IN_REVIEW"&&canReview?`<form class="advisor-doc-review-form" data-advisor-document-review="${aEsc(document.id)}"><label>검토 의견<textarea name="note" rows="3" maxlength="5000" placeholder="수정 요청 시 사유를 입력해 주세요. 승인 시에는 선택사항입니다."></textarea></label><div class="advisor-doc-review-actions"><button type="submit" class="secondary" value="CHANGES_REQUESTED">수정 요청</button><button type="submit" class="primary" value="APPROVED">승인</button></div></form>`:document.status==="CHANGES_REQUESTED"?`<div class="advisor-doc-next">회사에서 수정본을 준비하고 있습니다.</div>`:document.status==="APPROVED"?`<div class="advisor-doc-next success">검토 완료된 문서입니다.</div>`:"";
    return `<article class="advisor-doc-card" data-advisor-document-id="${aEsc(document.id)}"><div class="advisor-doc-card-head"><div><span>${aEsc(DOC_KIND[document.documentKind]||"문서")}</span><h3>${aEsc(document.title)}</h3></div><span class="advisor-doc-state ${aEsc(document.status)}">${aEsc(DOC_STATUS[document.status]||document.status)}</span></div><div class="advisor-doc-version-list">${versions.length?versions.map(version=>advisorDocumentVersion(version,grant.id)).join(""):`<div class="review-empty">다운로드할 버전이 없습니다.</div>`}</div>${advisorReviewHistory(reviews)}${action}</article>`;
  }).join("");
  return `<section class="advisor-documents"><div class="advisor-doc-head"><div><div class="eyebrow">DOCUMENT REVIEW</div><h2>검토 문서</h2><p>최신 버전을 내려받아 확인한 뒤 승인하거나 수정이 필요한 부분을 남겨 주세요.</p></div><button class="secondary" type="button" data-advisor-documents-refresh="1">새로고침</button></div><div class="advisor-doc-list">${cards}</div></section>`;
}

async function loadAdvisorDocuments(grant){
  advisorState.documents=[];if(!(grant.permissions||[]).includes("document.read"))return;
  const data=await advisorApi(`/advisor/share-grants/${encodeURIComponent(grant.id)}/documents`);const documents=data.documents||[];
  advisorState.documents=await Promise.all(documents.map(async(document)=>{try{return {...document,detail:await advisorApi(`/advisor/share-grants/${encodeURIComponent(grant.id)}/documents/${encodeURIComponent(document.id)}`)};}catch{return document;}}));
}
async function openSharedCase(grantId){
  advisorState.selectedGrantId=grantId;advisorState.reviewNotes=[];advisorState.documents=[];renderGrants();
  try{
    const [data,notesData]=await Promise.all([advisorApi(`/advisor/share-grants/${encodeURIComponent(grantId)}/case`),advisorApi(`/advisor/share-grants/${encodeURIComponent(grantId)}/review-notes`)]);
    const item=data.businessCase||{};const grant=data.shareGrant||{};advisorState.reviewNotes=notesData.reviewNotes||[];await loadAdvisorDocuments(grant);
    a$("advisor-case-detail").innerHTML=`<div class="eyebrow">SHARED BUSINESS CASE</div><div class="case-title">${aEsc(item.title||"-")}</div><div class="collab-meta"><span class="chip">${aEsc(item.status||"-")}</span></div><p class="case-summary">${aEsc(item.summary||"요약 없음")}</p>${item.resolutionNote?`<div class="notice"><b>해결 메모</b><br>${aEsc(item.resolutionNote)}</div>`:""}<div class="meta">허용 범위 ${(grant.permissions||[]).map(permissionLabel).map(aEsc).join(" · ")} · 접근 만료 ${aEsc(aFmt(grant.expiresAt))}</div>${renderAdvisorDocuments(grant)}${renderReviewNotes(grant)}`;
  }catch(error){a$("advisor-case-detail").innerHTML=`<div class="empty">Case를 불러올 수 없습니다: ${aEsc(error.message)}</div>`;}
}
async function createAdvisorReviewNote(event){
  if(event.target?.id!=="advisor-review-form")return;event.preventDefault();const body=String(a$("advisor-review-body")?.value||"").trim();if(!body)return;const button=event.target.querySelector("button[type=submit]");if(button)button.disabled=true;
  try{await advisorApi(`/advisor/share-grants/${encodeURIComponent(advisorState.selectedGrantId)}/review-notes`,{method:"POST",body:{body}});await openSharedCase(advisorState.selectedGrantId);}catch(error){errorTo("advisor-workspace-error",`검토 의견 저장 실패: ${error.message}`);}finally{if(button)button.disabled=false;}
}
async function reviewAdvisorDocument(event){
  const form=event.target.closest("[data-advisor-document-review]");if(!form)return;event.preventDefault();const decision=event.submitter?.value||"";const note=String(new FormData(form).get("note")||"").trim();if(decision==="CHANGES_REQUESTED"&&!note){errorTo("advisor-workspace-error","수정 요청 사유를 입력해 주세요.");return;}const buttons=[...form.querySelectorAll("button[type=submit]")];buttons.forEach(button=>button.disabled=true);errorTo("advisor-workspace-error","");
  try{await advisorApi(`/advisor/share-grants/${encodeURIComponent(advisorState.selectedGrantId)}/documents/${encodeURIComponent(form.dataset.advisorDocumentReview)}/review`,{method:"POST",body:{decision,note}});await openSharedCase(advisorState.selectedGrantId);}catch(error){errorTo("advisor-workspace-error",`문서 검토 저장 실패: ${error.message}`);}finally{buttons.forEach(button=>button.disabled=false);}
}

async function loadAdvisorWorkspace(){
  errorTo("advisor-workspace-error","");try{const data=await advisorApi("/advisor/share-grants");advisorState.grants=(data.shareGrants||[]).filter(item=>grantStatus(item)==="ACTIVE");if(advisorState.selectedGrantId&&!advisorState.grants.some(item=>item.id===advisorState.selectedGrantId))advisorState.selectedGrantId="";renderGrants();advisorView("advisor-workspace");a$("advisor-current-user").textContent=advisorState.user?.email||"";const grantToOpen=advisorState.selectedGrantId||advisorState.grants[0]?.id||"";if(grantToOpen)await openSharedCase(grantToOpen);}catch(error){errorTo("advisor-workspace-error",`공유 목록 조회 실패: ${error.message}`);advisorView("advisor-workspace");}
}
async function afterAuthenticated(){if(advisorState.inviteToken){const previewed=await previewInvitation();if(previewed)return;}await loadAdvisorWorkspace();}
async function bootstrapAdvisor(){consumeInvitationFragment();advisorView("advisor-loading");try{const me=await advisorApi("/auth/me");advisorState.user=me.user;advisorState.csrf=me.csrf;await afterAuthenticated();}catch(error){if(error.status===404)return advisorView("advisor-disabled");if(error.status===401)return advisorView("advisor-login");advisorView("advisor-disabled");}}

a$("advisor-login-form")?.addEventListener("submit",async(event)=>{event.preventDefault();errorTo("advisor-login-error","");try{const result=await advisorApi("/auth/magic-link",{method:"POST",body:{email:a$("advisor-login-email").value}});if(result.debugToken){advisorState.magicToken=result.debugToken;a$("advisor-magic-box").hidden=false;}else errorTo("advisor-login-error","이메일로 전송된 로그인 링크를 확인해 주세요.");}catch(error){errorTo("advisor-login-error",error.message==="magic_link_delivery_not_configured"?"현재 로그인 링크 발송 설정이 필요합니다.":`로그인 요청 실패: ${error.message}`);}});
a$("advisor-verify-magic")?.addEventListener("click",async()=>{if(!advisorState.magicToken)return;try{const result=await advisorApi("/auth/magic-link/verify",{method:"POST",body:{token:advisorState.magicToken}});advisorState.user=result.user;advisorState.csrf=result.csrf;advisorState.magicToken="";await afterAuthenticated();}catch(error){errorTo("advisor-login-error",`로그인 실패: ${error.message}`);}});
a$("advisor-accept-invite")?.addEventListener("click",async()=>{if(!advisorState.inviteToken)return;const button=a$("advisor-accept-invite");button.disabled=true;errorTo("advisor-invite-error","");try{const result=await advisorApi("/advisor/invitations/accept",{method:"POST",body:{token:advisorState.inviteToken}});advisorState.inviteToken="";advisorState.preview=null;advisorState.selectedGrantId=result.shareGrant?.id||"";await loadAdvisorWorkspace();}catch(error){errorTo("advisor-invite-error",`초대 수락 실패: ${error.message}`);}finally{button.disabled=false;}});
a$("advisor-ignore-invite")?.addEventListener("click",()=>{advisorState.inviteToken="";advisorState.preview=null;loadAdvisorWorkspace();});a$("advisor-refresh")?.addEventListener("click",()=>loadAdvisorWorkspace());a$("advisor-grant-list")?.addEventListener("click",(event)=>{const button=event.target.closest("[data-advisor-grant-id]");if(button)openSharedCase(button.dataset.advisorGrantId);});
a$("advisor-case-detail")?.addEventListener("click",(event)=>{if(event.target.closest("[data-advisor-notes-refresh]")||event.target.closest("[data-advisor-documents-refresh]"))openSharedCase(advisorState.selectedGrantId);});
a$("advisor-case-detail")?.addEventListener("submit",(event)=>{createAdvisorReviewNote(event);reviewAdvisorDocument(event);});
a$("advisor-logout")?.addEventListener("click",async()=>{try{await advisorApi("/auth/logout",{method:"POST",body:{}});}catch{}advisorState.csrf="";advisorState.user=null;advisorState.grants=[];advisorState.selectedGrantId="";advisorState.reviewNotes=[];advisorState.documents=[];advisorView("advisor-login");});
document.addEventListener("DOMContentLoaded",bootstrapAdvisor);

const COLLAB_API = "/api/saas";
const collab = {
  csrf:"", orgId:"", cases:[], invitations:[], grants:[], notesByCase:{}, documentsByCase:{},
  expandedCaseId:"", expandedDocumentCaseId:"", initialized:false, loadSeq:0,
};
const c$=(id)=>document.getElementById(id);
const cEsc=(value)=>String(value??"").replace(/[&<>'"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const cFmt=(value)=>value?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"-";
const cSize=(value)=>{const n=Number(value)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;};
const DOC_PERMISSIONS=["case.read","comment.create","document.read","document.review"];
const DOC_STATUS={DRAFT:"초안",IN_REVIEW:"검토 중",CHANGES_REQUESTED:"수정 필요",APPROVED:"검토 완료",WITHDRAWN:"철회됨"};
const DOC_KIND={EMPLOYMENT_CONTRACT:"근로계약서",NOTICE:"통지서",AGREEMENT:"합의서",PAYROLL_SUPPORT:"임금·급여 자료",EVIDENCE:"증빙 자료",OTHER:"기타"};

async function collabApi(path,options={}){
  const headers={...(options.headers||{})};
  if(options.body!==undefined)headers["content-type"]="application/json";
  if(collab.csrf&&!["GET","HEAD"].includes((options.method||"GET").toUpperCase()))headers["x-csrf-token"]=collab.csrf;
  const response=await fetch(`${COLLAB_API}${path}`,{credentials:"same-origin",...options,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  let body=null;try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body?.error||`http_${response.status}`);error.status=response.status;throw error;}
  return body;
}

async function collabUpload(path,file){
  const headers={"content-type":documentMime(file)};
  if(collab.csrf)headers["x-csrf-token"]=collab.csrf;
  const response=await fetch(`${COLLAB_API}${path}`,{method:"POST",credentials:"same-origin",headers,body:file});
  let body=null;try{body=await response.json();}catch{}
  if(!response.ok){const error=new Error(body?.error||`http_${response.status}`);error.status=response.status;throw error;}
  return body;
}

function collabFlash(message,kind="ok"){
  const host=c$("collab-flash");if(!host)return;
  host.textContent=message;host.className=`flash ${kind==="error"?"error":""}`;host.hidden=false;
  clearTimeout(collabFlash.timer);collabFlash.timer=setTimeout(()=>host.hidden=true,4200);
}
function grantExpiryIso(days=30){const date=new Date();date.setUTCDate(date.getUTCDate()+days);return date.toISOString();}
function shareableCases(){return collab.cases.filter(item=>["OPEN","RESOLVED"].includes(item.status));}
function caseTitle(caseId){return collab.cases.find(item=>item.id===caseId)?.title||"Business Case";}
function documentMime(file){
  const ext=String(file?.name||"").toLowerCase().split(".").pop();
  const map={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",hwp:"application/x-hwp",hwpx:"application/vnd.hancom.hwpx"};
  return map[ext]||String(file?.type||"").toLowerCase();
}
function validateDocumentFile(file){
  if(!(file instanceof File)||!file.name)throw new Error("검토할 파일을 선택해 주세요.");
  if(file.size<1||file.size>10*1024*1024)throw new Error("파일은 10MB 이하만 업로드할 수 있습니다.");
  if(!["pdf","docx","hwp","hwpx"].includes(file.name.toLowerCase().split(".").pop()))throw new Error("PDF, DOCX, HWP, HWPX 파일만 업로드할 수 있습니다.");
  return file;
}
function defaultDocumentTitle(fileName){return String(fileName||"").replace(/\.[^.]+$/,"").slice(0,200)||"검토 문서";}

function renderCaseSelect(){
  const select=c$("advisor-case-select");if(!select)return;
  const rows=shareableCases();
  select.innerHTML=`<option value="">공유할 Case 선택</option>${rows.map(item=>`<option value="${cEsc(item.id)}">${cEsc(item.title)} · ${cEsc(item.status)}</option>`).join("")}`;
  c$("advisor-invite-submit").disabled=rows.length===0;
}
function caseActionButtons(item){
  if(item.status==="DRAFT")return `<button class="primary" data-case-transition="OPEN" data-case-id="${cEsc(item.id)}">자문 시작</button>`;
  if(item.status==="OPEN")return `<button data-case-transition="RESOLVED" data-case-id="${cEsc(item.id)}">해결 처리</button><button class="danger" data-case-transition="ARCHIVED" data-case-id="${cEsc(item.id)}">보관</button>`;
  if(item.status==="RESOLVED")return `<button data-case-transition="OPEN" data-case-id="${cEsc(item.id)}">다시 열기</button><button class="danger" data-case-transition="ARCHIVED" data-case-id="${cEsc(item.id)}">보관</button>`;
  return "";
}

function reviewNotesPanel(item){
  if(collab.expandedCaseId!==item.id)return "";
  const notes=collab.notesByCase[item.id];
  const notesHtml=notes===undefined?`<div class="collab-review-empty">검토 의견을 불러오는 중입니다.</div>`:notes.length
    ?notes.map(note=>`<div class="collab-review-note"><div><b>${note.authorType==="ADVISOR"?"외부 전문가":"회사"}</b><span>${cEsc(cFmt(note.createdAt))}</span></div><p>${cEsc(note.body)}</p></div>`).join("")
    :`<div class="collab-review-empty">아직 검토 의견이 없습니다.</div>`;
  const form=["OPEN","RESOLVED"].includes(item.status)
    ?`<form class="collab-review-form" data-case-note-form="${cEsc(item.id)}"><label>회사 의견<textarea name="body" rows="2" maxlength="5000" required placeholder="외부 전문가와 공유할 확인사항이나 회신을 입력해 주세요."></textarea></label><button type="submit" class="primary">의견 남기기</button></form>`
    :`<div class="collab-review-empty">보관된 Case는 기존 의견만 조회할 수 있습니다.</div>`;
  return `<div class="collab-review-panel"><div class="collab-review-head"><strong>Case 검토 의견</strong><button type="button" data-case-notes-refresh="${cEsc(item.id)}">새로고침</button></div><div class="collab-review-list">${notesHtml}</div>${form}</div>`;
}

function documentVersionMarkup(version,advisor=false,grantId=""){
  const url=advisor
    ?`${COLLAB_API}/advisor/share-grants/${encodeURIComponent(grantId)}/document-versions/${encodeURIComponent(version.id)}/download`
    :`${COLLAB_API}/business-case-document-versions/${encodeURIComponent(version.id)}/download`;
  return `<div class="doc-version"><div><strong>v${cEsc(version.versionNo)}</strong> ${cEsc(version.fileName)}</div><span>${cEsc(cSize(version.sizeBytes))}</span><a href="${cEsc(url)}">다운로드</a></div>`;
}
function documentReviewsMarkup(reviews=[]){
  if(!reviews.length)return "";
  return `<div class="doc-review-history"><strong>전문가 검토 기록</strong>${reviews.map(review=>`<div class="doc-review-entry"><span class="doc-status ${cEsc(review.decision)}">${review.decision==="APPROVED"?"승인":"수정 요청"}</span><p>${cEsc(review.reviewNote||"의견 없음")}</p><small>${cEsc(cFmt(review.createdAt))}</small></div>`).join("")}</div>`;
}
function renderDocumentCard(detail,item){
  const document=detail.document||item;const versions=detail.versions||[];const reviews=detail.reviews||[];
  const latest=versions[versions.length-1];const status=DOC_STATUS[document.status]||document.status;
  const canEdit=["DRAFT","CHANGES_REQUESTED"].includes(document.status);
  const submitLabel=document.status==="CHANGES_REQUESTED"?"수정본 검토 다시 요청":"전문가 검토 요청";
  return `<article class="doc-card" data-document-id="${cEsc(document.id)}">
    <div class="doc-card-head"><div><span class="doc-kind">${cEsc(DOC_KIND[document.documentKind]||"문서")}</span><h4>${cEsc(document.title)}</h4></div><span class="doc-status ${cEsc(document.status)}">${cEsc(status)}</span></div>
    ${versions.length?`<div class="doc-version-list">${versions.map(v=>documentVersionMarkup(v)).join("")}</div>`:`<div class="doc-warning">파일 업로드가 완료되지 않았습니다.</div>`}
    ${documentReviewsMarkup(reviews)}
    ${canEdit?`<div class="doc-next-actions">${versions.length?`<button type="button" class="primary" data-document-submit="${cEsc(document.id)}">${cEsc(submitLabel)}</button>`:""}<form data-document-upload-form="${cEsc(document.id)}" class="doc-inline-upload"><label>${versions.length?"새 버전 업로드":"파일 업로드"}<input type="file" name="file" accept=".pdf,.docx,.hwp,.hwpx" required></label><button type="submit">${versions.length?"버전 추가":"업로드"}</button></form></div>`:""}
    ${document.status==="IN_REVIEW"?`<div class="doc-next-hint">전문가가 파일을 검토하고 있습니다. 승인 또는 수정 요청이 오면 이 화면에 반영됩니다.</div>`:""}
    ${document.status==="APPROVED"?`<div class="doc-next-hint success">검토가 완료되었습니다. 필요하면 위 버전 이력을 내려받아 보관하세요.</div>`:""}
    ${latest?`<div class="doc-latest">최신 버전 v${cEsc(latest.versionNo)} · ${cEsc(cFmt(latest.createdAt))}</div>`:""}
  </article>`;
}
function documentPanel(item){
  if(collab.expandedDocumentCaseId!==item.id)return "";
  const rows=collab.documentsByCase[item.id];
  const body=rows===undefined?`<div class="collab-empty">문서를 불러오는 중입니다.</div>`:rows.length
    ?rows.map(entry=>renderDocumentCard(entry.detail||{document:entry},entry)).join("")
    :`<div class="collab-empty">아직 검토 문서가 없습니다. 아래에서 첫 문서를 추가해 주세요.</div>`;
  const create=["OPEN","RESOLVED"].includes(item.status)?`<form class="doc-create-form" data-case-document-form="${cEsc(item.id)}">
      <div class="doc-form-row"><label>문서 종류<select name="documentKind"><option value="EMPLOYMENT_CONTRACT">근로계약서</option><option value="NOTICE">통지서</option><option value="AGREEMENT">합의서</option><option value="PAYROLL_SUPPORT">임금·급여 자료</option><option value="EVIDENCE">증빙 자료</option><option value="OTHER">기타</option></select></label><label>문서 제목<input name="title" maxlength="200" placeholder="비워두면 파일명으로 작성"></label></div>
      <label class="doc-file-label">검토 파일<input type="file" name="file" accept=".pdf,.docx,.hwp,.hwpx" required><span>PDF · DOCX · HWP · HWPX, 최대 10MB</span></label>
      <button class="primary" type="submit">문서 추가</button>
    </form>`:"";
  return `<section class="doc-panel"><div class="doc-panel-head"><div><strong>문서 검토</strong><p>문서를 올린 뒤 검토 요청을 보내면 외부 전문가가 이 Case 안에서만 파일을 확인하고 승인 또는 수정 요청을 남깁니다.</p></div><button type="button" data-case-documents-refresh="${cEsc(item.id)}">새로고침</button></div><div class="doc-flow"><span>1 문서 추가</span><span>2 검토 요청</span><span>3 전문가 검토</span><span>4 수정 또는 완료</span></div><div class="doc-list">${body}</div>${create}</section>`;
}

function renderCases(){
  const host=c$("business-case-list");if(!host)return;
  host.innerHTML=collab.cases.length?collab.cases.map(item=>{
    const lifecycleActions=caseActionButtons(item);const canShare=["OPEN","RESOLVED"].includes(item.status);
    return `<article class="collab-case" data-business-case-id="${cEsc(item.id)}"><div class="collab-case-head"><div><h3>${cEsc(item.title)}</h3><p>${cEsc(item.summary||"요약 없음")}</p></div><span class="collab-chip ${cEsc(item.status)}">${cEsc(item.status)}</span></div><div class="collab-meta"><span class="collab-chip">생성 ${cEsc(cFmt(item.createdAt))}</span>${item.resolvedAt?`<span class="collab-chip">해결 ${cEsc(cFmt(item.resolvedAt))}</span>`:""}</div><div class="collab-actions">${lifecycleActions}${canShare?`<button type="button" class="primary" data-case-documents-toggle="${cEsc(item.id)}">${collab.expandedDocumentCaseId===item.id?"문서 닫기":"문서 검토"}</button>`:""}<button type="button" data-case-notes-toggle="${cEsc(item.id)}">${collab.expandedCaseId===item.id?"의견 닫기":"Case 의견"}</button></div>${documentPanel(item)}${reviewNotesPanel(item)}</article>`;
  }).join(""):`<div class="collab-empty">아직 Business Case가 없습니다. 외부 자문이 필요한 노무 이슈를 먼저 Case로 만들어 주세요.</div>`;
  renderCaseSelect();
}

function renderInvitations(){
  const host=c$("advisor-invitation-list");if(!host)return;
  host.innerHTML=collab.invitations.length?collab.invitations.map(item=>`<article class="collab-invite" data-advisor-invitation-id="${cEsc(item.id)}"><div class="collab-invite-head"><div><h3>${cEsc(item.advisorEmail)}</h3><p>${cEsc(caseTitle(item.resourceId))}</p></div><span class="collab-chip ${cEsc(item.effectiveStatus)}">${cEsc(item.effectiveStatus)}</span></div><div class="collab-meta"><span class="collab-chip">초대 만료 ${cEsc(cFmt(item.invitationExpiresAt))}</span><span class="collab-chip">접근 만료 ${cEsc(cFmt(item.grantExpiresAt))}</span></div><div class="collab-permission">Case 열람 · 의견 작성 · 문서 열람 · 문서 검토</div>${item.effectiveStatus==="PENDING"?`<div class="collab-actions"><button class="danger" data-invite-revoke="${cEsc(item.id)}">초대 철회</button></div>`:""}</article>`).join(""):`<div class="collab-empty">보낸 외부 자문 초대가 없습니다.</div>`;
}
function renderActiveGrants(){
  const host=c$("advisor-active-grant-list");if(!host)return;
  const active=collab.grants.filter(item=>(item.effectiveStatus||item.status)==="ACTIVE");
  host.innerHTML=active.length?active.map(item=>`<article class="collab-invite"><div class="collab-invite-head"><div><h3>${cEsc(caseTitle(item.resourceId))}</h3><p>현재 외부 전문가가 접근할 수 있습니다.</p></div><span class="collab-chip ACTIVE">접근 중</span></div><div class="collab-meta"><span class="collab-chip">만료 ${cEsc(cFmt(item.expiresAt))}</span></div><div class="collab-permission">허용 범위: Case와 이 Case에 첨부한 검토 문서만</div><div class="collab-actions"><button class="danger" data-grant-revoke="${cEsc(item.id)}">접근 종료</button></div></article>`).join(""):`<div class="collab-empty">현재 접근 중인 외부 전문가가 없습니다.</div>`;
}

async function ensureCollabSession(){const me=await collabApi("/auth/me");collab.csrf=me.csrf||"";}
async function loadCollaboration({quiet=false}={}){
  const orgId=c$("org-picker")?.value||"";if(!orgId)return false;
  const loadSeq=++collab.loadSeq;
  if(collab.orgId&&collab.orgId!==orgId){collab.notesByCase={};collab.documentsByCase={};collab.expandedCaseId="";collab.expandedDocumentCaseId="";}
  collab.orgId=orgId;
  try{
    await ensureCollabSession();
    const [cases,invitations,grants]=await Promise.all([
      collabApi(`/organizations/${encodeURIComponent(orgId)}/business-cases`),
      collabApi(`/organizations/${encodeURIComponent(orgId)}/advisor-invitations`),
      collabApi(`/organizations/${encodeURIComponent(orgId)}/advisor-grants`),
    ]);
    if(loadSeq!==collab.loadSeq||collab.orgId!==orgId||c$("org-picker")?.value!==orgId)return false;
    collab.cases=cases.businessCases||[];collab.invitations=invitations.invitations||[];collab.grants=grants.shareGrants||[];
    renderCases();renderInvitations();renderActiveGrants();
    if(collab.expandedCaseId&&collab.cases.some(item=>item.id===collab.expandedCaseId))await loadCaseNotes(collab.expandedCaseId,{quiet:true});
    if(collab.expandedDocumentCaseId&&collab.cases.some(item=>item.id===collab.expandedDocumentCaseId))await loadCaseDocuments(collab.expandedDocumentCaseId,{quiet:true});
    return true;
  }catch(error){if(loadSeq===collab.loadSeq&&!quiet)collabFlash(`협업 정보 조회 실패: ${error.message}`,"error");return false;}
}

async function createCase(event){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);
  try{
    const result=await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases`,{method:"POST",body:{title:String(data.get("title")||"").trim(),summary:String(data.get("summary")||"").trim()}});
    form.reset();
    const refreshed=await loadCollaboration({quiet:true});
    if(!refreshed){collabFlash("Case는 생성됐지만 목록 새로고침에 실패했습니다. 협업 화면을 새로고침해 주세요.","error");return;}
    collabFlash("Business Case를 만들었습니다. 자문 시작 버튼을 누르면 문서와 전문가를 연결할 수 있습니다.");
    document.querySelector(`[data-business-case-id="${CSS.escape(result.businessCase.id)}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
  }catch(error){collabFlash(`Case 생성 실패: ${error.message}`,"error");}
}
async function transitionCase(button){
  const status=button.dataset.caseTransition;const caseId=button.dataset.caseId;let resolutionNote="";if(status==="RESOLVED")resolutionNote="Business Workspace에서 해결 처리";button.disabled=true;
  try{await collabApi(`/business-cases/${encodeURIComponent(caseId)}/status`,{method:"PATCH",body:{status,resolutionNote}});const refreshed=await loadCollaboration({quiet:true});if(!refreshed)collabFlash(`Case 상태는 ${status}로 변경됐지만 목록 새로고침에 실패했습니다.`,"error");else collabFlash(`Case 상태를 ${status}로 변경했습니다.`);}catch(error){collabFlash(`Case 상태 변경 실패: ${error.message}`,"error");}finally{button.disabled=false;}
}
async function loadCaseNotes(caseId,{quiet=false}={}){try{const data=await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases/${encodeURIComponent(caseId)}/review-notes`);collab.notesByCase[caseId]=data.reviewNotes||[];renderCases();return true;}catch(error){if(!quiet)collabFlash(`검토 의견 조회 실패: ${error.message}`,"error");return false;}}
async function toggleCaseNotes(caseId){if(collab.expandedCaseId===caseId){collab.expandedCaseId="";renderCases();return;}collab.expandedCaseId=caseId;delete collab.notesByCase[caseId];renderCases();await loadCaseNotes(caseId);}
async function createBusinessReviewNote(event){
  const form=event.target.closest("[data-case-note-form]");if(!form)return;event.preventDefault();const caseId=form.dataset.caseNoteForm;const data=new FormData(form);const body=String(data.get("body")||"").trim();if(!body)return collabFlash("검토 의견을 입력해 주세요.","error");const button=form.querySelector("button[type=submit]");if(button)button.disabled=true;
  try{await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases/${encodeURIComponent(caseId)}/review-notes`,{method:"POST",body:{body}});form.reset();const refreshed=await loadCaseNotes(caseId,{quiet:true});if(!refreshed)collabFlash("회사 의견은 저장됐지만 목록 새로고침에 실패했습니다.","error");else collabFlash("회사 의견을 남겼습니다.");}catch(error){collabFlash(`검토 의견 저장 실패: ${error.message}`,"error");}finally{if(button)button.disabled=false;}
}

async function loadCaseDocuments(caseId,{quiet=false}={}){
  try{
    const data=await collabApi(`/business-cases/${encodeURIComponent(caseId)}/documents`);const documents=data.documents||[];
    const details=await Promise.all(documents.map(async(document)=>{try{return {...document,detail:await collabApi(`/business-case-documents/${encodeURIComponent(document.id)}`)};}catch{return document;}}));
    collab.documentsByCase[caseId]=details;renderCases();return true;
  }catch(error){if(!quiet)collabFlash(`문서 조회 실패: ${error.message}`,"error");return false;}
}
async function toggleCaseDocuments(caseId){if(collab.expandedDocumentCaseId===caseId){collab.expandedDocumentCaseId="";renderCases();return;}collab.expandedDocumentCaseId=caseId;delete collab.documentsByCase[caseId];renderCases();await loadCaseDocuments(caseId);}
async function createDocumentWithFile(form){
  const caseId=form.dataset.caseDocumentForm;const data=new FormData(form);const file=validateDocumentFile(data.get("file"));const title=String(data.get("title")||"").trim()||defaultDocumentTitle(file.name);const documentKind=String(data.get("documentKind")||"OTHER");
  const created=await collabApi(`/business-cases/${encodeURIComponent(caseId)}/documents`,{method:"POST",body:{title,documentKind}});
  await collabUpload(`/business-case-documents/${encodeURIComponent(created.document.id)}/content?fileName=${encodeURIComponent(file.name)}`,file);
  return {caseId,documentId:created.document.id};
}
async function handleDocumentCreate(event){
  const form=event.target.closest("[data-case-document-form]");if(!form)return;event.preventDefault();const button=form.querySelector("button[type=submit]");if(button)button.disabled=true;
  try{const result=await createDocumentWithFile(form);form.reset();await loadCaseDocuments(result.caseId,{quiet:true});collabFlash("문서를 안전하게 저장했습니다. 문서 카드에서 전문가 검토를 요청해 주세요.");}catch(error){collabFlash(`문서 추가 실패: ${error.message}`,"error");}finally{if(button)button.disabled=false;}
}
async function handleDocumentUpload(event){
  const form=event.target.closest("[data-document-upload-form]");if(!form)return;event.preventDefault();const documentId=form.dataset.documentUploadForm;const file=validateDocumentFile(new FormData(form).get("file"));const button=form.querySelector("button[type=submit]");if(button)button.disabled=true;
  try{await collabUpload(`/business-case-documents/${encodeURIComponent(documentId)}/content?fileName=${encodeURIComponent(file.name)}`,file);await loadCaseDocuments(collab.expandedDocumentCaseId,{quiet:true});collabFlash("새 문서 버전을 안전하게 저장했습니다.");}catch(error){collabFlash(`문서 업로드 실패: ${error.message}`,"error");}finally{if(button)button.disabled=false;}
}
async function submitDocumentReview(button){
  button.disabled=true;try{await collabApi(`/business-case-documents/${encodeURIComponent(button.dataset.documentSubmit)}/submit-review`,{method:"POST",body:{}});await loadCaseDocuments(collab.expandedDocumentCaseId,{quiet:true});collabFlash("전문가 검토를 요청했습니다.");}catch(error){collabFlash(`검토 요청 실패: ${error.message}`,"error");}finally{button.disabled=false;}
}

async function issueInvitation(event){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const caseId=String(data.get("caseId")||"");const advisorEmail=String(data.get("advisorEmail")||"").trim();const days=Number(data.get("grantDays")||30);if(!caseId||!advisorEmail)return collabFlash("공유할 Case와 전문가 이메일을 입력해 주세요.","error");
  try{
    const result=await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases/${encodeURIComponent(caseId)}/advisor-invitations`,{method:"POST",body:{advisorEmail,permissions:DOC_PERMISSIONS,grantExpiresAt:grantExpiryIso(days)}});
    const path=result.invitationFragmentPath||"";const absolute=new URL(path,location.origin).href;const box=c$("advisor-invite-link-box");c$("advisor-invite-link").value=absolute;form.elements.advisorEmail.value="";
    const refreshed=await loadCollaboration({quiet:true});
    box.hidden=false;
    if(!refreshed)collabFlash("초대는 생성됐지만 목록 새로고침에 실패했습니다. 아래 1회용 링크는 안전한 채널로 전달해 주세요.","error");else collabFlash("문서 검토 권한을 포함한 초대를 만들었습니다. 아래 링크를 전문가에게 전달해 주세요.");
  }catch(error){collabFlash(`초대 생성 실패: ${error.message}`,"error");}
}
async function revokeInvitation(button){button.disabled=true;try{await collabApi(`/advisor-invitations/${encodeURIComponent(button.dataset.inviteRevoke)}/revoke`,{method:"POST",body:{}});const refreshed=await loadCollaboration({quiet:true});if(!refreshed)collabFlash("초대는 철회됐지만 목록 새로고침에 실패했습니다.","error");else collabFlash("초대를 철회했습니다.");}catch(error){collabFlash(`초대 철회 실패: ${error.message}`,"error");}finally{button.disabled=false;}}
async function revokeGrant(button){button.disabled=true;try{await collabApi(`/advisor-grants/${encodeURIComponent(button.dataset.grantRevoke)}/revoke`,{method:"POST",body:{metadata:{reason:"business_ui_access_ended"}}});const refreshed=await loadCollaboration({quiet:true});if(!refreshed)collabFlash("접근권한은 종료됐지만 목록 새로고침에 실패했습니다.","error");else collabFlash("외부 전문가의 Case 및 문서 접근을 종료했습니다.");}catch(error){collabFlash(`접근 종료 실패: ${error.message}`,"error");}finally{button.disabled=false;}}
async function copyInvitationLink(){const input=c$("advisor-invite-link");if(!input?.value)return;try{await navigator.clipboard.writeText(input.value);collabFlash("초대 링크를 복사했습니다.");}catch{input.select();document.execCommand("copy");collabFlash("초대 링크를 복사했습니다.");}}

function activateCollaborationView(){const view=c$("view-collaboration");if(!view||view.hidden)return;c$("page-title").textContent="외부 노무전문가 협업";loadCollaboration().catch(()=>{});}
function updatePermissionCopy(){
  const safety=document.querySelector("#view-collaboration .collab-safety");if(safety)safety.innerHTML="외부 전문가는 <b>선택한 Business Case와 그 Case에 올린 검토 문서</b>만 볼 수 있습니다. 직원·급여·조직설정·결제 데이터와 회사 Membership은 제공되지 않습니다.";
  const permission=document.querySelector("#advisor-invite-form .collab-permission");if(permission)permission.innerHTML="초대 권한: <b>Case 열람 · 의견 작성 · 문서 열람 · 문서 검토</b> · 다른 회사 데이터에는 접근할 수 없습니다.";
}
function init(){
  if(collab.initialized)return;collab.initialized=true;updatePermissionCopy();
  c$("business-case-form")?.addEventListener("submit",createCase);c$("advisor-invite-form")?.addEventListener("submit",issueInvitation);c$("advisor-copy-link")?.addEventListener("click",copyInvitationLink);c$("collaboration-refresh")?.addEventListener("click",()=>loadCollaboration());
  document.addEventListener("submit",(event)=>{createBusinessReviewNote(event);handleDocumentCreate(event);handleDocumentUpload(event);});
  document.addEventListener("click",(event)=>{
    const transition=event.target.closest("[data-case-transition]");if(transition)transitionCase(transition);
    const revoke=event.target.closest("[data-invite-revoke]");if(revoke)revokeInvitation(revoke);
    const grantRevoke=event.target.closest("[data-grant-revoke]");if(grantRevoke)revokeGrant(grantRevoke);
    const toggle=event.target.closest("[data-case-notes-toggle]");if(toggle)toggleCaseNotes(toggle.dataset.caseNotesToggle);
    const refresh=event.target.closest("[data-case-notes-refresh]");if(refresh)loadCaseNotes(refresh.dataset.caseNotesRefresh);
    const docsToggle=event.target.closest("[data-case-documents-toggle]");if(docsToggle)toggleCaseDocuments(docsToggle.dataset.caseDocumentsToggle);
    const docsRefresh=event.target.closest("[data-case-documents-refresh]");if(docsRefresh)loadCaseDocuments(docsRefresh.dataset.caseDocumentsRefresh);
    const submit=event.target.closest("[data-document-submit]");if(submit)submitDocumentReview(submit);
  });
  c$("business-nav")?.addEventListener("click",()=>setTimeout(activateCollaborationView,0));c$("org-picker")?.addEventListener("change",()=>setTimeout(()=>{if(!c$("view-collaboration")?.hidden)loadCollaboration();},100));new MutationObserver(activateCollaborationView).observe(c$("view-collaboration"),{attributes:true,attributeFilter:["hidden"]});
}
document.addEventListener("DOMContentLoaded",init);

const COLLAB_API = "/api/saas";
const collab = { csrf: "", orgId: "", cases: [], invitations: [], initialized: false };
const c$ = (id) => document.getElementById(id);
const cEsc = (value) => String(value ?? "").replace(/[&<>'"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const cFmt = (value) => value ? new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)) : "-";

async function collabApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (collab.csrf && !["GET","HEAD"].includes((options.method || "GET").toUpperCase())) headers["x-csrf-token"] = collab.csrf;
  const response = await fetch(`${COLLAB_API}${path}`, { credentials:"same-origin", ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let body = null; try { body = await response.json(); } catch {}
  if (!response.ok) { const error = new Error(body?.error || `http_${response.status}`); error.status=response.status; throw error; }
  return body;
}

function collabFlash(message, kind="ok") {
  const host = c$("collab-flash"); if(!host) return;
  host.textContent=message; host.className=`flash ${kind==="error"?"error":""}`; host.hidden=false;
  clearTimeout(collabFlash.timer); collabFlash.timer=setTimeout(()=>host.hidden=true,4200);
}

function grantExpiryIso(days=30){const date=new Date();date.setUTCDate(date.getUTCDate()+days);return date.toISOString();}
function shareableCases(){return collab.cases.filter(item=>["OPEN","RESOLVED"].includes(item.status));}

function renderCaseSelect(){
  const select=c$("advisor-case-select"); if(!select)return;
  const rows=shareableCases();
  select.innerHTML=`<option value="">공유할 Case 선택</option>${rows.map(item=>`<option value="${cEsc(item.id)}">${cEsc(item.title)} · ${cEsc(item.status)}</option>`).join("")}`;
  c$("advisor-invite-submit").disabled=rows.length===0;
}

function caseActionButtons(item){
  if(item.status==="DRAFT") return `<button class="primary" data-case-transition="OPEN" data-case-id="${cEsc(item.id)}">OPEN으로 시작</button>`;
  if(item.status==="OPEN") return `<button data-case-transition="RESOLVED" data-case-id="${cEsc(item.id)}">해결 처리</button><button class="danger" data-case-transition="ARCHIVED" data-case-id="${cEsc(item.id)}">보관</button>`;
  if(item.status==="RESOLVED") return `<button data-case-transition="OPEN" data-case-id="${cEsc(item.id)}">다시 열기</button><button class="danger" data-case-transition="ARCHIVED" data-case-id="${cEsc(item.id)}">보관</button>`;
  return "";
}

function renderCases(){
  const host=c$("business-case-list"); if(!host)return;
  host.innerHTML=collab.cases.length?collab.cases.map(item=>`<article class="collab-case" data-business-case-id="${cEsc(item.id)}"><div class="collab-case-head"><div><h3>${cEsc(item.title)}</h3><p>${cEsc(item.summary||"요약 없음")}</p></div><span class="collab-chip ${cEsc(item.status)}">${cEsc(item.status)}</span></div><div class="collab-meta"><span class="collab-chip">생성 ${cEsc(cFmt(item.createdAt))}</span>${item.resolvedAt?`<span class="collab-chip">해결 ${cEsc(cFmt(item.resolvedAt))}</span>`:""}</div>${caseActionButtons(item)?`<div class="collab-actions">${caseActionButtons(item)}</div>`:""}</article>`).join(""):`<div class="collab-empty">아직 Business Case가 없습니다. 외부 자문이 필요한 노무 이슈를 먼저 Case로 만들어 주세요.</div>`;
  renderCaseSelect();
}

function renderInvitations(){
  const host=c$("advisor-invitation-list"); if(!host)return;
  host.innerHTML=collab.invitations.length?collab.invitations.map(item=>`<article class="collab-invite" data-advisor-invitation-id="${cEsc(item.id)}"><div class="collab-invite-head"><div><h3>${cEsc(item.advisorEmail)}</h3><p>Case ${cEsc(item.resourceId)}</p></div><span class="collab-chip ${cEsc(item.effectiveStatus)}">${cEsc(item.effectiveStatus)}</span></div><div class="collab-meta"><span class="collab-chip">초대 만료 ${cEsc(cFmt(item.invitationExpiresAt))}</span><span class="collab-chip">접근 만료 ${cEsc(cFmt(item.grantExpiresAt))}</span></div><div class="collab-permission">권한: ${(item.permissions||[]).map(cEsc).join(", ")}</div>${item.effectiveStatus==="PENDING"?`<div class="collab-actions"><button class="danger" data-invite-revoke="${cEsc(item.id)}">초대 철회</button></div>`:""}</article>`).join(""):`<div class="collab-empty">보낸 외부 자문 초대가 없습니다.</div>`;
}

async function ensureCollabSession(){
  const me=await collabApi("/auth/me"); collab.csrf=me.csrf||"";
}

async function loadCollaboration({quiet=false}={}){
  const orgId=c$("org-picker")?.value||""; if(!orgId)return;
  collab.orgId=orgId;
  try{
    await ensureCollabSession();
    const [cases,invitations]=await Promise.all([
      collabApi(`/organizations/${encodeURIComponent(orgId)}/business-cases`),
      collabApi(`/organizations/${encodeURIComponent(orgId)}/advisor-invitations`),
    ]);
    collab.cases=cases.businessCases||[]; collab.invitations=invitations.invitations||[];
    renderCases(); renderInvitations();
  }catch(error){if(!quiet)collabFlash(`협업 정보 조회 실패: ${error.message}`,"error");}
}

async function createCase(event){
  event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
  try{
    const result=await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases`,{method:"POST",body:{title:String(data.get("title")||"").trim(),summary:String(data.get("summary")||"").trim()}});
    form.reset(); collabFlash("Business Case를 만들었습니다. OPEN 상태로 전환하면 외부 전문가에게 공유할 수 있습니다.");
    await loadCollaboration({quiet:true});
    const card=document.querySelector(`[data-business-case-id="${CSS.escape(result.businessCase.id)}"]`); card?.scrollIntoView({behavior:"smooth",block:"center"});
  }catch(error){collabFlash(`Case 생성 실패: ${error.message}`,"error");}
}

async function transitionCase(button){
  const status=button.dataset.caseTransition; const caseId=button.dataset.caseId;
  let resolutionNote="";
  if(status==="RESOLVED") resolutionNote="Business Workspace에서 해결 처리";
  button.disabled=true;
  try{await collabApi(`/business-cases/${encodeURIComponent(caseId)}/status`,{method:"PATCH",body:{status,resolutionNote}});collabFlash(`Case 상태를 ${status}로 변경했습니다.`);await loadCollaboration({quiet:true});}
  catch(error){collabFlash(`Case 상태 변경 실패: ${error.message}`,"error");}
  finally{button.disabled=false;}
}

async function issueInvitation(event){
  event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); const caseId=String(data.get("caseId")||""); const advisorEmail=String(data.get("advisorEmail")||"").trim(); const days=Number(data.get("grantDays")||30);
  if(!caseId||!advisorEmail)return collabFlash("공유할 Case와 전문가 이메일을 입력해 주세요.","error");
  try{
    const result=await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases/${encodeURIComponent(caseId)}/advisor-invitations`,{method:"POST",body:{advisorEmail,permissions:["case.read"],grantExpiresAt:grantExpiryIso(days)}});
    const path=result.invitationFragmentPath||""; const absolute=new URL(path,location.origin).href;
    const box=c$("advisor-invite-link-box"); c$("advisor-invite-link").value=absolute; box.hidden=false;
    form.elements.advisorEmail.value=""; collabFlash("초대를 만들었습니다. 아래 링크는 이번 응답에서만 표시됩니다."); await loadCollaboration({quiet:true});
  }catch(error){collabFlash(`초대 생성 실패: ${error.message}`,"error");}
}

async function revokeInvitation(button){
  button.disabled=true; try{await collabApi(`/advisor-invitations/${encodeURIComponent(button.dataset.inviteRevoke)}/revoke`,{method:"POST",body:{}});collabFlash("초대를 철회했습니다.");await loadCollaboration({quiet:true});}catch(error){collabFlash(`초대 철회 실패: ${error.message}`,"error");}finally{button.disabled=false;}
}

async function copyInvitationLink(){
  const input=c$("advisor-invite-link"); if(!input?.value)return;
  try{await navigator.clipboard.writeText(input.value);collabFlash("초대 링크를 복사했습니다.");}catch{input.select();document.execCommand("copy");collabFlash("초대 링크를 복사했습니다.");}
}

function activateCollaborationView(){
  const view=c$("view-collaboration"); if(!view||view.hidden)return;
  c$("page-title").textContent="외부 노무전문가 협업";
  loadCollaboration().catch(()=>{});
}

function init(){
  if(collab.initialized)return; collab.initialized=true;
  c$("business-case-form")?.addEventListener("submit",createCase);
  c$("advisor-invite-form")?.addEventListener("submit",issueInvitation);
  c$("advisor-copy-link")?.addEventListener("click",copyInvitationLink);
  c$("collaboration-refresh")?.addEventListener("click",()=>loadCollaboration());
  document.addEventListener("click",(event)=>{const transition=event.target.closest("[data-case-transition]");if(transition)transitionCase(transition);const revoke=event.target.closest("[data-invite-revoke]");if(revoke)revokeInvitation(revoke);});
  c$("business-nav")?.addEventListener("click",()=>setTimeout(activateCollaborationView,0));
  c$("org-picker")?.addEventListener("change",()=>setTimeout(()=>{if(!c$("view-collaboration")?.hidden)loadCollaboration();},100));
  new MutationObserver(activateCollaborationView).observe(c$("view-collaboration"),{attributes:true,attributeFilter:["hidden"]});
}

document.addEventListener("DOMContentLoaded",init);

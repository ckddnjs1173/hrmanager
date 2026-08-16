const API = "/api/saas";
const state = { csrf: "", user: null, organizations: [], orgId: "", onboarding: null, profile: null, workplaces: [], scopes: [], employees: [], risks: null, actions: [], magicToken: "" };
const $ = (id) => document.getElementById(id);

function show(id) { for (const name of ["loading-view","disabled-view","login-view","workspace-view"]) $(name).hidden = name !== id; }
function flash(message, kind = "ok") { const el=$("flash"); el.textContent=message; el.className=`flash ${kind === "error" ? "error" : ""}`; el.hidden=false; clearTimeout(flash.timer); flash.timer=setTimeout(()=>el.hidden=true,3600); }
function cleanNumber(value) { return value === "" || value == null ? null : Number(value); }
function text(value) { return value == null || value === "" ? "-" : String(value); }
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (state.csrf && !["GET","HEAD"].includes((options.method || "GET").toUpperCase())) headers["x-csrf-token"] = state.csrf;
  const response = await fetch(`${API}${path}`, { credentials: "same-origin", ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let body = null; try { body = await response.json(); } catch {}
  if (!response.ok) { const error = new Error(body?.error || `http_${response.status}`); error.status=response.status; throw error; }
  return body;
}

function setView(view) {
  for (const section of document.querySelectorAll(".view-section")) section.hidden = section.id !== `view-${view}`;
  for (const button of document.querySelectorAll(".nav-item")) button.classList.toggle("active", button.dataset.view === view);
  const titles={dashboard:"노무 대시보드",risks:"리스크",actions:"조치",people:"직원",setup:"회사 설정"};
  $("page-title").textContent=titles[view]||"인사야 Business";
}

function renderOrganizations() {
  const picker=$("org-picker"); picker.innerHTML="";
  for(const item of state.organizations){const option=document.createElement("option");option.value=item.organization.id;option.textContent=item.organization.display_name||item.organization.legal_name;picker.append(option);}
  picker.value=state.orgId;
}

function renderOnboarding() {
  const o=state.onboarding; if(!o) return;
  const steps=["COMPANY_PROFILE","WORKPLACES","COMPLIANCE_SCOPE","EMPLOYEES","RISK_SCAN","FIRST_ACTION"];
  const labels={COMPANY_PROFILE:"회사정보",WORKPLACES:"사업장",COMPLIANCE_SCOPE:"적용범위",EMPLOYEES:"직원",RISK_SCAN:"Risk Scan",FIRST_ACTION:"첫 조치"};
  const done=new Set(o.completedSteps||[]); const pct=Math.round((steps.filter(s=>done.has(s)).length/steps.length)*100);
  $("onboarding-badge").textContent=o.activated?"활성화 완료":`설정 ${pct}%`; $("onboarding-badge").classList.toggle("done",!!o.activated);
  $("onboarding-progress").innerHTML=`<strong>${pct}% 완료</strong><div class="progress-track"><span style="width:${pct}%"></span></div><div class="milestone-list">${steps.map(s=>`<div class="milestone ${done.has(s)?"done":""}"><span>${done.has(s)?"✓":"○"} ${labels[s]}</span><span>${done.has(s)?"완료":"대기"}</span></div>`).join("")}</div>`;
}

function renderRiskCard(finding) {
  return `<article class="risk-card"><div class="row"><div><div><span class="pill ${finding.severity}">${finding.severity}</span> <span class="pill ${finding.applicability}">${finding.applicability==="UNCERTAIN"?"확인 필요":"위험 감지"}</span></div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.explanation)}</p>${finding.missingFacts?.length?`<p><b>필요 정보:</b> ${finding.missingFacts.map(escapeHtml).join(", ")}</p>`:""}</div>${finding.actionId?`<span class="status-badge">조치 ${escapeHtml(finding.actionStatus)}</span>`:""}</div></article>`;
}
function renderRisks(){const findings=state.risks?.findings||[];$("risk-list").innerHTML=findings.length?findings.map(renderRiskCard).join(""):`<div class="empty-state">활성 리스크가 없습니다.</div>`;$("dashboard-findings").innerHTML=findings.length?findings.slice(0,4).map(renderRiskCard).join(""):`<div class="empty-state">현재 표시할 리스크가 없습니다.</div>`;const s=state.risks?.summary||{};$("metric-critical").textContent=s.CRITICAL||0;$("metric-high").textContent=s.HIGH||0;$("metric-uncertain").textContent=s.uncertain||0;}

function actionButtons(action){if(action.status==="OPEN")return `<button data-action-status="IN_PROGRESS" data-action-id="${action.id}" class="primary-action">시작</button><button data-action-status="DISMISSED" data-action-id="${action.id}">제외</button>`;if(action.status==="IN_PROGRESS")return `<button data-action-status="DONE" data-action-id="${action.id}" class="primary-action">완료</button><button data-action-status="BLOCKED" data-action-id="${action.id}">보류</button>`;if(["DONE","DISMISSED","BLOCKED"].includes(action.status))return `<button data-action-status="OPEN" data-action-id="${action.id}">다시 열기</button>`;return "";}
function renderActions(){const active=state.actions.filter(a=>!["DONE","DISMISSED"].includes(a.status));$("metric-actions").textContent=active.length;$("action-list").innerHTML=state.actions.length?state.actions.map(a=>`<article class="action-card"><div class="row"><div><span class="pill ${a.priority}">${escapeHtml(a.priority)}</span><h3>${escapeHtml(a.title)}</h3><p>상태: <b>${escapeHtml(a.status)}</b>${a.dueAt?` · 기한 ${escapeHtml(String(a.dueAt).slice(0,10))}`:""}</p></div></div><div class="action-controls">${actionButtons(a)}</div></article>`).join(""):`<div class="empty-state">진행할 조치가 없습니다.</div>`;const first=active[0];$("priority-action").innerHTML=first?`<div class="action-card"><span class="pill ${first.priority}">${escapeHtml(first.priority)}</span><h3>${escapeHtml(first.title)}</h3><p>${escapeHtml(first.status)}</p><div class="action-controls">${actionButtons(first)}</div></div>`:`<div class="empty-state">현재 우선 조치가 없습니다.</div>`;}

function renderEmployees(){const rows=state.employees;$("employee-list").innerHTML=rows.length?`<table class="data-table"><thead><tr><th>사번</th><th>이름</th><th>입사일</th><th>근로시간</th><th>임금형태</th><th>기준임금</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${escapeHtml(e.employeeNumber)}</td><td><b>${escapeHtml(e.displayName)}</b></td><td>${escapeHtml(e.employment?.hireDate||"-")}</td><td>${escapeHtml(e.employment?.weeklyContractHours??"-")}</td><td>${escapeHtml(e.employment?.wageType||"-")}</td><td>${e.employment?.baseWage==null?"-":Number(e.employment.baseWage).toLocaleString("ko-KR")+"원"}</td></tr>`).join("")}</tbody></table>`:`<div class="empty-state">등록된 직원이 없습니다.</div>`;const select=$("employee-workplace");select.innerHTML=`<option value="">미지정</option>${state.workplaces.map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("")}`;}
function renderSetup(){const p=state.profile||{};const form=$("profile-form");for(const name of ["industryCode","payday","defaultWeeklyHours","wageSystem"]){if(form.elements[name])form.elements[name].value=p[name]??"";}$("workplace-summary").innerHTML=state.workplaces.map(w=>`<div class="mini-item">${escapeHtml(w.name)} · ${escapeHtml(w.code)}</div>`).join("")||`<div class="helper">사업장을 추가해 주세요.</div>`;$("scope-summary").innerHTML=state.scopes.map(s=>`<div class="mini-item">${escapeHtml(s.name)} · ${s.status==="UNCERTAIN"?"확인 필요":"확인됨"}</div>`).join("")||`<div class="helper">적용범위를 추가해 주세요.</div>`;}
function renderAll(){renderOrganizations();renderOnboarding();renderRisks();renderActions();renderEmployees();renderSetup();$("current-user").textContent=state.user?.email||"";}

async function loadOrg(orgId){state.orgId=orgId;localStorage.setItem("insaya_business_org",orgId);const [onboarding,profile,workplaces,scopes,employees,risks,actions]=await Promise.all([api(`/organizations/${orgId}/onboarding`),api(`/organizations/${orgId}/business-profile`),api(`/organizations/${orgId}/workplaces`),api(`/organizations/${orgId}/compliance-scopes`),api(`/organizations/${orgId}/employees`),api(`/organizations/${orgId}/risks`),api(`/organizations/${orgId}/actions`)]);state.onboarding=onboarding;state.profile=profile.profile;state.workplaces=workplaces.workplaces||[];state.scopes=scopes.scopes||[];state.employees=employees.employees||[];state.risks=risks;state.actions=actions.actions||[];renderAll();}
async function loadOrganizations(){const data=await api("/organizations");state.organizations=data.organizations||[];if(!state.organizations.length){renderOrganizations();$("org-dialog").showModal();return;}const saved=localStorage.getItem("insaya_business_org");const found=state.organizations.find(x=>x.organization.id===saved);await loadOrg((found||state.organizations[0]).organization.id);}

async function bootstrap(){show("loading-view");try{const me=await api("/auth/me");state.user=me.user;state.csrf=me.csrf;show("workspace-view");await loadOrganizations();}catch(error){if(error.status===404){show("disabled-view");return;}if(error.status===401){show("login-view");return;}show("disabled-view");}}

$("login-form").addEventListener("submit",async(e)=>{e.preventDefault();try{const result=await api("/auth/magic-link",{method:"POST",body:{email:$("login-email").value}});if(result.debugToken){state.magicToken=result.debugToken;$("magic-token-box").hidden=false;}else $("login-help").textContent="이메일로 전송된 로그인 링크를 확인해 주세요.";}catch(error){$("login-help").textContent=error.message==="magic_link_delivery_not_configured"?"이 환경에는 이메일 로그인이 아직 연결되지 않았습니다.":`로그인 요청 실패: ${error.message}`;}});
$("verify-magic").addEventListener("click",async()=>{try{const result=await api("/auth/magic-link/verify",{method:"POST",body:{token:state.magicToken}});state.user=result.user;state.csrf=result.csrf;show("workspace-view");await loadOrganizations();}catch(error){flash(`로그인 실패: ${error.message}`,"error");}});
$("logout-button").addEventListener("click",async()=>{try{await api("/auth/logout",{method:"POST",body:{}});}finally{state.csrf="";state.user=null;show("login-view");}});
$("org-picker").addEventListener("change",e=>loadOrg(e.target.value).catch(err=>flash(err.message,"error")));
$("new-org-button").addEventListener("click",()=>$("org-dialog").showModal());$("close-org-dialog").addEventListener("click",()=>$("org-dialog").close());
$("org-form").addEventListener("submit",async(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{const created=await api("/organizations",{method:"POST",body:{type:"BUSINESS",legalName:fd.get("legalName"),displayName:fd.get("displayName")}});$("org-dialog").close();await loadOrganizations();await loadOrg(created.organization.id);flash("회사를 만들었습니다.");}catch(error){flash(error.message,"error");}});
for(const button of document.querySelectorAll(".nav-item"))button.addEventListener("click",()=>setView(button.dataset.view));for(const button of document.querySelectorAll("[data-jump]"))button.addEventListener("click",()=>setView(button.dataset.jump));
$("risk-scan-button").addEventListener("click",async()=>{if(!state.orgId)return;const button=$("risk-scan-button");button.disabled=true;button.textContent="분석 중";try{await api(`/organizations/${state.orgId}/risk-scan`,{method:"POST",body:{triggerType:"MANUAL"}});await loadOrg(state.orgId);flash("Risk Scan을 완료했습니다.");}catch(error){flash(`Risk Scan 실패: ${error.message}`,"error");}finally{button.disabled=false;button.textContent="Risk Scan";}});

document.addEventListener("click",async(e)=>{const button=e.target.closest("[data-action-status]");if(!button)return;let blockedReason="",dismissedReason="";if(button.dataset.actionStatus==="BLOCKED")blockedReason=prompt("보류 사유를 입력해 주세요.")||"";if(button.dataset.actionStatus==="DISMISSED")dismissedReason=prompt("제외 사유를 입력해 주세요.")||"";if((button.dataset.actionStatus==="BLOCKED"&&!blockedReason)||(button.dataset.actionStatus==="DISMISSED"&&!dismissedReason))return;try{const result=await api(`/organizations/${state.orgId}/actions/${button.dataset.actionId}/status`,{method:"PATCH",body:{status:button.dataset.actionStatus,blockedReason,dismissedReason}});await loadOrg(state.orgId);flash(result.requiresRiskReevaluation?"조치를 완료했습니다. 다음 Risk Scan에서 실제 해소 여부를 다시 확인합니다.":"조치 상태를 변경했습니다.");}catch(error){flash(error.message,"error");}});

$("show-employee-form").addEventListener("click",()=>$("employee-form").hidden=!$("employee-form").hidden);
$("employee-form").addEventListener("submit",async(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/organizations/${state.orgId}/employees`,{method:"POST",body:{displayName:fd.get("displayName"),employeeNumber:fd.get("employeeNumber")||undefined,hireDate:fd.get("hireDate"),workplaceId:fd.get("workplaceId")||undefined,weeklyContractHours:cleanNumber(fd.get("weeklyContractHours")),wageType:fd.get("wageType")||undefined,baseWage:cleanNumber(fd.get("baseWage"))}});e.currentTarget.reset();e.currentTarget.hidden=true;await loadOrg(state.orgId);flash("직원을 추가했습니다.");}catch(error){flash(error.message,"error");}});
$("profile-form").addEventListener("submit",async(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const profile={};for(const key of ["industryCode","wageSystem"]){if(fd.get(key))profile[key]=fd.get(key);}for(const key of ["payday","defaultWeeklyHours"]){if(fd.get(key)!=="")profile[key]=cleanNumber(fd.get(key));}try{await api(`/organizations/${state.orgId}/business-profile`,{method:"PUT",body:{profile}});await loadOrg(state.orgId);flash("회사정보를 저장했습니다.");}catch(error){flash(error.message,"error");}});
$("workplace-form").addEventListener("submit",async(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/organizations/${state.orgId}/workplaces`,{method:"POST",body:{name:fd.get("name"),openedAt:fd.get("openedAt")||undefined}});e.currentTarget.reset();await loadOrg(state.orgId);flash("사업장을 추가했습니다.");}catch(error){flash(error.message,"error");}});
$("scope-form").addEventListener("submit",async(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/organizations/${state.orgId}/compliance-scopes`,{method:"POST",body:{name:fd.get("name"),status:fd.get("status"),basis:fd.get("basis")||"",workplaceIds:state.workplaces.map(w=>w.id)}});e.currentTarget.reset();await loadOrg(state.orgId);flash("법률 적용범위를 저장했습니다.");}catch(error){flash(error.message,"error");}});

bootstrap();
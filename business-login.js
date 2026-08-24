const title=document.getElementById("title");
const message=document.getElementById("message");
const state=document.getElementById("state");
const fallback=document.getElementById("fallback");
const home=document.getElementById("home");

const ERROR_COPY={
  unauthorized:"로그인 정보가 유효하지 않습니다. 새 로그인 링크를 요청해 주세요.",
  forbidden:"이 초대 또는 계정으로는 접근할 수 없습니다.",
  invitation_expired:"초대가 만료되었습니다. 회사 담당자에게 새 초대를 요청해 주세요.",
  invitation_revoked:"회사가 이 초대를 취소했습니다. 새 초대가 필요합니다.",
  too_many_requests:"요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  csrf_invalid:"보안 확인 시간이 만료되었습니다. 새 로그인 링크를 이용해 주세요.",
  internal_error:"일시적인 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  network_error:"서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
};

function friendly(value){
  const text=String(value||"").trim();
  if(ERROR_COPY[text])return ERROR_COPY[text];
  if(/failed to fetch|networkerror|load failed/i.test(text))return ERROR_COPY.network_error;
  if(/^http_401$/i.test(text))return ERROR_COPY.unauthorized;
  if(/^http_403$/i.test(text))return ERROR_COPY.forbidden;
  if(/^http_429$/i.test(text))return ERROR_COPY.too_many_requests;
  if(/^http_5\d\d$/i.test(text))return ERROR_COPY.internal_error;
  if(/^[a-z0-9_]+$/i.test(text))return "로그인 링크를 처리하지 못했습니다. 새 링크를 요청해 주세요.";
  return text||"로그인 링크를 처리하지 못했습니다. 새 링크를 요청해 주세요.";
}
function setState(kind,heading,text){
  title.textContent=heading;
  message.textContent=text;
  state.dataset.kind=kind;
  state.setAttribute("role",kind==="error"?"alert":"status");
  state.setAttribute("aria-live",kind==="error"?"assertive":"polite");
  state.setAttribute("aria-busy",kind==="loading"?"true":"false");
  title.focus({preventScroll:true});
}
function fail(text){
  setState("error","링크를 사용할 수 없습니다.",friendly(text));
  fallback.hidden=false;
  home.hidden=false;
}
function success(heading,text){setState("success",heading,text);}
function safeReturnTo(value){return value==="/advisor.html"?"/advisor.html":"/business.html";}
async function json(response){let body=null;try{body=await response.json();}catch{}return body;}
async function request(path,options){
  try{return await fetch(path,options);}catch(error){throw new Error("network_error",{cause:error});}
}

async function requestOrganizationInviteLogin(token){
  try{
    const response=await request("/api/saas/invitations/magic-link",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
    const body=await json(response);if(!response.ok)throw new Error(body?.error||`http_${response.status}`);
    success("로그인 링크를 보냈습니다.","초대받은 이메일을 확인해 주세요. 새 로그인 링크를 누르면 회사 초대 수락까지 이어집니다.");
    fallback.hidden=true;
    home.hidden=false;
  }catch(error){fail(error.message);}
}

async function acceptOrganizationInvite(token,csrf){
  const response=await request("/api/saas/invitations/accept",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({token})});
  const body=await json(response);if(!response.ok)throw new Error(body?.error||`http_${response.status}`);return body;
}

async function verify(){
  const params=new URLSearchParams(location.hash.replace(/^#/,""));
  const magic=String(params.get("magic")||"").trim();
  const returnTo=safeReturnTo(String(params.get("return")||""));
  const advisorInvite=String(params.get("invite")||"").trim();
  const organizationInvite=String(params.get("orgInvite")||"").trim();
  if(location.hash)history.replaceState(null,"",`${location.pathname}${location.search}`);

  if(!magic){
    if(organizationInvite)return requestOrganizationInviteLogin(organizationInvite);
    return fail("로그인 토큰이 없거나 이미 제거된 링크입니다. Business 로그인 화면에서 새 링크를 요청해 주세요.");
  }

  try{
    const response=await request("/api/saas/auth/magic-link/verify",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({token:magic})});
    const body=await json(response);if(!response.ok)throw new Error(body?.error||`http_${response.status}`);
    if(organizationInvite)await acceptOrganizationInvite(organizationInvite,body.csrf);
    success(organizationInvite?"초대를 수락했습니다.":"로그인되었습니다.",returnTo==="/advisor.html"?"외부 자문 포털로 이동합니다.":"Business Workspace로 이동합니다.");
    if(returnTo==="/advisor.html"&&advisorInvite){
      location.replace(`/advisor.html#invite=${encodeURIComponent(advisorInvite)}`);
      return;
    }
    location.replace(returnTo);
  }catch(error){fail(error.message);}
}

window.addEventListener("offline",()=>fail("network_error"));
document.addEventListener("DOMContentLoaded",verify);

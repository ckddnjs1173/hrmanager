const title=document.getElementById("title");
const message=document.getElementById("message");
const fallback=document.getElementById("fallback");

function fail(text){title.textContent="링크를 사용할 수 없습니다.";message.textContent=text;fallback.hidden=false;}
function safeReturnTo(value){return value==="/advisor.html"?"/advisor.html":"/business.html";}
async function json(response){let body=null;try{body=await response.json();}catch{}return body;}

async function requestOrganizationInviteLogin(token){
  try{
    const response=await fetch("/api/saas/invitations/magic-link",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
    const body=await json(response);if(!response.ok)throw new Error(body?.error||`http_${response.status}`);
    title.textContent="로그인 링크를 보냈습니다.";
    message.textContent="초대받은 이메일을 확인해 주세요. 새 로그인 링크를 누르면 회사 초대 수락까지 이어집니다.";
    fallback.hidden=true;
  }catch(error){fail(`초대를 확인할 수 없거나 만료되었습니다. (${error.message})`);}
}

async function acceptOrganizationInvite(token,csrf){
  const response=await fetch("/api/saas/invitations/accept",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({token})});
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
    const response=await fetch("/api/saas/auth/magic-link/verify",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({token:magic})});
    const body=await json(response);if(!response.ok)throw new Error(body?.error||`http_${response.status}`);
    if(organizationInvite)await acceptOrganizationInvite(organizationInvite,body.csrf);
    title.textContent=organizationInvite?"초대를 수락했습니다.":"로그인되었습니다.";
    message.textContent=returnTo==="/advisor.html"?"외부 자문 포털로 이동합니다.":"Business Workspace로 이동합니다.";
    if(returnTo==="/advisor.html"&&advisorInvite){
      location.replace(`/advisor.html#invite=${encodeURIComponent(advisorInvite)}`);
      return;
    }
    location.replace(returnTo);
  }catch(error){fail(`링크가 만료되었거나 이미 사용되었습니다. (${error.message})`);}
}

document.addEventListener("DOMContentLoaded",verify);

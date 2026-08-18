const title=document.getElementById("title");
const message=document.getElementById("message");
const fallback=document.getElementById("fallback");

function fail(text){title.textContent="로그인 링크를 사용할 수 없습니다.";message.textContent=text;fallback.hidden=false;}

async function verify(){
  const params=new URLSearchParams(location.hash.replace(/^#/,""));
  const token=String(params.get("magic")||"").trim();
  if(location.hash)history.replaceState(null,"",`${location.pathname}${location.search}`);
  if(!token)return fail("로그인 토큰이 없거나 이미 제거된 링크입니다. Business 로그인 화면에서 새 링크를 요청해 주세요.");
  try{
    const response=await fetch("/api/saas/auth/magic-link/verify",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
    let body=null;try{body=await response.json();}catch{}
    if(!response.ok)throw new Error(body?.error||`http_${response.status}`);
    title.textContent="로그인되었습니다.";message.textContent="Business Workspace로 이동합니다.";
    location.replace("/business.html");
  }catch(error){fail(`링크가 만료되었거나 이미 사용되었습니다. (${error.message})`);}
}

document.addEventListener("DOMContentLoaded",verify);

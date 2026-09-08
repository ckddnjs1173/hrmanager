(() => {
  function callGlobal(name,...args){
    try{const fn=window[name];if(typeof fn==="function")return fn(...args);}catch{}
    return undefined;
  }

  function normalizeTopBrand(){
    const logo=document.querySelector(".gn-logo");
    const image=logo?.querySelector("img");
    if(!logo||!image||logo.querySelector("[data-ui-brand-word]"))return;
    // Text inside an externally loaded SVG does not inherit the document webfont and can
    // render as tofu on Linux/Chromium. Keep the SVG purely pictorial and render Korean
    // branding as real HTML so the local Pretendard font is authoritative everywhere.
    image.src="/assets/brand/favicon.svg";
    image.alt="";
    image.setAttribute("aria-hidden","true");
    image.style.width="24px";image.style.height="24px";image.style.flex="0 0 24px";
    logo.style.display="inline-flex";logo.style.alignItems="center";logo.style.gap="6px";
    const word=document.createElement("span");word.dataset.uiBrandWord="1";word.setAttribute("aria-hidden","true");
    word.style.cssText="display:inline-flex;align-items:baseline;font-size:14px;font-weight:850;letter-spacing:-.04em;color:#18181f;white-space:nowrap";
    word.innerHTML='<span>인사</span><span style="color:#5b4bff">야</span>';
    const sub=document.createElement("span");sub.dataset.uiBrandSub="1";sub.setAttribute("aria-hidden","true");
    sub.textContent="노무 AI";sub.style.cssText="font-size:9px;font-weight:700;color:#9a97a2;white-space:nowrap";
    logo.append(word,sub);
  }

  function enhanceHome(){
    const greeting=document.getElementById("greeting");
    if(!greeting||greeting.dataset.uiV2)return;
    greeting.dataset.uiV2="1";
    greeting.classList.add('ia-home');
    document.getElementById('homeAiShortcut')?.addEventListener('click',()=>{
      callGlobal('openComposer');
      const input=document.getElementById('composerInput');
      input?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
  }

  function addStepper(){
    const home=document.getElementById("home");const prog=document.getElementById("prog");
    if(!home||!prog||document.querySelector(".ui-chat-stepper"))return;
    const stepper=document.createElement("div");stepper.className="ui-chat-stepper";stepper.setAttribute("aria-label","상담 진행 단계");
    stepper.innerHTML='<div class="ui-step">문제 선택</div><div class="ui-step">상황 입력</div><div class="ui-step">핵심 사실 확인</div>';
    prog.after(stepper);
    const sync=()=>{const count=Math.max(home.classList.contains("chatting")?1:0,prog.querySelectorAll("i.on").length);[...stepper.children].forEach((node,index)=>node.classList.toggle("on",index<Math.min(3,count||1)));};
    new MutationObserver(sync).observe(prog,{childList:true,subtree:true,attributes:true});
    new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:["class"]});sync();
  }

  function normalizeText(){
    const map=[["AI 상황 진단 결과","분석 결과"],["상담 요약서","핵심 사실 요약"],["노동청 진정 절차","공식 절차 안내"]];
    document.querySelectorAll("h1,h2").forEach((node)=>{for(const [from,to] of map){if(node.textContent.trim()===from)node.textContent=to;}});
  }

  function init(){document.body.classList.add("ui-v2");normalizeTopBrand();enhanceHome();addStepper();normalizeText();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

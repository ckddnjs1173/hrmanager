(() => {
  const svg=(paths)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const icons={
    wage:svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9.5v5M18 9.5v5"/>'),
    fire:svg('<circle cx="12" cy="8" r="3.3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18 4l3 3m0-3-3 3"/>'),
    severance:svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    holiday:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/>'),
    harass:svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.5L3 21l1.9-5.9A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 9.5h5M9.5 13h3"/>'),
    overview:svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/>'),
    facts:svg('<path d="M7 3h10v18H7z"/><path d="m9.5 9 1.5 1.5L14.5 7M9.5 15h5"/>'),
    money:svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.3"/>'),
    evidence:svg('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h4"/>'),
    action:svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8.5"/>'),
    docs:svg('<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v5h5M9 13h6M9 17h5"/>'),
    law:svg('<path d="M12 3v18M8.5 21h7M4 8l8-3 8 3"/><path d="M4 8 2 12a4 4 0 0 0 4 0L4 8zm16 0-2 4a4 4 0 0 0 4 0l-2-4z"/>'),
  };

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

  const railItems=[
    ["result","개요","overview"],["summary","사실","facts"],["calc","금액","money"],["report","증거","evidence"],["official","행동","action"],["docs","문서","docs"],["solve","근거","law"],
  ];
  function addCaseRails(){
    for(const [screenId] of railItems){
      const screen=document.getElementById(screenId);if(!screen||screen.querySelector(":scope > .ui-case-rail"))continue;
      const wrap=screen.querySelector(":scope > .wrap");if(!wrap)continue;
      screen.classList.add("ui-case-screen");
      const rail=document.createElement("nav");rail.className="ui-case-rail";rail.setAttribute("aria-label","사건 분석 메뉴");
      rail.innerHTML=`<div class="rail-title">내 사건</div>${railItems.map(([id,label,icon])=>`<button type="button" class="${id===screenId?"on":""}" data-ui-rail="${id}">${icons[icon]}<span>${label}</span></button>`).join("")}`;
      screen.insertBefore(rail,wrap);rail.addEventListener("click",(event)=>{const button=event.target.closest("[data-ui-rail]");if(button)callGlobal("nav",button.dataset.uiRail);});
    }
  }

  function normalizeText(){
    const map=[["AI 상황 진단 결과","분석 결과"],["상담 요약서","핵심 사실 요약"],["노동청 진정 절차","공식 절차 안내"]];
    document.querySelectorAll("h1,h2").forEach((node)=>{for(const [from,to] of map){if(node.textContent.trim()===from)node.textContent=to;}});
  }

  function init(){document.body.classList.add("ui-v2");normalizeTopBrand();enhanceHome();addStepper();addCaseRails();normalizeText();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

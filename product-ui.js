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

  function enhanceHome(){
    const greeting=document.getElementById("greeting");
    if(!greeting||greeting.dataset.uiV2)return;
    greeting.dataset.uiV2="1";
    const oldPreview=greeting.querySelector(".hero-demo");if(oldPreview)oldPreview.style.display="none";
    const eyebrow=greeting.querySelector(".hero-eb");
    const heading=greeting.querySelector(".hero-h");
    const lead=greeting.querySelector(".lead");
    if(eyebrow&&heading&&lead){
      eyebrow.textContent="AI 노무상담 · 계산 · 증거 · 다음 행동";
      heading.innerHTML="노동문제, 어디서부터<br>해야 할지 모르겠다면<br>상황부터 정리해 드릴게요.";
      lead.textContent="AI가 내 상황을 분석하고, 확인해야 할 권리와 예상 금액, 준비할 증거와 다음 행동까지 순서대로 안내합니다.";
      const copy=document.createElement("div");copy.className="ui-hero-copy";
      greeting.insertBefore(copy,greeting.firstChild);copy.append(eyebrow,heading,lead);
      const start=document.createElement("button");start.type="button";start.className="ui-hero-start";start.innerHTML='내 문제 시작하기 <span aria-hidden="true">→</span>';
      start.addEventListener("click",()=>{const input=document.getElementById("composerInput");input?.scrollIntoView({behavior:"smooth",block:"center"});input?.focus();});
      copy.append(start);
    }

    const visual=document.createElement("div");visual.className="ui-hero-visual";visual.setAttribute("aria-hidden","true");
    visual.innerHTML='<div class="person"></div><div class="phone"></div><span class="ui-float f1">'+icons.facts+'</span><span class="ui-float f2">'+icons.money+'</span><span class="ui-float f3">'+icons.docs+'</span><span class="ui-float f4">'+icons.action+'</span>';
    greeting.querySelector(".ui-hero-copy")?.after(visual);

    const problems=document.createElement("section");problems.className="ui-problems";problems.setAttribute("aria-label","자주 발생하는 노동문제");
    const items=[
      ["wage","임금체불","못 받은 임금을 먼저 확인해요"],
      ["fire","해고·권고사직","절차와 구제수단을 확인해요"],
      ["severance","퇴직금","지급요건과 예상액을 확인해요"],
      ["holiday","근로시간·수당","연장·주휴 등 수당을 확인해요"],
      ["harass","직장 내 괴롭힘","증거와 대응 순서를 정리해요"],
    ];
    problems.innerHTML=`<div class="ui-problems-head"><strong>자주 발생하는 노동문제</strong><span>선택하면 바로 상황 확인을 시작합니다.</span></div><div class="ui-problem-grid">${items.map(([key,title,desc])=>`<button type="button" class="ui-problem" data-ui-problem="${key}"><span class="ic">${icons[key]}</span><b>${title}</b><small>${desc}</small></button>`).join("")}</div>`;
    visual.after(problems);
    problems.addEventListener("click",(event)=>{const button=event.target.closest("[data-ui-problem]");if(button)callGlobal("startCase",button.dataset.uiProblem);});

    const label=greeting.querySelector(".he-label");const entries=greeting.querySelector(".home-entry");
    if(label&&entries){
      label.textContent="다른 기능 바로가기";
      const tools=document.createElement("div");tools.className="ui-tools-wrap";tools.style.gridArea="tools";tools.style.width="100%";
      label.before(tools);tools.append(label,entries);label.style.gridArea="auto";entries.style.gridArea="auto";entries.style.marginTop="8px";
    }
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

  function init(){document.body.classList.add("ui-v2");enhanceHome();addStepper();addCaseRails();normalizeText();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

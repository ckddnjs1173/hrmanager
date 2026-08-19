(() => {
  const svg=(path)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const navIcons={
    dashboard:"M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
    risks:"M12 3 2.8 20h18.4L12 3zm0 6v5m0 3h.01",
    actions:"M9 11l2 2 4-4 M5 4h14v16H5z",
    calendar:"M5 4v3m14-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1z",
    notifications:"M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4L6 17zm4 3h4",
    people:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-6 9a6 6 0 0 1 12 0m3-9a3 3 0 1 0 0-6m-1 9a5 5 0 0 1 4 5",
    collaboration:"M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a6 6 0 0 1 12 0m-4 0a6 6 0 0 1 12 0",
    setup:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4 2-1-2-4-2 .5-1.5-1.5.5-2-4-2-1 2-2 .5-1.5 1.5-2-.5-2 4 2 1-2 4 2 .5 1.5 1.5z",
  };
  const labels={
    CRITICAL:"매우 높음",HIGH:"높음",MEDIUM:"보통",LOW:"낮음",INFO:"안내",
    UNCERTAIN:"확인 필요",APPLICABLE:"적용",NOT_APPLICABLE:"미적용",
    OPEN:"대기",IN_PROGRESS:"진행 중",DONE:"완료",BLOCKED:"보류",DISMISSED:"제외",
    OVERDUE:"기한 지남",DUE_TODAY:"오늘",NEXT_7_DAYS:"7일 이내",SCHEDULED:"예정",
    PENDING:"대기",ACTIVE:"접근 중",REVOKED:"종료",EXPIRED:"만료",ACCEPTED:"수락 완료",
    DRAFT:"초안",IN_REVIEW:"검토 중",CHANGES_REQUESTED:"수정 필요",APPROVED:"검토 완료",
  };
  const rawPattern=new RegExp(`\\b(${Object.keys(labels).join("|")})\\b`,"g");

  function addIcons(){
    document.querySelectorAll("#business-nav .nav-item[data-view]").forEach((button)=>{
      if(button.querySelector(".ui-nav-icon"))return;
      const path=navIcons[button.dataset.view];if(!path)return;
      const icon=document.createElement("span");icon.className="ui-nav-icon";icon.innerHTML=svg(path);button.prepend(icon);
    });
  }

  function translateNode(node){
    if(node.nodeType===Node.TEXT_NODE){
      const old=node.nodeValue||"";const next=old.replace(rawPattern,(key)=>labels[key]||key);if(next!==old)node.nodeValue=next;return;
    }
    if(!(node instanceof Element))return;
    if(node.matches("script,style,option,input,textarea"))return;
    if(node.children.length===0){
      const old=node.textContent||"";const trimmed=old.trim();
      if(labels[trimmed])node.textContent=old.replace(trimmed,labels[trimmed]);
      else if(rawPattern.test(old)){rawPattern.lastIndex=0;node.textContent=old.replace(rawPattern,(key)=>labels[key]||key);}
      rawPattern.lastIndex=0;
      return;
    }
    for(const child of node.childNodes)translateNode(child);
  }

  let queued=false;
  function refresh(){queued=false;addIcons();
    for(const id of ["workspace-view","flash","collab-flash"]){const root=document.getElementById(id);if(root)translateNode(root);}
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(refresh);}
  function init(){addIcons();refresh();const root=document.getElementById("business-app");if(root)new MutationObserver(schedule).observe(root,{subtree:true,childList:true,characterData:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

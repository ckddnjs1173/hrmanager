(() => {
  function init() {
    if (document.querySelector('.global-navigation')) return;
    const header = document.createElement('header');
    header.className = 'global-navigation';
    header.innerHTML = `<a class="global-brand" href="/" aria-label="인사야 홈">인사<span>야</span></a>
      <nav id="global-links" aria-label="주 메뉴">
        <a href="/worker.html">근로자</a><a href="/employer.html">사업주</a>
        <a href="/tools.html">노동생활 도구</a><a href="/#nomu">노무사 찾기</a>
      </nav><a class="global-ai" href="/#consult">AI 상담</a>
      <button class="global-toggle" type="button" aria-controls="global-links" aria-expanded="false" aria-label="메뉴 열기">☰</button>`;
    const old = document.querySelector('.topnav');
    if (old) old.replaceWith(header); else document.body.prepend(header);
    const toggle = header.querySelector('button');
    const close = () => {header.classList.remove('menu-open'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','메뉴 열기');};
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    header.addEventListener('keydown', event => {if(event.key === 'Escape'){close();toggle.focus();}});
    document.addEventListener('click', event => {if(!header.contains(event.target)) close();});
    header.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
    const syncCurrent = () => {
      let target = location.pathname;
      if(target==='/'||target==='/index.html'){
        const screen=document.querySelector('.screen.active')?.id;
        target=screen==='nomu'?'/#nomu':screen==='worker'?'/worker.html':screen==='employer'?'/employer.html':screen==='home'?'/#consult':'/tools.html';
      } else if(/-intake(?:\.html)?$/.test(target)) target='/worker.html';
      else if(/^\/business/.test(target)) target='/employer.html';
      header.querySelectorAll('a').forEach(link => {
        if(link.getAttribute('href')===target&&target!=='/')link.setAttribute('aria-current','page');
        else link.removeAttribute('aria-current');
      });
    };
    window.addEventListener('hashchange',syncCurrent);
    window.addEventListener('insaya:navigation',syncCurrent);
    syncCurrent();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();

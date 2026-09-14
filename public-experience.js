(() => {
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function focusComposer() {
    const input = document.getElementById('composerInput');
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  function enhanceHome() {
    const home = document.getElementById('home');
    const greeting = document.getElementById('greeting');
    const composer = home && home.querySelector('.composer');
    if (!home || !greeting || !composer || home.dataset.experienceV2 === 'true') return;
    home.dataset.experienceV2 = 'true';

    const hero = greeting.querySelector('.ia-home-hero');
    const start = greeting.querySelector('.ui-hero-start');
    if (start) start.addEventListener('click', focusComposer);

    if (hero && !hero.querySelector('.ia-home-flow')) {
      const flow = document.createElement('div');
      flow.className = 'ia-home-flow';
      flow.setAttribute('aria-label', 'AI 상담 진행 방식');
      flow.innerHTML = `
        <div><span>1</span><b>상황 정리</b><small>한 문장으로 시작</small></div>
        <i aria-hidden="true">→</i>
        <div><span>2</span><b>기준 확인</b><small>금액·절차·쟁점 확인</small></div>
        <i aria-hidden="true">→</i>
        <div><span>3</span><b>다음 행동</b><small>계산·문서·전문가 연결</small></div>`;
      hero.append(flow);
    }

    if (!composer.querySelector('.ia-composer-head')) {
      const head = document.createElement('div');
      head.className = 'ia-composer-head';
      head.innerHTML = '<b>무슨 일이 있었나요?</b><span>민감정보 없이 핵심 상황만 적어도 됩니다.</span>';
      composer.prepend(head);
    }

    const sections = Array.from(greeting.children).filter(node => node.classList && node.classList.contains('ia-home-section'));
    if (sections.length && !home.querySelector('.ia-home-after')) {
      const after = document.createElement('div');
      after.className = 'ia-home-after';
      composer.after(after);
      sections.forEach((section, index) => {
        section.classList.add(`ia-home-section-${index + 1}`);
        after.append(section);
      });
    }
  }

  function enhanceDirectory() {
    const section = document.getElementById('nomu');
    if (!section || section.dataset.experienceV2 === 'true') return;
    const wrap = section.querySelector('.wrap.wide');
    const cats = section.querySelector('.ia-nomu-cats');
    const search = section.querySelector('.nomu-search');
    const filters = document.getElementById('nomuFields');
    const count = document.getElementById('nomuCount');
    const list = document.getElementById('nomuList');
    if (!wrap || !cats || !search || !filters || !count || !list) return;
    section.dataset.experienceV2 = 'true';

    const sub = wrap.querySelector('p.sub');
    if (sub && !wrap.querySelector('.ia-directory-intro')) {
      const intro = document.createElement('div');
      intro.className = 'ia-directory-intro';
      intro.innerHTML = `
        <div><b>조건으로 좁히고, 직접 비교하세요.</b><span>특정 노무사를 추천하지 않고 공개된 정보로 선택을 돕습니다.</span></div>
        <ol aria-label="노무사 찾기 순서"><li>분야 선택</li><li>지역·검색</li><li>최대 3명 비교</li></ol>`;
      sub.after(intro);
    }

    if (!wrap.querySelector('.ia-directory-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'ia-directory-toolbar';
      cats.before(toolbar);
      toolbar.append(cats, search, filters, count);
    }

    if (!wrap.querySelector('.nomu-stage')) {
      const stage = document.createElement('div');
      stage.className = 'nomu-stage';
      list.before(stage);
      stage.append(list);
    }
  }

  function init() {
    enhanceHome();
    enhanceDirectory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

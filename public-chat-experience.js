(() => {
  const CHAT_LABEL = '인사야 AI';

  function ensureChatStyles() {
    if (document.querySelector('link[data-public-chat-v3]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/public-chat-experience.css';
    link.dataset.publicChatV3 = 'true';
    document.head.append(link);
  }

  function ensureChatIntro() {
    const home = document.getElementById('home');
    const body = document.getElementById('chatBody');
    if (!home || !body || !home.classList.contains('chatting')) return;
    if (body.querySelector('.ia-chat-intro')) return;

    const intro = document.createElement('header');
    intro.className = 'ia-chat-intro';
    intro.innerHTML = `
      <div>
        <span class="ia-chat-kicker">AI 상담</span>
        <h2>상황을 정리하고, 다음 행동까지 이어갑니다.</h2>
      </div>
      <p>중요한 사실을 먼저 확인한 뒤 계산·문서·공식 절차·전문가 연결로 이어집니다.</p>`;
    body.prepend(intro);
  }

  function enhanceAssistantBubble(bubble) {
    if (!bubble || bubble.dataset.answerV3 === 'true') return;
    bubble.dataset.answerV3 = 'true';
    bubble.classList.add('ia-answer-card');

    const body = document.createElement('div');
    body.className = 'ia-answer-body';
    while (bubble.firstChild) body.append(bubble.firstChild);

    const head = document.createElement('div');
    head.className = 'ia-answer-head';
    head.innerHTML = `
      <div class="ia-answer-identity"><span class="ia-answer-mark" aria-hidden="true">인</span><b>${CHAT_LABEL}</b></div>
      <span class="ia-answer-badge">참고 정보</span>`;

    const foot = document.createElement('div');
    foot.className = 'ia-answer-foot';
    foot.textContent = '입력한 사실관계를 바탕으로 정리한 참고 정보입니다. 중요한 금액·기한·적용 여부는 연결된 계산기와 공식 근거에서 다시 확인하세요.';

    bubble.append(head, body, foot);
  }

  function groupActionNodes(section) {
    if (!section || section.dataset.actionsV3 === 'true') return;
    const opts = section.querySelector('.opts');
    if (!opts) return;
    section.dataset.actionsV3 = 'true';
    section.classList.add('ia-next-actions');

    const heading = section.querySelector('h3');
    if (heading) heading.textContent = '이제 무엇을 할까요?';

    const intro = document.createElement('p');
    intro.className = 'ia-next-intro';
    intro.textContent = '상황에 맞는 다음 단계를 선택하세요. 직접 해결을 먼저 진행하거나 필요한 자료를 준비할 수 있습니다.';
    if (heading) heading.after(intro);
    else section.prepend(intro);

    const nodes = Array.from(opts.children);
    const primary = nodes.find(node => /내 사건으로 직접 해결하기/.test(node.textContent || ''));
    const utility = nodes.filter(node => /답변 신고|새 상담/.test(node.textContent || ''));
    const support = nodes.filter(node => node !== primary && !utility.includes(node));

    const layout = document.createElement('div');
    layout.className = 'ia-next-layout';

    if (primary) {
      const primaryWrap = document.createElement('div');
      primaryWrap.className = 'ia-next-primary';
      const label = document.createElement('span');
      label.textContent = '추천 시작점';
      primary.classList.add('ia-action-primary');
      primaryWrap.append(label, primary);
      layout.append(primaryWrap);
    }

    if (support.length) {
      const supportWrap = document.createElement('div');
      supportWrap.className = 'ia-next-support';
      const label = document.createElement('span');
      label.textContent = '필요한 자료와 절차';
      const grid = document.createElement('div');
      grid.className = 'ia-next-grid';
      support.forEach(node => {
        node.classList.add('ia-action-support');
        grid.append(node);
      });
      supportWrap.append(label, grid);
      layout.append(supportWrap);
    }

    if (utility.length) {
      const utilityWrap = document.createElement('div');
      utilityWrap.className = 'ia-next-utility';
      utility.forEach(node => {
        node.classList.add('ia-action-utility');
        utilityWrap.append(node);
      });
      layout.append(utilityWrap);
    }

    opts.replaceWith(layout);
  }

  function enhanceExpertHandoff(section) {
    if (!section || section.hidden || section.dataset.handoffV3 === 'true') return;
    section.dataset.handoffV3 = 'true';
    section.classList.add('ia-expert-handoff');
    if (!section.querySelector('.ia-expert-kicker')) {
      const kicker = document.createElement('span');
      kicker.className = 'ia-expert-kicker';
      kicker.textContent = '전문가 연결';
      section.prepend(kicker);
    }
  }

  function enhanceCompletedTurn() {
    const home = document.getElementById('home');
    const body = document.getElementById('chatBody');
    if (!home || !body || !home.classList.contains('chatting')) return;

    ensureChatIntro();

    const actions = body.querySelector('.chat-next-actions:last-of-type');
    if (!actions) return;

    body.querySelectorAll('.msg.ai:not([data-answer-v3="true"])').forEach(enhanceAssistantBubble);
    groupActionNodes(actions);
    enhanceExpertHandoff(body.querySelector('.chat-expert-handoff:last-of-type'));
  }

  function init() {
    ensureChatStyles();
    const home = document.getElementById('home');
    const body = document.getElementById('chatBody');
    if (!home || !body || home.dataset.chatExperienceV3 === 'true') return;
    home.dataset.chatExperienceV3 = 'true';

    const bodyObserver = new MutationObserver(() => enhanceCompletedTurn());
    bodyObserver.observe(body, { childList: true, subtree: true });

    const homeObserver = new MutationObserver(() => {
      if (home.classList.contains('chatting')) ensureChatIntro();
    });
    homeObserver.observe(home, { attributes: true, attributeFilter: ['class'] });

    enhanceCompletedTurn();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

(() => {
  const selected = new Map();

  window.paintDirectoryComparison = (shown) => {
    const list = document.getElementById('nomuList');
    if (!list || !globalThis.INSAYA_DIRECTORY) return;

    let panel = document.getElementById('nomu-comparison');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'nomu-comparison';
      panel.className = 'nomu-compare';
      panel.setAttribute('aria-label', '선택한 노무사 비교');
      panel.setAttribute('aria-live', 'polite');
      list.after(panel);
    }

    const render = () => {
      panel.replaceChildren();
      panel.classList.toggle('is-empty', selected.size === 0);

      const head = document.createElement('div');
      head.className = 'nomu-compare-head';
      const title = document.createElement('h3');
      title.textContent = '비교함';
      const count = document.createElement('span');
      count.className = 'nomu-compare-count';
      count.textContent = `${selected.size}/3`;
      head.append(title, count);
      panel.append(head);

      const hint = document.createElement('p');
      hint.className = 'nomu-compare-hint';
      hint.textContent = '지역·분야·자격확인·광고 여부를 나란히 확인합니다. 필터를 바꿔도 선택은 유지됩니다.';
      panel.append(hint);

      if (!selected.size) {
        const empty = document.createElement('div');
        empty.className = 'nomu-compare-empty';
        empty.textContent = '목록에서 “비교하기”를 선택하면 최대 3명을 한눈에 비교할 수 있어요.';
        panel.append(empty);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'nomu-compare-grid';
      panel.append(grid);

      for (const [id, item] of selected) {
        const card = document.createElement('article');
        card.className = 'nomu-compare-card';
        const name = document.createElement('h4');
        name.textContent = item.n;
        card.append(name);

        const details = [
          item.o || '사무소 정보 없음',
          item.loc || '지역 정보 없음',
          (item.tags || []).join(' · ') || '분야 정보 없음',
          globalThis.INSAYA_DIRECTORY.verified(item) ? '자격확인' : '자격확인 정보 없음',
          globalThis.INSAYA_DIRECTORY.sponsored(item) ? '스폰서' : '일반 노출',
        ];
        details.forEach(text => {
          const p = document.createElement('p');
          p.textContent = text;
          card.append(p);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'nomu-compare-remove';
        remove.textContent = '비교에서 빼기';
        remove.setAttribute('aria-label', `${item.n} 비교 해제`);
        remove.addEventListener('click', () => {
          selected.delete(id);
          window.paintDirectoryComparison(shown);
        });
        card.append(remove);
        grid.append(card);
      }
    };

    list.querySelectorAll('.nomu-compare-control').forEach(node => node.remove());
    list.querySelectorAll('.card.nomu').forEach((card, index) => {
      const item = shown[index];
      if (!item) return;

      const label = document.createElement('label');
      label.className = 'nomu-compare-control';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected.has(item.id);
      input.disabled = !input.checked && selected.size >= 3;
      input.setAttribute('aria-label', `${item.n} 비교 ${input.checked ? '해제' : '선택'}`);
      input.addEventListener('change', () => {
        if (input.checked && selected.size < 3) selected.set(item.id, item);
        else selected.delete(item.id);
        window.paintDirectoryComparison(shown);
      });
      label.append(input, document.createTextNode('비교하기'));
      card.append(label);
    });

    render();
  };
})();

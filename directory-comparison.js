(() => {
  const selected = new Map();
  window.paintDirectoryComparison = (shown) => {
    const list = document.getElementById('nomuList');
    let panel = document.getElementById('nomu-comparison');
    if(!panel){panel=document.createElement('section');panel.id='nomu-comparison';panel.className='nomu-compare';panel.setAttribute('aria-label','선택한 노무사 비교');list.after(panel);}
    const render = () => {
      panel.replaceChildren();
      const title=document.createElement('h3');title.textContent=`노무사 비교 (${selected.size}/3)`;panel.append(title);
      const hint=document.createElement('p');hint.setAttribute('role','status');hint.textContent='최대 3명을 선택해 지역·분야·자격확인·광고 여부를 비교하세요. 필터를 바꿔도 선택은 유지됩니다.';panel.append(hint);
      const grid=document.createElement('div');grid.className='nomu-compare-grid';panel.append(grid);
      for(const [id,item] of selected){const card=document.createElement('article');const name=document.createElement('h4');name.textContent=item.n;card.append(name);
        for(const text of [item.o||'사무소 정보 없음',item.loc||'지역 정보 없음',(item.tags||[]).join(' · ')||'분야 정보 없음',globalThis.INSAYA_DIRECTORY.verified(item)?'자격확인':'자격확인 정보 없음',globalThis.INSAYA_DIRECTORY.sponsored(item)?'스폰서':'일반 노출']){const p=document.createElement('p');p.textContent=text;card.append(p);}
        const remove=document.createElement('button');remove.type='button';remove.textContent=`${item.n} 비교 해제`;remove.addEventListener('click',()=>{selected.delete(id);window.paintDirectoryComparison(shown);});card.append(remove);grid.append(card);}
    };
    list.querySelectorAll('.nomu-compare-control').forEach(node=>node.remove());
    list.querySelectorAll('.card.nomu').forEach((card,index)=>{const item=shown[index];if(!item)return;const label=document.createElement('label');label.className='nomu-compare-control';const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(item.id);input.disabled=!input.checked&&selected.size>=3;input.addEventListener('change',()=>{if(input.checked&&selected.size<3)selected.set(item.id,item);else selected.delete(item.id);window.paintDirectoryComparison(shown);});label.append(input,`${item.n} 비교`);card.append(label);});
    render();
  };
})();

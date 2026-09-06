(() => {
  async function check() {
    const status = document.getElementById('workspace-status');
    const entry = document.getElementById('workspace-entry');
    entry.hidden = true;
    try {
      const response = await fetch('/api/saas/auth/me', {credentials:'same-origin',cache:'no-store'});
      if(response.status === 404){status.textContent = '현재 Business Workspace는 공개 이용이 활성화되지 않았습니다. 위 AI 상담과 도구는 이용할 수 있습니다.';return;}
      if(response.ok || response.status === 401){status.textContent = response.ok ? '회사 계정과 권한에 따라 Workspace를 이용할 수 있습니다.' : 'Workspace 이용에는 회사 계정 로그인이 필요합니다.';entry.hidden = false;return;}
      throw new Error('unavailable');
    } catch {status.textContent = 'Workspace 이용 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요. AI 상담과 공개 도구는 계속 이용할 수 있습니다.';const retry=document.createElement('button');retry.type='button';retry.textContent='다시 확인';retry.addEventListener('click',check,{once:true});status.append(' ',retry);}
  }
  check();
})();

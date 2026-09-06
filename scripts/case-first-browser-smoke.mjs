import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const port=Number(process.env.IA_E2E_PORT||32317), base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),DB_PATH:':memory:',NODE_ENV:'test',SITE_URL:base},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x);
let browser;
try {
  for(let i=0;i<75;i++){try{if((await fetch(base)).ok)break;}catch{}if(server.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,...(process.env.IA_BROWSER_CHANNEL?{channel:process.env.IA_BROWSER_CHANNEL}:{})});
  for(const internal of ['/admin.html','/admin-legal.html','/partner.html']){
    const response=await fetch(base+internal);
    assert.doesNotMatch(await response.text(),/src=["']\/global-navigation\.js["']/);
  }
  fs.mkdirSync('.shots/case-first',{recursive:true});
  for(const width of [1440,768,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const route of ['/','/worker.html','/employer.html','/tools.html','/wage-intake','/dismissal-intake','/retirement-intake','/worktime-intake','/annual-leave-intake','/business.html','/business-login.html','/advisor.html','/#calc','/#docs','/#nomu','/articles/wage.html']){
      await page.goto(base+route,{waitUntil:'networkidle'});
      assert.equal(await page.locator('.global-navigation').count(),1,route);
      assert.ok(await page.getByRole('link',{name:'AI 상담',exact:true}).isVisible(),route);
      assert.ok(await page.locator('body').innerText(),route);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,`${width} ${route} horizontal overflow`);
      if(width<=800){const toggle=page.locator('.global-toggle');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#global-links').getByRole('link',{name:'노동생활 도구'}).isVisible());await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.ok(await toggle.evaluate(el=>el===document.activeElement));}
      if(route==='/'){assert.equal(await page.locator('#greeting [data-case-launcher-stack]').count(),0);await page.getByRole('button',{name:'내 상황 이야기하기'}).click();assert.ok(await page.locator('#composerInput').evaluate(el=>el===document.activeElement));}
      if(route==='/employer.html'){assert.match(await page.locator('#workspace-status').innerText(),/활성화되지 않았습니다/);assert.ok(await page.locator('#workspace-entry').isHidden());}
      if(route==='/')await page.evaluate(()=>document.querySelector('.content').scrollTop=0);
      if(['/','/worker.html','/employer.html','/tools.html','/#nomu'].includes(route))await page.screenshot({path:`.shots/case-first/${width}-${route.replace(/[^a-z]/gi,'')||'home'}.png`,fullPage:true});
    }
    assert.deepEqual(errors,[],`${width} JavaScript errors`);await context.close();console.log(`PASS layout/navigation ${width}px`);
  }
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  const interactionErrors=[];page.on('pageerror',error=>interactionErrors.push(error.message));
  const fixture=[{id:'ordinary',n:'가노무',loc:'서울',sido:'서울',tags:['임금체불']},{id:'verified',n:'나노무',loc:'서울',sido:'서울',v:true,tags:['임금체불']},{id:'sponsor',n:'다노무',loc:'서울',sido:'서울',featured:true,tags:['부당해고']},{id:'both',n:'라노무',loc:'부산',sido:'부산',featured:true,v:true,tags:[]}];
  await page.route('**/api/nomu',route=>route.fulfill({json:fixture}));
  await page.goto(base+'/#nomu',{waitUntil:'networkidle'});
  assert.match(await page.locator('#nomuList .nm').first().innerText(),/라노무/);
  await page.locator('#nomuSido').selectOption('서울');
  assert.match(await page.locator('#nomuList .nm').first().innerText(),/다노무/);
  await page.getByRole('checkbox',{name:'다노무 비교'}).check();
  await page.locator('#nomuFields').getByRole('button',{name:'임금체불',exact:true}).click();
  assert.match(await page.locator('#nomuList .nm').first().innerText(),/나노무/);
  assert.match(await page.locator('#nomu-comparison').innerText(),/다노무/);
  await page.getByRole('checkbox',{name:'나노무 비교'}).check();
  assert.match(await page.locator('#nomu-comparison').innerText(),/2\/3/);
  await page.getByRole('button',{name:'다노무 비교 해제'}).click();
  assert.match(await page.locator('#nomu-comparison').innerText(),/1\/3/);
  await page.goto(base+'/#consult-employer',{waitUntil:'networkidle'});
  let sent='';await page.route('**/api/chat',async route=>{sent=route.request().postDataJSON().messages.at(-1).content;await route.fulfill({status:200,body:'상황을 확인했습니다. 사실과 증거를 정리하세요.'});});
  await page.locator('#composerInput').fill('직원 해고 절차를 확인하려고 합니다');await page.locator('#composerInput').press('Enter');
  await page.locator('.chat-expert-handoff').waitFor();assert.match(sent,/사업주입니다/);
  assert.ok(await page.getByRole('button',{name:'상담 가능한 노무사 찾아보기',exact:true}).isVisible());
  assert.ok(await page.getByRole('link',{name:'먼저 직접 해결해보기',exact:true}).isVisible());
  await page.goto(base+'/#consult',{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});await page.locator('#composerInput').fill('퇴직금을 계산하고 싶어요');await page.locator('#composerInput').press('Enter');
  await page.locator('.chat-next-actions').waitFor();assert.ok(await page.locator('.chat-expert-handoff').isHidden());
  await page.route('**/api/saas/auth/me',route=>route.fulfill({status:401,json:{error:'unauthorized'}}));await page.goto(base+'/employer.html',{waitUntil:'networkidle'});assert.ok(await page.locator('#workspace-entry').isVisible());
  await page.route('**/api/saas/auth/me',route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.reload({waitUntil:'networkidle'});assert.ok(await page.locator('#workspace-entry').isHidden());assert.match(await page.locator('#workspace-status').innerText(),/확인하지 못했습니다/);
  // Presentation fixtures only: no SaaS activation, database, login token or email delivery.
  await page.unroute('**/api/saas/auth/me');
  await page.route('**/api/saas/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const data=pathname.endsWith('/auth/me')?{user:{id:'fixture-user',email:'fixture@example.test'},csrf:'fixture-csrf'}:
      pathname.endsWith('/organizations')?{organizations:[{organization:{id:'fixture-org',displayName:'화면 검증 회사'},membership:{role:'OWNER'}}]}:{};
    return route.fulfill({json:data});
  });
  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:900});await page.goto(base+'/business.html',{waitUntil:'networkidle'});
    assert.ok(await page.locator('#workspace-view').isVisible());
    assert.ok(await page.locator('#login-view').isHidden());assert.ok(await page.locator('#disabled-view').isHidden());
    for(const view of ['dashboard','risks','actions','calendar','notifications','people','setup']){
      await page.locator(`[data-view="${view}"]`).click();assert.ok(await page.locator(`#view-${view}`).isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`workspace fixture ${width} ${view}`);
    }
    await page.screenshot({path:`.shots/case-first/${width}-workspace-fixture.png`,fullPage:true});
  }
  assert.deepEqual(interactionErrors,[]);
  await context.close();console.log('PASS directory filters/comparison, AI handoff, Business disabled/login/error presentation');
} finally {await browser?.close();server.kill('SIGTERM');}

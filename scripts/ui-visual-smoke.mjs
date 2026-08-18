import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT=Number(process.env.E2E_PORT||32239);
const BASE=`http://127.0.0.1:${PORT}`;
const OUT=process.env.UI_SCREENSHOT_DIR||"artifacts/ui-visual";
fs.mkdirSync(OUT,{recursive:true});

const server=spawn(process.execPath,["server.js"],{
  env:{...process.env,PORT:String(PORT),DB_PATH:":memory:",NODE_ENV:"test",SITE_URL:BASE},
  stdio:["ignore","pipe","pipe"],
});
let output="";server.stdout.on("data",c=>output+=c);server.stderr.on("data",c=>output+=c);

async function ready(){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    if(server.exitCode!==null)throw new Error(`server exited\n${output}`);
    try{const r=await fetch(`${BASE}/`);if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error(`server not ready\n${output}`);
}

function errorsFor(page){const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});page.on("pageerror",e=>errors.push(e.message));return errors;}
async function assertNoOverflow(page,label){
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  assert.ok(dimensions.scroll<=dimensions.client+2,`${label} horizontal overflow: ${dimensions.scroll} > ${dimensions.client}`);
}
async function captureHome(browser,name,viewport){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=errorsFor(page);
  await page.goto(`${BASE}/`,{waitUntil:"networkidle"});
  await page.locator("body.ui-v2").waitFor();
  assert.equal(await page.locator(".ui-problem").count(),5);
  assert.match(await page.locator(".hero-h").innerText(),/어디서부터[\s\S]*상황부터/);
  const tokens=await page.evaluate(()=>({font:getComputedStyle(document.documentElement).fontSize,primary:getComputedStyle(document.documentElement).getPropertyValue("--ui-primary").trim(),family:getComputedStyle(document.body).fontFamily}));
  assert.equal(tokens.font,"16px");assert.equal(tokens.primary.toLowerCase(),"#5b4bff");assert.match(tokens.family,/Pretendard/);
  await assertNoOverflow(page,`home-${name}`);
  await page.screenshot({path:`${OUT}/home-${name}.png`,fullPage:true});
  assert.deepEqual(errors,[],`home-${name} console errors:\n${errors.join("\n")}`);await context.close();
}
async function captureCase(browser,name,viewport){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=errorsFor(page);
  await page.goto(`${BASE}/wage-intake`,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:/못 받은 임금을/}).waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),"16px");
  assert.equal((await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--blue").trim())).toLowerCase(),"#5b4bff");
  await assertNoOverflow(page,`case-${name}`);
  await page.screenshot({path:`${OUT}/wage-intake-${name}.png`,fullPage:true});
  assert.deepEqual(errors,[],`case-${name} console errors:\n${errors.join("\n")}`);await context.close();
}
async function captureConversation(browser){
  const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();const errors=errorsFor(page);
  await page.goto(`${BASE}/`,{waitUntil:"networkidle"});
  await page.locator('[data-ui-problem="wage"]').click();
  await page.locator("#home.chatting").waitFor();
  await page.locator(".ui-chat-stepper").waitFor();
  assert.ok(await page.locator(".ui-step.on").count()>=1);
  await page.screenshot({path:`${OUT}/conversation-desktop.png`,fullPage:true});
  assert.deepEqual(errors,[],`conversation console errors:\n${errors.join("\n")}`);await context.close();
}

let browser;
try{
  await ready();browser=await chromium.launch({headless:true});
  await captureHome(browser,"desktop",{width:1536,height:960});
  await captureHome(browser,"mobile",{width:390,height:844});
  await captureCase(browser,"desktop",{width:1365,height:900});
  await captureCase(browser,"mobile",{width:390,height:844});
  await captureConversation(browser);
  console.log(`UI visual smoke passed. screenshots=${OUT}`);
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}

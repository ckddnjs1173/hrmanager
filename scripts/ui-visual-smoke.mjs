import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT=Number(process.env.E2E_PORT||32239);
const BASE=`http://127.0.0.1:${PORT}`;
const OUT=process.env.UI_SCREENSHOT_DIR||"artifacts/ui-visual";
fs.mkdirSync(OUT,{recursive:true});

function validateInlineClassicScriptsFromHtml(html,label){
  const pattern=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;let index=0;
  while((match=pattern.exec(html))){
    const attrs=match[1]||"";const code=match[2]||"";index+=1;
    if(/\bsrc\s*=/.test(attrs))continue;
    const type=(attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)||[])[1]||"text/javascript";
    if(!/^(?:text|application)\/javascript$/i.test(type))continue;
    try{new vm.Script(code,{filename:`${label}:inline-script-${index}`});}
    catch(error){throw new Error(`Inline script syntax check failed for ${label} script ${index}:\n${error.stack||error.message}`);}
  }
}
validateInlineClassicScriptsFromHtml(fs.readFileSync("index.html","utf8"),"index.html");

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

async function errorsFor(context,page){
  const errors=[];
  page.on("console",m=>{
    if(m.type()!=="error")return;
    const at=m.location();
    errors.push(`console: ${m.text()}${at?.url?` @ ${at.url}:${(at.lineNumber??0)+1}:${(at.columnNumber??0)+1}`:""}`);
  });
  page.on("pageerror",e=>errors.push(`pageerror: ${e.stack||e.message}`));
  page.on("response",response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
  const cdp=await context.newCDPSession(page);await cdp.send("Runtime.enable");await cdp.send("Network.enable");
  cdp.on("Runtime.exceptionThrown",({exceptionDetails:d})=>{
    const desc=d.exception?.description||d.text||"exception";
    errors.push(`cdp-exception: ${desc} @ ${d.url||"<anonymous>"}:${(d.lineNumber??0)+1}:${(d.columnNumber??0)+1}`);
  });
  cdp.on("Network.requestWillBeSent",({request,initiator})=>{
    if(!/%24%7B|\$%7B|\$\{/.test(request.url))return;
    const frame=(initiator?.stack?.callFrames||[])[0];
    errors.push(`literal-template-request: ${request.url}${frame?` initiated @ ${frame.url}:${frame.lineNumber+1}:${frame.columnNumber+1}`:""}`);
  });
  return errors;
}
async function assertNoOverflow(page,label){
  const report=await page.evaluate(()=>{
    const client=document.documentElement.clientWidth;
    const scroll=document.documentElement.scrollWidth;
    const offenders=[...document.querySelectorAll("body *")].map((element)=>{
      const rect=element.getBoundingClientRect();
      return {tag:element.tagName.toLowerCase(),id:element.id||"",cls:typeof element.className==="string"?element.className.trim().replace(/\s+/g,".").slice(0,120):"",left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width),scrollWidth:element.scrollWidth};
    }).filter((item)=>item.right>client+2||item.left<-2||item.width>client+2||item.scrollWidth>client+2).sort((a,b)=>Math.max(b.right-client,b.width-client,b.scrollWidth-client)-Math.max(a.right-client,a.width-client,a.scrollWidth-client)).slice(0,12);
    return {scroll,client,offenders};
  });
  assert.ok(report.scroll<=report.client+2,`${label} horizontal overflow: ${report.scroll} > ${report.client}\n${report.offenders.map(item=>`${item.tag}${item.id?`#${item.id}`:""}${item.cls?`.${item.cls}`:""} left=${item.left} right=${item.right} width=${item.width} scrollWidth=${item.scrollWidth}`).join("\n")}`);
}
async function snap(page,path){await page.screenshot({path,fullPage:false,animations:"disabled",caret:"hide",timeout:60000});}
async function captureHome(browser,name,viewport){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=await errorsFor(context,page);
  await page.goto(`${BASE}/`,{waitUntil:"networkidle"});
  await page.locator("body.ui-v2").waitFor();
  assert.equal(await page.locator(".ui-problem").count(),5);
  assert.match(await page.locator(".hero-h").innerText(),/어디서부터[\s\S]*상황부터/);
  const tokens=await page.evaluate(()=>({font:getComputedStyle(document.documentElement).fontSize,primary:getComputedStyle(document.documentElement).getPropertyValue("--ui-primary").trim(),family:getComputedStyle(document.body).fontFamily}));
  assert.equal(tokens.font,"16px");assert.equal(tokens.primary.toLowerCase(),"#5b4bff");assert.match(tokens.family,/Pretendard/);
  const literalImages=await page.evaluate(()=>[...document.images].filter(img=>(img.getAttribute("src")||"").includes("${")).map(img=>img.outerHTML));
  if(literalImages.length)errors.push(`literal-template-images: ${literalImages.join(" | ")}`);
  await snap(page,`${OUT}/home-${name}.png`);await assertNoOverflow(page,`home-${name}`);
  assert.deepEqual(errors,[],`home-${name} browser errors:\n${errors.join("\n")}`);await context.close();
}
async function captureCase(browser,name,viewport){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=await errorsFor(context,page);
  await page.goto(`${BASE}/wage-intake`,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:/못 받은 임금을/}).waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),"16px");
  assert.equal((await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--blue").trim())).toLowerCase(),"#5b4bff");
  await snap(page,`${OUT}/wage-intake-${name}.png`);await assertNoOverflow(page,`case-${name}`);
  assert.deepEqual(errors,[],`case-${name} browser errors:\n${errors.join("\n")}`);await context.close();
}
async function captureConversation(browser){
  const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();const errors=await errorsFor(context,page);
  await page.goto(`${BASE}/`,{waitUntil:"networkidle"});
  await page.locator('[data-ui-problem="wage"]').click();
  await page.locator("#home.chatting").waitFor();await page.locator(".ui-chat-stepper").waitFor();
  assert.ok(await page.locator(".ui-step.on").count()>=1);await snap(page,`${OUT}/conversation-desktop.png`);
  assert.deepEqual(errors,[],`conversation browser errors:\n${errors.join("\n")}`);await context.close();
}

let browser;
try{
  await ready();
  const servedHome=await (await fetch(`${BASE}/`)).text();
  validateInlineClassicScriptsFromHtml(servedHome,"served-home");
  browser=await chromium.launch({headless:true});
  await captureHome(browser,"desktop",{width:1536,height:960});
  await captureHome(browser,"mobile",{width:390,height:844});
  await captureCase(browser,"desktop",{width:1365,height:900});
  await captureCase(browser,"mobile",{width:390,height:844});
  await captureConversation(browser);
  console.log(`UI visual smoke passed. screenshots=${OUT}`);
}finally{if(browser)await browser.close();server.kill("SIGTERM");}

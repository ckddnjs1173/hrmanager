import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareProductHomeHtml } from "../lib/product-home.js";

const css=fs.readFileSync(new URL("../assets/brand/product-ui.css",import.meta.url),"utf8");
const saasCss=fs.readFileSync(new URL("../assets/brand/saas-ui.css",import.meta.url),"utf8");
const caseCss=fs.readFileSync(new URL("../assets/brand/case-ui.css",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../product-ui.js",import.meta.url),"utf8");
const application=fs.readFileSync(new URL("../lib/application.js",import.meta.url),"utf8");

test("public product uses one local Pretendard-led compact purple system",()=>{
  assert.match(css,/--ui-primary:#5b4bff/);
  assert.match(css,/html\{font-size:16px!important\}/);
  assert.match(css,/--font-serif:var\(--font-sans\)/);
  assert.match(css,/border:1px solid var\(--ui-line\)/);
  assert.match(css,/\.ui-problem-grid/);
  assert.match(css,/\.ui-case-rail/);
});

test("Business and Advisor share the same local font and primary system",()=>{
  assert.match(saasCss,/PretendardVariable\.woff2/);
  assert.match(saasCss,/--ui-primary:#5b4bff/);
  assert.match(application,/assets\/brand\/saas-ui\.css/);
  assert.match(application,/\/business-login\.html/);
});

test("all five worker Case workspaces use the shared compact UI override",()=>{
  assert.match(caseCss,/PretendardVariable\.woff2/);
  assert.match(caseCss,/--blue:#5b4bff!important/);
  assert.match(caseCss,/html\{font-size:16px!important\}/);
  assert.match(application,/assets\/brand\/case-ui\.css/);
  for(const slug of ["wage-intake","dismissal-intake","retirement-intake","worktime-intake","annual-leave-intake"])assert.ok(application.includes(`slug: "${slug}"`));
});

test("public UI augments real workflows instead of creating synthetic persistent cases",()=>{
  for(const label of ["임금체불","해고·권고사직","퇴직금","근로시간·수당","직장 내 괴롭힘"])assert.ok(ui.includes(label));
  for(const label of ["개요","사실","금액","증거","행동","문서","근거"])assert.ok(ui.includes(label));
  assert.match(ui,/callGlobal\("startCase"/);
  assert.match(ui,/callGlobal\("nav"/);
  assert.equal(/localStorage|sessionStorage/.test(ui),false);
});

test("runtime home response injects UI assets exactly once",()=>{
  const source="<!doctype html><html><head></head><body><script>const SITES={};\nlet currentSite=null;const TOPICS={};\nfunction renderHub(which){}</script></body></html>";
  const first=prepareProductHomeHtml(source);
  const second=prepareProductHomeHtml(first);
  assert.equal((second.match(/product-ui\.css/g)||[]).length,1);
  assert.equal((second.match(/product-ui\.js/g)||[]).length,1);
});

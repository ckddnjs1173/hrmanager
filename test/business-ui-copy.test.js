import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script=fs.readFileSync(new URL("../business-ui-copy.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../assets/brand/business-ui-copy.css",import.meta.url),"utf8");
const application=fs.readFileSync(new URL("../lib/application.js",import.meta.url),"utf8");

test("Business navigation receives line icons without replacing view keys",()=>{
  for(const view of ["dashboard","risks","actions","calendar","notifications","people","collaboration","setup"])assert.ok(script.includes(`${view}:`));
  assert.match(script,/#business-nav \.nav-item\[data-view\]/);
  assert.match(css,/\.ui-nav-icon/);
});

test("Business raw workflow enums are translated only in the presentation layer",()=>{
  for(const [raw,label] of [["CRITICAL","매우 높음"],["HIGH","높음"],["OPEN","대기"],["IN_PROGRESS","진행 중"],["CHANGES_REQUESTED","수정 필요"],["APPROVED","검토 완료"]]){
    assert.ok(script.includes(`${raw}:"${label}"`));
  }
  assert.equal(/fetch\(|XMLHttpRequest|localStorage|sessionStorage/.test(script),false);
});

test("Business presentation adapters are injected after the app rather than editing API contracts",()=>{
  assert.match(application,/business-ui-copy\.css/);
  assert.match(application,/business-ui-copy\.js/);
});

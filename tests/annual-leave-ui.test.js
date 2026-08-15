import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));const read=(file)=>readFileSync(path.join(ROOT,file),"utf8");

test("annual leave page loads dedicated client and styles",()=>{const html=read("annual-leave-intake.html");assert.match(html,/id="annualLeaveApp"/);assert.match(html,/annual-leave-intake-client\.js/);assert.match(html,/annual-leave-intake\.css/);});
test("annual leave client keeps Case access session-only and renders documents as text",()=>{const client=read("annual-leave-intake-client.js");assert.match(client,/sessionStorage/);assert.doesNotMatch(client,/localStorage/);assert.match(client,/\/api\/cases\/annual-leave-intake/);assert.match(client,/\/annual-leave-document\//);assert.match(client,/\/annual-leave-report/);assert.match(client,/querySelector\("pre"\)\.textContent/);});
test("home launcher exposes annual leave while preserving existing Case routes",()=>{const launcher=read("wage-intake-launcher.js");for(const target of ["WAGE_TARGET","DISMISSAL_TARGET","RETIREMENT_TARGET","WORKTIME_TARGET","ANNUAL_LEAVE_TARGET"])assert.match(launcher,new RegExp(target));assert.match(launcher,/ANNUAL_LEAVE_TARGET = "\/annual-leave-intake"/);assert.match(launcher,/data-open-annual-leave/);});

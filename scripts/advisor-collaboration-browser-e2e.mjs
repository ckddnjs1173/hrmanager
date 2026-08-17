import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL required");
const PORT=Number(process.env.ADVISOR_UI_E2E_PORT||32329);
const BASE=`http://127.0.0.1:${PORT}`;
const OWNER_EMAIL="advisor-ui-owner@example.com";
const ADVISOR_EMAIL="advisor-ui-expert@example.com";
const CASE_TITLE="징계절차 외부 자문 E2E";
const ADVISOR_NOTE="외부 전문가 브라우저 검토 의견입니다.";
const BUSINESS_NOTE="회사 브라우저 확인 및 회신입니다.";

const migrationPool=createPostgresPool({applicationName:"insaya-advisor-ui-browser-migrate"});
await applyPostgresMigrations(migrationPool,{logger:{log(){}}});
await migrationPool.end();

const server=spawn(process.execPath,["server.js"],{env:{...process.env,PORT:String(PORT),SITE_URL:BASE,STORAGE_DRIVER:"postgres",SAAS_ENABLED:"1",SAAS_AUTH_TOKEN_ECHO:"1",SAAS_SESSION_SECRET:"advisor-ui-browser-secret",SESSION_SECRET:"advisor-ui-legacy-secret",ADMIN_TOKEN:"advisor-ui-admin",NODE_ENV:"test",REQUIRE_PERSISTENT_DB:"0",PERSISTENT_STORAGE:"0"},stdio:["ignore","pipe","pipe"]});
let serverOutput="";server.stdout.on("data",c=>serverOutput+=c.toString());server.stderr.on("data",c=>serverOutput+=c.toString());

async function waitForServer(){const deadline=Date.now()+20000;while(Date.now()<deadline){if(server.exitCode!==null)throw new Error(`server exited\n${serverOutput}`);try{const r=await fetch(`${BASE}/advisor.html`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error(`server timeout\n${serverOutput}`);}
function collectErrors(page){const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});page.on("pageerror",e=>errors.push(e.message));return errors;}

try{
  await waitForServer();
  const browser=await chromium.launch({headless:true});
  try{
    const ownerContext=await browser.newContext({viewport:{width:1440,height:1000},permissions:["clipboard-read","clipboard-write"]});
    const owner=await ownerContext.newPage();const ownerErrors=collectErrors(owner);
    await owner.goto(`${BASE}/business.html`,{waitUntil:"domcontentloaded"});
    await owner.locator("#login-view").waitFor({state:"visible"});
    await owner.locator("#login-email").fill(OWNER_EMAIL);await owner.locator("#login-form button[type=submit]").click();await owner.locator("#verify-magic").waitFor({state:"visible"});await owner.locator("#verify-magic").click();
    await owner.locator("#workspace-view").waitFor({state:"visible"});ownerErrors.length=0;
    await owner.locator("#org-dialog[open]").waitFor();await owner.locator('#org-form input[name="legalName"]').fill("Advisor UI E2E 주식회사");await owner.locator('#org-form input[name="displayName"]').fill("Advisor UI E2E");await owner.locator('#org-form button[type="submit"]').click();
    await owner.locator("#org-picker option").first().waitFor({state:"attached"});const organizationId=await owner.locator("#org-picker").inputValue();assert.ok(organizationId);

    await owner.locator('.nav-item[data-view="collaboration"]').click();
    await owner.locator("#view-collaboration").waitFor({state:"visible"});
    assert.match(await owner.locator("#view-collaboration .collab-safety").innerText(),/comment\.create/);
    await owner.locator('#business-case-form input[name="title"]').fill(CASE_TITLE);await owner.locator('#business-case-form textarea[name="summary"]').fill("징계 통보 전 절차와 문구의 적정성을 외부 전문가에게 확인합니다.");await owner.locator('#business-case-form button[type="submit"]').click();
    await owner.locator("#business-case-list").getByText(CASE_TITLE).waitFor({state:"visible"});
    const caseCard=owner.locator("#business-case-list .collab-case",{hasText:CASE_TITLE});await caseCard.getByRole("button",{name:"OPEN으로 시작"}).click();await caseCard.locator(".collab-chip.OPEN").waitFor({state:"visible"});
    const caseId=await caseCard.getAttribute("data-business-case-id");assert.ok(caseId);

    await owner.locator("#advisor-case-select").selectOption(caseId);await owner.locator('#advisor-invite-form input[name="advisorEmail"]').fill(ADVISOR_EMAIL);await owner.locator('#advisor-invite-form select[name="grantDays"]').selectOption("30");await owner.locator('#advisor-invite-form button[type="submit"]').click();
    await owner.locator("#advisor-invite-link-box").waitFor({state:"visible"});const invitationUrl=await owner.locator("#advisor-invite-link").inputValue();assert.ok(invitationUrl.startsWith(`${BASE}/advisor.html#invite=`),invitationUrl);
    const inviteToken=new URL(invitationUrl).hash.replace(/^#invite=/,"");assert.ok(inviteToken.length>=32);
    assert.match(await owner.locator("#advisor-invitation-list").innerText(),new RegExp(ADVISOR_EMAIL));
    assert.match(await owner.locator("#advisor-invitation-list").innerText(),/comment\.create/);
    assert.doesNotMatch(await owner.locator("#advisor-invitation-list").innerText(),new RegExp(inviteToken.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
    assert.deepEqual(ownerErrors,[],`owner console errors:\n${ownerErrors.join("\n")}`);

    const advisorContext=await browser.newContext({viewport:{width:1200,height:900}});const advisor=await advisorContext.newPage();const advisorErrors=collectErrors(advisor);const advisorRequests=[];advisor.on("request",req=>advisorRequests.push(req.url()));
    await advisor.goto(invitationUrl,{waitUntil:"domcontentloaded"});
    await advisor.locator("#advisor-login").waitFor({state:"visible"});assert.equal(new URL(advisor.url()).hash,"","invitation token must be removed from visible URL after bootstrap");
    advisorErrors.length=0;
    await advisor.locator("#advisor-login-email").fill(ADVISOR_EMAIL);await advisor.locator('#advisor-login-form button[type="submit"]').click();await advisor.locator("#advisor-verify-magic").waitFor({state:"visible"});await advisor.locator("#advisor-verify-magic").click();
    await advisor.locator("#advisor-invite-view").waitFor({state:"visible"});const preview=await advisor.locator("#advisor-invite-preview").innerText();assert.match(preview,/Advisor UI E2E/);assert.match(preview,new RegExp(CASE_TITLE));assert.match(preview,/case\.read/);assert.match(preview,/comment\.create/);
    await advisor.locator("#advisor-accept-invite").click();await advisor.locator("#advisor-workspace").waitFor({state:"visible"});await advisor.locator("#advisor-case-detail").getByText(CASE_TITLE).waitFor({state:"visible"});assert.match(await advisor.locator("#advisor-case-detail").innerText(),/징계 통보 전 절차/);

    await advisor.locator("#advisor-review-form").waitFor({state:"visible"});await advisor.locator("#advisor-review-body").fill(ADVISOR_NOTE);await advisor.locator('#advisor-review-form button[type="submit"]').click();await advisor.locator("#advisor-case-detail").getByText(ADVISOR_NOTE).waitFor({state:"visible"});

    await caseCard.getByRole("button",{name:"검토 의견",exact:true}).click();await caseCard.locator("[data-case-note-panel]").waitFor({state:"visible"});await caseCard.getByText(ADVISOR_NOTE).waitFor({state:"visible"});
    await caseCard.locator('[data-case-note-form] textarea[name="body"]').fill(BUSINESS_NOTE);await caseCard.locator('[data-case-note-form] button[type="submit"]').click();await caseCard.getByText(BUSINESS_NOTE).waitFor({state:"visible"});

    await advisor.locator("[data-advisor-notes-refresh]").click();await advisor.locator("#advisor-case-detail").getByText(BUSINESS_NOTE).waitFor({state:"visible"});
    assert.equal(advisorRequests.some(url=>url.includes("/api/saas/organizations/")),false,`advisor portal must not call organization APIs:\n${advisorRequests.join("\n")}`);
    assert.equal(advisorRequests.some(url=>url.includes("#invite=")),false,"URL fragment must never be transmitted in HTTP requests");
    assert.deepEqual(advisorErrors,[],`advisor console errors:\n${advisorErrors.join("\n")}`);
    await advisorContext.close();await ownerContext.close();

    const pool=createPostgresPool({applicationName:"insaya-advisor-ui-browser-assert"});
    try{
      const advisorUser=await pool.query("SELECT id FROM users WHERE email_normalized=$1",[ADVISOR_EMAIL]);assert.equal(advisorUser.rowCount,1);const advisorUserId=advisorUser.rows[0].id;
      const ownerUser=await pool.query("SELECT id FROM users WHERE email_normalized=$1",[OWNER_EMAIL]);assert.equal(ownerUser.rowCount,1);const ownerUserId=ownerUser.rows[0].id;
      const membership=await pool.query("SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'",[organizationId,advisorUserId]);assert.equal(membership.rows[0].count,0,"advisor must not become an organization member");
      const invite=await pool.query("SELECT status,token_hash,share_grant_id FROM external_advisor_invitations WHERE organization_id=$1 AND resource_id=$2",[organizationId,caseId]);assert.equal(invite.rowCount,1);assert.equal(invite.rows[0].status,"ACCEPTED");assert.notEqual(invite.rows[0].token_hash,inviteToken);assert.match(invite.rows[0].token_hash,/^[a-f0-9]{64}$/);
      const grant=await pool.query("SELECT status,advisor_user_id,permissions FROM external_advisor_share_grants WHERE id=$1",[invite.rows[0].share_grant_id]);assert.equal(grant.rowCount,1);assert.equal(grant.rows[0].status,"ACTIVE");assert.equal(grant.rows[0].advisor_user_id,advisorUserId);assert.deepEqual(grant.rows[0].permissions,["case.read","comment.create"]);
      const notes=await pool.query("SELECT author_type,author_user_id,share_grant_id,body FROM business_case_review_notes WHERE business_case_id=$1 ORDER BY created_at ASC,id ASC",[caseId]);assert.equal(notes.rowCount,2);assert.deepEqual(notes.rows.map(row=>row.author_type),["ADVISOR","BUSINESS"]);assert.equal(notes.rows[0].author_user_id,advisorUserId);assert.equal(notes.rows[0].share_grant_id,invite.rows[0].share_grant_id);assert.equal(notes.rows[0].body,ADVISOR_NOTE);assert.equal(notes.rows[1].author_user_id,ownerUserId);assert.equal(notes.rows[1].share_grant_id,null);assert.equal(notes.rows[1].body,BUSINESS_NOTE);
    }finally{await pool.end();}
  }finally{await browser.close();}
  console.log("Advisor collaboration Chromium E2E passed: email invite -> fragment-safe login -> case.read + comment.create -> bidirectional append-only review thread with no Membership or organization API access.");
}finally{server.kill("SIGTERM");await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once("exit",resolve);setTimeout(()=>{if(server.exitCode===null)server.kill("SIGKILL");},3000).unref();});}

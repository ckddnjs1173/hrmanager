import fs from "node:fs";
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
const DOCUMENT_TITLE="징계 통지서 검토본";
const CHANGE_NOTE="근무장소 조항과 통지 문구를 수정해 주세요.";
const APPROVAL_NOTE="수정사항 반영을 확인했습니다. 검토 완료합니다.";
const ADVISOR_NOTE="외부 전문가 브라우저 검토 의견입니다.";
const BUSINESS_NOTE="회사 브라우저 확인 및 회신입니다.";
const PDF_V1=Buffer.from("%PDF-1.7\n% Insaya browser document v1\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF","utf8");
const PDF_V2=Buffer.from("%PDF-1.7\n% Insaya browser document v2 revised\n1 0 obj\n<< /Type /Catalog /Version /1.7 >>\nendobj\n%%EOF","utf8");

const migrationPool=createPostgresPool({applicationName:"insaya-advisor-ui-browser-migrate"});
await applyPostgresMigrations(migrationPool,{logger:{log(){}}});
await migrationPool.end();

const server=spawn(process.execPath,["server.js"],{env:{
  ...process.env,
  PORT:String(PORT),SITE_URL:BASE,STORAGE_DRIVER:"postgres",SAAS_ENABLED:"1",SAAS_AUTH_TOKEN_ECHO:"1",
  SAAS_SESSION_SECRET:"advisor-ui-browser-secret",SESSION_SECRET:"advisor-ui-legacy-secret",ADMIN_TOKEN:"advisor-ui-admin",
  DOCUMENT_STORAGE_SECRET:"advisor-ui-document-storage-secret-0123456789abcdef",
  NODE_ENV:"test",REQUIRE_PERSISTENT_DB:"0",PERSISTENT_STORAGE:"0",
},stdio:["ignore","pipe","pipe"]});
let serverOutput="";server.stdout.on("data",c=>serverOutput+=c.toString());server.stderr.on("data",c=>serverOutput+=c.toString());

async function waitForServer(){const deadline=Date.now()+20000;while(Date.now()<deadline){if(server.exitCode!==null)throw new Error(`server exited\n${serverOutput}`);try{const r=await fetch(`${BASE}/advisor.html`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error(`server timeout\n${serverOutput}`);}
function collectErrors(page){const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});page.on("pageerror",e=>errors.push(e.message));return errors;}
async function readDownload(download){const filePath=await download.path();assert.ok(filePath,"download path required");return fs.readFileSync(filePath);}

try{
  await waitForServer();
  const browser=await chromium.launch({headless:true});
  try{
    const ownerContext=await browser.newContext({viewport:{width:1440,height:1200},permissions:["clipboard-read","clipboard-write"]});
    const owner=await ownerContext.newPage();const ownerErrors=collectErrors(owner);
    await owner.goto(`${BASE}/business.html`,{waitUntil:"domcontentloaded"});
    await owner.locator("#login-view").waitFor({state:"visible"});
    await owner.locator("#login-email").fill(OWNER_EMAIL);await owner.locator("#login-form button[type=submit]").click();await owner.locator("#verify-magic").waitFor({state:"visible"});await owner.locator("#verify-magic").click();
    await owner.locator("#workspace-view").waitFor({state:"visible"});ownerErrors.length=0;
    await owner.locator("#org-dialog[open]").waitFor();await owner.locator('#org-form input[name="legalName"]').fill("Advisor UI E2E 주식회사");await owner.locator('#org-form input[name="displayName"]').fill("Advisor UI E2E");await owner.locator('#org-form button[type="submit"]').click();
    await owner.locator("#org-picker option").first().waitFor({state:"attached"});const organizationId=await owner.locator("#org-picker").inputValue();assert.ok(organizationId);

    await owner.locator('.nav-item[data-view="collaboration"]').click();
    await owner.locator("#view-collaboration").waitFor({state:"visible"});
    const safety=await owner.locator("#view-collaboration .collab-safety").innerText();assert.match(safety,/검토 문서/);assert.match(safety,/Membership/);
    await owner.locator('#business-case-form input[name="title"]').fill(CASE_TITLE);await owner.locator('#business-case-form textarea[name="summary"]').fill("징계 통보 전 절차와 문구의 적정성을 외부 전문가에게 확인합니다.");await owner.locator('#business-case-form button[type="submit"]').click();
    await owner.locator("#business-case-list").getByText(CASE_TITLE).waitFor({state:"visible"});
    const caseCard=owner.locator("#business-case-list .collab-case",{hasText:CASE_TITLE});await caseCard.getByRole("button",{name:"자문 시작"}).click();await caseCard.locator(".collab-chip.OPEN").waitFor({state:"visible"});
    const caseId=await caseCard.getAttribute("data-business-case-id");assert.ok(caseId);

    // Business: create document + upload encrypted v1 + request review.
    await caseCard.getByRole("button",{name:"문서 검토",exact:true}).click();
    const createDocForm=caseCard.locator(`[data-case-document-form="${caseId}"]`);await createDocForm.waitFor({state:"visible"});
    await createDocForm.locator('select[name="documentKind"]').selectOption("NOTICE");
    await createDocForm.locator('input[name="title"]').fill(DOCUMENT_TITLE);
    await createDocForm.locator('input[name="file"]').setInputFiles({name:"discipline-review-v1.pdf",mimeType:"application/pdf",buffer:PDF_V1});
    await createDocForm.getByRole("button",{name:"문서 추가"}).click();
    const documentCard=caseCard.locator(".doc-card",{hasText:DOCUMENT_TITLE});await documentCard.waitFor({state:"visible"});await documentCard.getByText("v1",{exact:true}).waitFor({state:"visible"});
    const documentId=await documentCard.getAttribute("data-document-id");assert.ok(documentId);
    await documentCard.getByRole("button",{name:"전문가 검토 요청"}).click();await documentCard.getByText("검토 중",{exact:true}).waitFor({state:"visible"});

    // Business: invite reviewer with Case/comment/document read+review only.
    await owner.locator("#advisor-case-select").selectOption(caseId);await owner.locator('#advisor-invite-form input[name="advisorEmail"]').fill(ADVISOR_EMAIL);await owner.locator('#advisor-invite-form select[name="grantDays"]').selectOption("30");await owner.locator('#advisor-invite-form button[type="submit"]').click();
    await owner.locator("#advisor-invite-link-box").waitFor({state:"visible"});const invitationUrl=await owner.locator("#advisor-invite-link").inputValue();assert.ok(invitationUrl.startsWith(`${BASE}/advisor.html#invite=`),invitationUrl);
    const inviteToken=new URL(invitationUrl).hash.replace(/^#invite=/,"");assert.ok(inviteToken.length>=32);
    const invitationText=await owner.locator("#advisor-invitation-list").innerText();assert.match(invitationText,new RegExp(ADVISOR_EMAIL));assert.match(invitationText,/문서 열람/);assert.match(invitationText,/문서 검토/);assert.doesNotMatch(invitationText,new RegExp(inviteToken.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
    assert.deepEqual(ownerErrors,[],`owner console errors before Advisor flow:\n${ownerErrors.join("\n")}`);

    // Advisor: fragment-safe login, invitation accept, exact document download, change request.
    const advisorContext=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});const advisor=await advisorContext.newPage();const advisorErrors=collectErrors(advisor);const advisorRequests=[];advisor.on("request",req=>advisorRequests.push(req.url()));
    await advisor.goto(invitationUrl,{waitUntil:"domcontentloaded"});
    await advisor.locator("#advisor-login").waitFor({state:"visible"});assert.equal(new URL(advisor.url()).hash,"","invitation token must be removed from visible URL after bootstrap");
    advisorErrors.length=0;
    await advisor.locator("#advisor-login-email").fill(ADVISOR_EMAIL);await advisor.locator('#advisor-login-form button[type="submit"]').click();await advisor.locator("#advisor-verify-magic").waitFor({state:"visible"});await advisor.locator("#advisor-verify-magic").click();
    await advisor.locator("#advisor-invite-view").waitFor({state:"visible"});const preview=await advisor.locator("#advisor-invite-preview").innerText();assert.match(preview,/Advisor UI E2E/);assert.match(preview,new RegExp(CASE_TITLE));assert.match(preview,/Case 열람/);assert.match(preview,/문서 열람/);assert.match(preview,/문서 검토/);
    await advisor.locator("#advisor-accept-invite").click();await advisor.locator("#advisor-workspace").waitFor({state:"visible"});await advisor.locator("#advisor-case-detail").getByText(CASE_TITLE).waitFor({state:"visible"});
    const advisorDoc=advisor.locator(".advisor-doc-card",{hasText:DOCUMENT_TITLE});await advisorDoc.waitFor({state:"visible"});await advisorDoc.getByText("v1",{exact:true}).waitFor({state:"visible"});
    const [v1Download]=await Promise.all([advisor.waitForEvent("download"),advisorDoc.getByRole("link",{name:"파일 다운로드"}).first().click()]);assert.deepEqual(await readDownload(v1Download),PDF_V1);
    const reviewForm=advisorDoc.locator("[data-advisor-document-review]");await reviewForm.locator('textarea[name="note"]').fill(CHANGE_NOTE);await reviewForm.getByRole("button",{name:"수정 요청"}).click();
    await advisor.locator("#advisor-case-detail").getByText("수정 요청됨",{exact:true}).waitFor({state:"visible"});await advisor.locator("#advisor-case-detail").getByText(CHANGE_NOTE).waitFor({state:"visible"});

    // Business: refresh, see requested change, upload immutable v2, resubmit.
    await caseCard.locator("[data-case-documents-refresh]").click();await caseCard.getByText("수정 필요",{exact:true}).waitFor({state:"visible"});await caseCard.getByText(CHANGE_NOTE).waitFor({state:"visible"});
    const revisedCard=caseCard.locator(".doc-card",{hasText:DOCUMENT_TITLE});const uploadForm=revisedCard.locator("[data-document-upload-form]");await uploadForm.locator('input[name="file"]').setInputFiles({name:"discipline-review-v2.pdf",mimeType:"application/pdf",buffer:PDF_V2});await uploadForm.getByRole("button",{name:"버전 추가"}).click();await revisedCard.getByText("v2",{exact:true}).waitFor({state:"visible"});
    await revisedCard.getByRole("button",{name:"수정본 검토 다시 요청"}).click();await revisedCard.getByText("검토 중",{exact:true}).waitFor({state:"visible"});

    // Advisor: refresh, download v2 and approve.
    await advisor.locator("[data-advisor-documents-refresh]").click();const advisorDocV2=advisor.locator(".advisor-doc-card",{hasText:DOCUMENT_TITLE});await advisorDocV2.getByText("v2",{exact:true}).waitFor({state:"visible"});
    const v2Link=advisorDocV2.locator(".advisor-doc-version",{hasText:"v2"}).getByRole("link",{name:"파일 다운로드"});const [v2Download]=await Promise.all([advisor.waitForEvent("download"),v2Link.click()]);assert.deepEqual(await readDownload(v2Download),PDF_V2);
    const approveForm=advisorDocV2.locator("[data-advisor-document-review]");await approveForm.locator('textarea[name="note"]').fill(APPROVAL_NOTE);await approveForm.getByRole("button",{name:"승인"}).click();await advisor.locator("#advisor-case-detail").getByText("검토 완료",{exact:true}).waitFor({state:"visible"});await advisor.locator("#advisor-case-detail").getByText(APPROVAL_NOTE).waitFor({state:"visible"});

    // Preserve bidirectional Case comment flow alongside document review.
    await advisor.locator("#advisor-review-form").waitFor({state:"visible"});await advisor.locator("#advisor-review-body").fill(ADVISOR_NOTE);await advisor.locator('#advisor-review-form button[type="submit"]').click();await advisor.locator("#advisor-case-detail").getByText(ADVISOR_NOTE).waitFor({state:"visible"});
    await caseCard.getByRole("button",{name:"Case 의견",exact:true}).click();await caseCard.locator(".collab-review-panel").waitFor({state:"visible"});await caseCard.getByText(ADVISOR_NOTE).waitFor({state:"visible"});
    await caseCard.locator('[data-case-note-form] textarea[name="body"]').fill(BUSINESS_NOTE);await caseCard.locator('[data-case-note-form] button[type="submit"]').click();await caseCard.getByText(BUSINESS_NOTE).waitFor({state:"visible"});
    await advisor.locator("[data-advisor-notes-refresh]").click();await advisor.locator("#advisor-case-detail").getByText(BUSINESS_NOTE).waitFor({state:"visible"});

    // Business: see approval, then revoke the already-accepted external access.
    await caseCard.locator("[data-case-documents-refresh]").click();await caseCard.getByText("검토 완료",{exact:true}).waitFor({state:"visible"});await caseCard.getByText(APPROVAL_NOTE).waitFor({state:"visible"});
    await owner.locator("#collaboration-refresh").click();const activeAccess=owner.locator("#advisor-active-grant-list");await activeAccess.getByText(CASE_TITLE).waitFor({state:"visible"});await activeAccess.getByRole("button",{name:"접근 종료"}).click();await activeAccess.getByText("현재 접근 중인 외부 전문가가 없습니다.").waitFor({state:"visible"});
    await advisor.locator("#advisor-refresh").click();await advisor.locator("#advisor-grant-list").getByText("현재 공유받은 Case가 없습니다.").waitFor({state:"visible"});

    assert.equal(advisorRequests.some(url=>url.includes("/api/saas/organizations/")),false,`advisor portal must not call organization APIs:\n${advisorRequests.join("\n")}`);
    assert.equal(advisorRequests.some(url=>url.includes("#invite=")),false,"URL fragment must never be transmitted in HTTP requests");
    assert.deepEqual(advisorErrors,[],`advisor console errors:\n${advisorErrors.join("\n")}`);
    assert.deepEqual(ownerErrors,[],`owner console errors:\n${ownerErrors.join("\n")}`);
    await advisorContext.close();await ownerContext.close();

    // Database-level audit assertions for the same browser journey.
    const pool=createPostgresPool({applicationName:"insaya-advisor-ui-browser-assert"});
    try{
      const advisorUser=await pool.query("SELECT id FROM users WHERE email_normalized=$1",[ADVISOR_EMAIL]);assert.equal(advisorUser.rowCount,1);const advisorUserId=advisorUser.rows[0].id;
      const ownerUser=await pool.query("SELECT id FROM users WHERE email_normalized=$1",[OWNER_EMAIL]);assert.equal(ownerUser.rowCount,1);const ownerUserId=ownerUser.rows[0].id;
      const membership=await pool.query("SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'",[organizationId,advisorUserId]);assert.equal(membership.rows[0].count,0,"advisor must not become an organization member");
      const invite=await pool.query("SELECT status,token_hash,share_grant_id FROM external_advisor_invitations WHERE organization_id=$1 AND resource_id=$2",[organizationId,caseId]);assert.equal(invite.rowCount,1);assert.equal(invite.rows[0].status,"ACCEPTED");assert.notEqual(invite.rows[0].token_hash,inviteToken);assert.match(invite.rows[0].token_hash,/^[a-f0-9]{64}$/);
      const grant=await pool.query("SELECT status,advisor_user_id,permissions FROM external_advisor_share_grants WHERE id=$1",[invite.rows[0].share_grant_id]);assert.equal(grant.rowCount,1);assert.equal(grant.rows[0].status,"REVOKED");assert.equal(grant.rows[0].advisor_user_id,advisorUserId);assert.deepEqual(grant.rows[0].permissions,["case.read","comment.create","document.read","document.review"]);

      const document=await pool.query("SELECT id,status FROM business_case_documents WHERE id=$1",[documentId]);assert.equal(document.rowCount,1);assert.equal(document.rows[0].status,"APPROVED");
      const versions=await pool.query("SELECT id,version_no,file_name,storage_state,scan_state FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no ASC",[documentId]);assert.equal(versions.rowCount,2);assert.deepEqual(versions.rows.map(row=>Number(row.version_no)),[1,2]);assert.equal(versions.rows.every(row=>row.storage_state==="VERIFIED"&&row.scan_state==="CLEAN"),true);
      const blobs=await pool.query("SELECT version_id FROM business_case_document_blobs WHERE version_id=ANY($1::text[])",[versions.rows.map(row=>row.id)]);assert.equal(blobs.rowCount,2);
      const reviews=await pool.query("SELECT decision,review_note FROM business_case_document_reviews WHERE document_id=$1 ORDER BY created_at ASC,id ASC",[documentId]);assert.deepEqual(reviews.rows.map(row=>row.decision),["CHANGES_REQUESTED","APPROVED"]);assert.deepEqual(reviews.rows.map(row=>row.review_note),[CHANGE_NOTE,APPROVAL_NOTE]);
      const storageEvents=await pool.query("SELECT event_type,actor_type FROM business_case_document_storage_events WHERE version_id=ANY($1::text[]) ORDER BY created_at ASC,id ASC",[versions.rows.map(row=>row.id)]);assert.equal(storageEvents.rows.some(row=>row.event_type==="DOWNLOAD_GRANT_CONSUMED"&&row.actor_type==="ADVISOR"),true);
      const notes=await pool.query("SELECT author_type,author_user_id,share_grant_id,body FROM business_case_review_notes WHERE business_case_id=$1 ORDER BY created_at ASC,id ASC",[caseId]);assert.equal(notes.rowCount,2);assert.deepEqual(notes.rows.map(row=>row.author_type),["ADVISOR","BUSINESS"]);assert.equal(notes.rows[0].author_user_id,advisorUserId);assert.equal(notes.rows[0].share_grant_id,invite.rows[0].share_grant_id);assert.equal(notes.rows[0].body,ADVISOR_NOTE);assert.equal(notes.rows[1].author_user_id,ownerUserId);assert.equal(notes.rows[1].share_grant_id,null);assert.equal(notes.rows[1].body,BUSINESS_NOTE);
    }finally{await pool.end();}
  }finally{await browser.close();}
  console.log("Advisor collaboration Chromium E2E passed: Case -> encrypted v1 -> Advisor download -> changes requested -> encrypted v2 -> approval -> Case comments -> Business access revoke, with no Membership or organization API access.");
}finally{server.kill("SIGTERM");await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once("exit",resolve);setTimeout(()=>{if(server.exitCode===null)server.kill("SIGKILL");},3000).unref();});}

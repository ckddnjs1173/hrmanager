import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProductionDeploymentConfig } from "../lib/production-deployment-contract.js";

const base={
  NODE_ENV:"production",STORAGE_DRIVER:"postgres",DATABASE_URL:"postgres://example",REQUIRE_PERSISTENT_DB:"1",PERSISTENT_STORAGE:"1",
  SAAS_ENABLED:"1",SAAS_SESSION_SECRET:"s".repeat(40),DOCUMENT_STORAGE_SECRET:"d".repeat(40),SITE_URL:"https://insaya.example.com",
  SAAS_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"re_secret",SAAS_EMAIL_FROM:"인사야 <no-reply@example.com>",SAAS_AUTH_TOKEN_ECHO:"0",
};

test("complete production SaaS environment passes",()=>{
  const result=evaluateProductionDeploymentConfig(base);assert.equal(result.ok,true);assert.deepEqual(result.errors,[]);
});

test("production SaaS refuses non-postgres or unverified persistence",()=>{
  const result=evaluateProductionDeploymentConfig({...base,STORAGE_DRIVER:"sqlite",DATABASE_URL:"",DB_PATH:"data/app.db",PERSISTENT_STORAGE:"0"});
  assert.equal(result.ok,false);assert.ok(result.errors.includes("saas_requires_postgres_runtime"));assert.ok(result.errors.includes("saas_requires_verified_persistent_storage"));
});

test("production SaaS requires strong secrets HTTPS and email delivery",()=>{
  const result=evaluateProductionDeploymentConfig({...base,SAAS_SESSION_SECRET:"short",DOCUMENT_STORAGE_SECRET:"short",SITE_URL:"http://insaya.example.com",RESEND_API_KEY:"",SAAS_EMAIL_FROM:""});
  for(const code of ["saas_session_secret_too_short","document_storage_secret_too_short","saas_https_site_url_required","resend_api_key_required","saas_email_from_required"])assert.ok(result.errors.includes(code));
});

test("production always forbids raw auth token echo",()=>{
  const result=evaluateProductionDeploymentConfig({...base,SAAS_ENABLED:"0",SAAS_AUTH_TOKEN_ECHO:"1"});assert.ok(result.errors.includes("saas_auth_token_echo_forbidden_in_production"));
});

test("non-production environments stay non-blocking",()=>{
  const result=evaluateProductionDeploymentConfig({NODE_ENV:"test",SAAS_ENABLED:"1",SAAS_AUTH_TOKEN_ECHO:"1"});assert.equal(result.ok,true);assert.equal(result.production,false);
});

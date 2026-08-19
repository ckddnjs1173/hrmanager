import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const render=fs.readFileSync(new URL("../render.yaml",import.meta.url),"utf8");

test("Render blueprint exposes production prerequisites but keeps SaaS fail-closed",()=>{
  for(const key of ["STORAGE_DRIVER","DATABASE_URL","REQUIRE_PERSISTENT_DB","PERSISTENT_STORAGE","DOCUMENT_STORAGE_SECRET","SAAS_ENABLED","SAAS_SESSION_SECRET","SAAS_AUTH_TOKEN_ECHO","SITE_URL","SAAS_EMAIL_PROVIDER","RESEND_API_KEY","SAAS_EMAIL_FROM"])assert.match(render,new RegExp(`key: ${key}`));
  assert.match(render,/key: SAAS_ENABLED\n\s+value: "0"/);
  assert.match(render,/key: SAAS_AUTH_TOKEN_ECHO\n\s+value: "0"/);
  assert.match(render,/key: REQUIRE_PERSISTENT_DB\n\s+value: "0"/);
  assert.match(render,/key: PERSISTENT_STORAGE\n\s+value: "0"/);
  assert.match(render,/key: STORAGE_DRIVER\n\s+value: "sqlite"/);
});

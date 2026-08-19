import test from "node:test";
import assert from "node:assert/strict";
import { transformUserFacingHtml } from "../lib/user-facing-page.js";

test("user-facing HTML injection adds assets once in stable locations",()=>{
  const html="<!doctype html><html><head><title>x</title></head><body><main>x</main></body></html>";
  const once=transformUserFacingHtml(html,{styles:["/ui.css"],scripts:["/ui.js"]});
  assert.match(once,/<link rel="stylesheet" href="\/ui\.css">\n<\/head>/);
  assert.match(once,/<script src="\/ui\.js"><\/script>\n<\/body>/);
  const twice=transformUserFacingHtml(once,{styles:["/ui.css"],scripts:["/ui.js"]});
  assert.equal((twice.match(/\/ui\.css/g)||[]).length,1);
  assert.equal((twice.match(/\/ui\.js/g)||[]).length,1);
});

test("user-facing body injection targets the real final closing body",()=>{
  const template="const printPage=()=>`<html><body><p>x</p></body></html>`;";
  const html=`<!doctype html><html><head><title>x</title></head><body><main>x</main><script>${template}</script></body></html>`;
  const transformed=transformUserFacingHtml(html,{scripts:["/runtime.js"]});
  const templateClose=transformed.indexOf("</body></html>`;");
  const runtimeIndex=transformed.indexOf('<script src="/runtime.js"></script>');
  const actualClose=transformed.lastIndexOf("</body>");

  assert.ok(templateClose>=0,"inline print template must remain intact");
  assert.ok(runtimeIndex>templateClose,"runtime script must not be injected inside the inline template");
  assert.ok(runtimeIndex<actualClose,"runtime script must be before the actual document closing body");
});

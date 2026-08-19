import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function inlineClassicScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] || "";
    const code = match[2] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "text/javascript";
    if (!/^(?:text|application)\/javascript$/i.test(type)) continue;
    scripts.push(code);
  }
  return scripts;
}

test("public home inline JavaScript is syntactically valid", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = inlineClassicScripts(html);
  assert.ok(scripts.length >= 1, "expected at least one executable inline script");
  scripts.forEach((code, index) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `index.html:inline-script-${index + 1}` }),
      `inline script ${index + 1} must parse before deployment`,
    );
  });
});

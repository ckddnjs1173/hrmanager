import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CLASSIC_CLIENT_FILES = [
  "product-ui.js",
  "privacy-delete-client.js",
  "content/home-navigation.js",
  "content/guide-catalog.js",
  "business-production-invite.js",
  "business-ui-copy.js",
  "advisor-production-auth.js",
];

test("injected user-facing classic scripts are syntactically valid", () => {
  for (const file of CLASSIC_CLIENT_FILES) {
    const code = fs.readFileSync(file, "utf8");
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: file }),
      `${file} must parse before deployment`,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "../lib/validators.js";

test("rejects empty, null, undefined, and whitespace-only values", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail("   "), false);
});

test("rejects a string with no @", () => {
  assert.equal(isValidEmail("not-an-email"), false);
});

test("accepts any non-empty string containing @ (matches the previous duplicated behavior across call sites)", () => {
  assert.equal(isValidEmail("a@b"), true);
  assert.equal(isValidEmail("user@example.com"), true);
  assert.equal(isValidEmail("  user@example.com  "), true);
});

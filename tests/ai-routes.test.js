import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiRouter, sanitizeMessages } from "../lib/ai-routes.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("AI message sanitizer preserves only bounded user/assistant content", () => {
  const input = [
    { role: "system", content: "drop" },
    ...Array.from({ length: 31 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `${index}:` + "x".repeat(5000) })),
    { role: "user", content: 1234 },
  ];
  const messages = sanitizeMessages(input);
  assert.equal(messages.length, 30);
  assert.ok(messages.every((message) => ["user", "assistant"].includes(message.role)));
  assert.ok(messages.every((message) => typeof message.content === "string" && message.content.length <= 4000));
  assert.equal(messages.at(-1).role, "user");
});

test("AI router requires the server rate-limit factory", () => {
  assert.throws(() => createAiRouter({}), /ai_router_rate_limit_required/);
});

test("server delegates chat and summary endpoints to the extracted AI router", () => {
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(server, /import \{ createAiRouter \} from "\.\/lib\/ai-routes\.js"/);
  assert.match(server, /app\.use\("\/api", createAiRouter\(\{ rateLimit \}\)\)/);
  assert.doesNotMatch(server, /app\.post\("\/api\/chat"/);
  assert.doesNotMatch(server, /app\.post\("\/api\/summary"/);
  assert.doesNotMatch(server, /function sanitizeMessages/);
  assert.doesNotMatch(server, /function resolveKnowledge/);
});

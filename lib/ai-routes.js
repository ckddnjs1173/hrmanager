import express from "express";
import { AI_ENABLED, streamChat, createSummary, classifyTopicsAI } from "./ai.js";
import { buildKnowledgeFromIds, classifyTopics } from "./knowledge.js";
import { SYSTEM_PROMPT, SUMMARY_SCHEMA, SUMMARY_INSTRUCTION } from "./prompt.js";

export async function resolveKnowledge(messages) {
  const users = messages.filter((message) => message.role === "user").map((message) => message.content);
  const text = (users.slice(-1)[0] || "") + " " + users.join(" ");
  const keywordIds = classifyTopics(text);
  if (keywordIds.length) return buildKnowledgeFromIds(keywordIds);
  const aiIds = await classifyTopicsAI(text);
  return buildKnowledgeFromIds(aiIds || []);
}

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-30)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
}

export function createAiRouter({ rateLimit }) {
  if (typeof rateLimit !== "function") throw new Error("ai_router_rate_limit_required");

  const router = express.Router();

  router.post("/chat", rateLimit({ windowMs: 60000, max: 12 }), async (req, res) => {
    if (!AI_ENABLED) return res.status(503).json({ error: "no_api_key" });
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages.length || messages[0].role !== "user") {
      return res.status(400).json({ error: "first message must be user" });
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    try {
      const system = SYSTEM_PROMPT + await resolveKnowledge(messages);
      await streamChat({
        system,
        messages,
        maxTokens: 1600,
        onText: (delta) => res.write(delta),
      });
      return res.end();
    } catch (error) {
      console.error("chat error:", error?.message || error);
      const rateLimited = /\b429\b|quota|rate/i.test(String(error?.message || ""));
      if (!res.headersSent) return res.status(rateLimited ? 429 : 500).json({ error: rateLimited ? "rate_limited" : "ai_error" });
      return res.end(rateLimited ? "\n\n(지금 이용자가 많아 잠시 후 다시 시도해 주세요.)" : "\n\n(일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.)");
    }
  });

  router.post("/summary", rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
    if (!AI_ENABLED) return res.status(503).json({ error: "no_api_key" });
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages.length) return res.status(400).json({ error: "no_messages" });
    try {
      const system = SYSTEM_PROMPT + await resolveKnowledge(messages);
      const summary = await createSummary({
        system,
        messages,
        instruction: SUMMARY_INSTRUCTION,
        schema: SUMMARY_SCHEMA,
        maxTokens: 1500,
      });
      return res.json(summary);
    } catch (error) {
      console.error("summary error:", error?.message || error);
      return res.status(500).json({ error: "ai_error" });
    }
  });

  return router;
}

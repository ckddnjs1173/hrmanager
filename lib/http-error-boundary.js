import crypto from "node:crypto";

export function createRequestContextMiddleware({ idFactory = () => crypto.randomUUID() } = {}) {
  return (req, res, next) => {
    const requestId = String(idFactory() || crypto.randomUUID());
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  };
}

function classifyError(error) {
  const status = Number(error?.status || error?.statusCode);
  if (status === 400 && error?.type === "entity.parse.failed") {
    return { status: 400, code: "invalid_json" };
  }
  if (status === 413) return { status: 413, code: "payload_too_large" };
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return { status, code: "bad_request" };
  }
  return { status: 500, code: "internal_error" };
}

export function createApplicationErrorHandler({
  warn = console.warn,
  renderHtml = ({ requestId }) => `<!doctype html><html><body><h1>문제가 발생했습니다.</h1><p>요청 ID: ${requestId}</p></body></html>`,
} = {}) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    const requestId = String(req.requestId || "unavailable");
    const { status, code } = classifyError(error);
    res.setHeader("Cache-Control", "no-store");
    if (status >= 500) {
      warn(`request error [${requestId}] ${req.method || ""} ${req.path || req.url || ""}:`, error?.message || error);
    }

    if (String(req.path || req.url || "").startsWith("/api/")) {
      return res.status(status).json({ error: code, requestId });
    }

    return res
      .status(status)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(renderHtml({ requestId, status, code }));
  };
}

import crypto from "node:crypto";

export const DEFAULT_SESSION_TTL = 12 * 3600 * 1000;

export function createSessionSecurity({ env = process.env, sessionTtl = DEFAULT_SESSION_TTL } = {}) {
  const isProduction = env.NODE_ENV === "production";
  const generatedAdminToken = isProduction && !env.ADMIN_TOKEN;
  const adminToken = env.ADMIN_TOKEN || (generatedAdminToken ? crypto.randomBytes(24).toString("hex") : "admin");
  const sessionSecret = env.SESSION_SECRET || `${adminToken}::nomu-session`;
  const requestedTtl = Number(sessionTtl);
  const effectiveSessionTtl = Number.isFinite(requestedTtl) && requestedTtl > 0 ? Math.floor(requestedTtl) : DEFAULT_SESSION_TTL;

  function parseCookies(req) {
    const out = {};
    const header = req?.headers?.cookie;
    if (!header) return out;
    for (const part of String(header).split(";")) {
      const index = part.indexOf("=");
      if (index < 0) continue;
      const name = part.slice(0, index).trim();
      if (!name) continue;
      const rawValue = part.slice(index + 1).trim();
      try {
        out[name] = decodeURIComponent(rawValue);
      } catch {
        // A malformed percent-encoded cookie is invalid input, not a server error. Ignore
        // only that cookie so unrelated valid authentication/session cookies still work.
      }
    }
    return out;
  }

  function signSession(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  function verifySession(token) {
    if (typeof token !== "string" || token.length < 3 || token.length > 8192) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    if (!body || !signature || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;

    const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      return Number.isFinite(payload?.exp) && payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  function setSessionCookie(req, res, payload, name = "nomu_sess") {
    const secure = req.secure ? " Secure;" : "";
    const maxAge = Math.max(1, Math.floor(effectiveSessionTtl / 1000));
    res.setHeader("Set-Cookie", `${name}=${signSession(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge};${secure}`);
  }

  function clearSessionCookie(res, name = "nomu_sess") {
    res.setHeader("Set-Cookie", `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }

  return {
    adminToken,
    generatedAdminToken,
    sessionSecret,
    sessionTtl: effectiveSessionTtl,
    parseCookies,
    signSession,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
  };
}
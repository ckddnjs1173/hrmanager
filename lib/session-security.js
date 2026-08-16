import crypto from "node:crypto";

export const DEFAULT_SESSION_TTL = 12 * 3600 * 1000;

export function createSessionSecurity({ env = process.env, sessionTtl = DEFAULT_SESSION_TTL } = {}) {
  const isProduction = env.NODE_ENV === "production";
  const generatedAdminToken = isProduction && !env.ADMIN_TOKEN;
  const adminToken = env.ADMIN_TOKEN || (generatedAdminToken ? crypto.randomBytes(24).toString("hex") : "admin");
  const sessionSecret = env.SESSION_SECRET || `${adminToken}::nomu-session`;

  function parseCookies(req) {
    const out = {};
    const header = req.headers.cookie;
    if (!header) return out;
    for (const part of header.split(";")) {
      const index = part.indexOf("=");
      if (index < 0) continue;
      out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return out;
  }

  function signSession(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  function verifySession(token) {
    if (!token || !token.includes(".")) return null;
    const [body, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      return payload.exp && payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  function setSessionCookie(req, res, payload, name = "nomu_sess") {
    const secure = req.secure ? " Secure;" : "";
    res.setHeader("Set-Cookie", `${name}=${signSession(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtl / 1000};${secure}`);
  }

  function clearSessionCookie(res, name = "nomu_sess") {
    res.setHeader("Set-Cookie", `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  }

  return {
    adminToken,
    generatedAdminToken,
    sessionSecret,
    sessionTtl,
    parseCookies,
    signSession,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
  };
}
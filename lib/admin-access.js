import crypto from "node:crypto";

export function createAdminAccess({ adminToken, parseCookies, verifySession } = {}) {
  if (typeof adminToken !== "string" || !adminToken) throw new Error("admin_access_admin_token_required");
  if (typeof parseCookies !== "function") throw new Error("admin_access_parse_cookies_required");
  if (typeof verifySession !== "function") throw new Error("admin_access_verify_session_required");

  function tokenOk(token) {
    if (!token || token.length !== adminToken.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
    } catch {
      return false;
    }
  }

  function adminAuth(req, res, next) {
    if (tokenOk(req.get("x-admin-token") || "")) {
      req.adminAccess = "token";
      return next();
    }
    const session = verifySession(parseCookies(req).nomu_sess);
    if (!session) return res.status(401).json({ error: "unauthorized" });
    if (req.method !== "GET" && (req.get("x-csrf-token") || "") !== session.csrf) {
      return res.status(403).json({ error: "csrf" });
    }
    req.adminSession = session;
    req.adminAccess = "session";
    return next();
  }

  return { tokenOk, adminAuth };
}

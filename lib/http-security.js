export function createHttpSecurityMiddleware() {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Origin-Agent-Cluster", "?1");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; " +
      "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
      "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; " +
      "manifest-src 'self'; worker-src 'self'",
    );
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  };
}
export function createRateLimiter({ cleanupIntervalMs = 300000, now = () => Date.now() } = {}) {
  const store = new Map();

  function rateLimit({ windowMs = 60000, max = 30 } = {}) {
    return (req, res, next) => {
      const key = `${req.ip || "ip"}:${req.path}`;
      const current = now();
      let entry = store.get(key);
      if (!entry || entry.reset < current) {
        entry = { count: 0, reset: current + windowMs };
        store.set(key, entry);
      }
      entry.count += 1;
      if (entry.count > max) {
        res.setHeader("Retry-After", Math.max(1, Math.ceil((entry.reset - current) / 1000)));
        return res.status(429).json({ error: "too_many_requests" });
      }
      return next();
    };
  }

  function sweep() {
    const current = now();
    for (const [key, entry] of store) if (entry.reset < current) store.delete(key);
  }

  const timer = setInterval(sweep, cleanupIntervalMs);
  timer.unref?.();

  return {
    rateLimit,
    sweep,
    stop: () => clearInterval(timer),
  };
}
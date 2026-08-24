const BLOCKED_TOP_LEVEL = new Set([
  ".github",
  "backups",
  "db",
  "docs",
  "lib",
  "node_modules",
  "scripts",
  "test",
  "tests",
]);

const BLOCKED_ROOT_FILES = new Set([
  ".env",
  ".env.example",
  ".env.local",
  ".gitignore",
  "package-lock.json",
  "package.json",
  "procfile",
  "readme.md",
  "render.yaml",
  "server.js",
]);

const PRIVATE_FILE_PATTERN = /(?:\.db(?:-shm|-wal)?|\.sqlite3?|\.sql|\.backup|\.log)$/i;
const PUBLIC_DATA_FILES = new Set(["/data/nomusa.json"]);

function normalizePath(rawPath) {
  let value = String(rawPath || "/").split("?", 1)[0].replace(/\\/g, "/");
  try {
    // Express/static will decode URL components before resolving a file. Decode twice so
    // double-encoded traversal/private prefixes cannot bypass this guard.
    for (let i = 0; i < 2; i += 1) {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    }
  } catch {
    return null;
  }
  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  return value;
}

export function isPrivateStaticPath(rawPath) {
  const normalized = normalizePath(rawPath);
  if (!normalized || normalized.includes("\0")) return true;

  const lower = normalized.toLowerCase();
  const segments = lower.split("/").filter(Boolean);
  if (!segments.length) return false;
  if (segments.some((segment) => segment === ".." || segment.startsWith("."))) return true;

  const first = segments[0];
  if (BLOCKED_TOP_LEVEL.has(first)) return true;
  if (segments.length === 1 && BLOCKED_ROOT_FILES.has(first)) return true;
  if (first === "data" && !PUBLIC_DATA_FILES.has(lower)) return true;
  if (PRIVATE_FILE_PATTERN.test(lower)) return true;

  return false;
}

export function createPublicStaticGuard() {
  return (req, res, next) => {
    if (!isPrivateStaticPath(req.path || req.url)) return next();
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).end();
  };
}

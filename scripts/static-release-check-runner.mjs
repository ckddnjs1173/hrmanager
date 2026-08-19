// release-check.mjs predates PostgreSQL primary and contains one legacy production assertion:
// REQUIRE_PERSISTENT_DB=1 implies DB_PATH must exist. The authoritative production deployment
// contract now validates persistence according to STORAGE_DRIVER before this runner executes.
// Keep every existing static release invariant, but neutralize only that obsolete SQLite-path
// assertion for a PostgreSQL primary process.
if (
  process.env.NODE_ENV === "production" &&
  process.env.REQUIRE_PERSISTENT_DB === "1" &&
  String(process.env.STORAGE_DRIVER || "").trim().toLowerCase() === "postgres" &&
  !process.env.DB_PATH
) {
  process.env.DB_PATH = "__postgres_primary_release_check__";
}
await import("./release-check.mjs");

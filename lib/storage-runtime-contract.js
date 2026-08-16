export const CURRENT_STORAGE_RUNTIME_MODES = Object.freeze(["sqlite", "postgres-shadow", "postgres"]);

export function resolveStorageRuntimeMode(env = process.env) {
  const requested = String(env.STORAGE_DRIVER || "sqlite").trim().toLowerCase();
  if (!CURRENT_STORAGE_RUNTIME_MODES.includes(requested)) {
    throw new Error(`unsupported_storage_driver:${requested}`);
  }
  if (requested === "postgres" && !String(env.DATABASE_URL || "").trim()) {
    throw new Error("database_url_required_for_postgres_runtime");
  }
  return requested;
}

export function describeStorageRuntime(env = process.env) {
  const mode = resolveStorageRuntimeMode(env);
  return Object.freeze({
    mode,
    primary: mode === "postgres" ? "postgres" : "sqlite",
    postgresShadow: mode === "postgres-shadow",
    postgresProductionEnabled: mode === "postgres",
  });
}

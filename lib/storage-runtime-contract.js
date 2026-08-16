export const CURRENT_STORAGE_RUNTIME_MODES = Object.freeze(["sqlite", "postgres-shadow"]);

export function resolveStorageRuntimeMode(env = process.env) {
  const requested = String(env.STORAGE_DRIVER || "sqlite").trim().toLowerCase();
  if (!CURRENT_STORAGE_RUNTIME_MODES.includes(requested)) {
    if (requested === "postgres") throw new Error("postgres_runtime_not_enabled: async repository cutover is required first");
    throw new Error(`unsupported_storage_driver:${requested}`);
  }
  return requested;
}

export function describeStorageRuntime(env = process.env) {
  const mode = resolveStorageRuntimeMode(env);
  return Object.freeze({
    mode,
    primary: "sqlite",
    postgresShadow: mode === "postgres-shadow",
    postgresProductionEnabled: false,
  });
}

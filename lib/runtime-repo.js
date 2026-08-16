import crypto from "node:crypto";
import { createPostgresPool, withPostgresTransaction } from "./postgres-client.js";
import { resolveStorageRuntimeMode } from "./storage-runtime-contract.js";

export const EVENT_TYPES = Object.freeze(["view", "calc", "doc", "pack", "booking_start", "booking", "lead", "nomu_view"]);

const mode = resolveStorageRuntimeMode();
let sqliteModulesPromise = null;
let postgresPool = null;

function nowISO() { return new Date().toISOString(); }
function genId(prefix = "r") { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
const sha = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

function iso(value) {
  if (value == null || value === "") return value ?? null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapBooking(row) {
  return row ? {
    ...row,
    at: iso(row.at),
    expires: iso(row.expires),
    deleted_at: iso(row.deleted_at),
    consent: !!row.consent,
  } : null;
}

function mapTimestampFields(row, fields = []) {
  if (!row) return row;
  const out = { ...row };
  for (const field of fields) if (field in out) out[field] = iso(out[field]);
  return out;
}

async function sqliteModules() {
  if (!sqliteModulesPromise) {
    sqliteModulesPromise = Promise.all([import("./repo.js"), import("./db.js")]).then(([repo, db]) => ({ repo, db }));
  }
  return sqliteModulesPromise;
}

function pg() {
  if (!postgresPool) postgresPool = createPostgresPool({ applicationName: "insaya-runtime" });
  return postgresPool;
}

async function sqliteCall(section, method, ...args) {
  const { repo } = await sqliteModules();
  return repo[section][method](...args);
}

function usePostgres() { return mode === "postgres"; }

export async function closeRuntimeStorage() {
  if (postgresPool) {
    const pool = postgresPool;
    postgresPool = null;
    await pool.end();
  }
}

export const bookings = {
  async insert(rec) {
    if (!usePostgres()) return sqliteCall("bookings", "insert", rec);
    const id = genId("b");
    const row = {
      id, at: nowISO(), status: "received",
      name: rec.name || "", contact: rec.contact || "", nomu: rec.nomu || "",
      message: rec.message || "", summary: rec.summary || "", consent: !!rec.consent,
      assigned: "", assigned_nomusa_id: "", memo: "", token: rec.token || "",
      expires: rec.expires || null, deleted_at: null,
    };
    await withPostgresTransaction(pg(), async (client) => {
      await client.query(`INSERT INTO bookings
        (id,at,status,name,contact,nomu,message,summary,consent,assigned,assigned_nomusa_id,memo,token,expires,deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [row.id,row.at,row.status,row.name,row.contact,row.nomu,row.message,row.summary,row.consent,row.assigned,row.assigned_nomusa_id,row.memo,row.token,row.expires,row.deleted_at]);
      await client.query("INSERT INTO booking_events (booking_id,at,type,actor,note) VALUES ($1,$2,$3,$4,$5)", [id, nowISO(), "created", "user", ""]);
    });
    return row;
  },
  async all() {
    if (!usePostgres()) return sqliteCall("bookings", "all");
    const r = await pg().query("SELECT * FROM bookings WHERE deleted_at IS NULL ORDER BY at ASC");
    return r.rows.map(mapBooking);
  },
  async list({ status = "", q = "", page = 1, size = 50 } = {}) {
    if (!usePostgres()) return sqliteCall("bookings", "list", { status, q, page, size });
    const where = ["deleted_at IS NULL"]; const args = [];
    if (status && status !== "all") {
      if (status === "open") where.push("status NOT IN ('done','canceled')");
      else { args.push(status); where.push(`status = $${args.length}`); }
    }
    if (q) { args.push(`%${q}%`); where.push(`(name ILIKE $${args.length} OR contact ILIKE $${args.length} OR nomu ILIKE $${args.length})`); }
    const safeSize = Math.max(1, Math.min(200, Number(size) || 50));
    const safePage = Math.max(1, Number(page) || 1);
    const w = `WHERE ${where.join(" AND ")}`;
    const count = await pg().query(`SELECT COUNT(*)::int c FROM bookings ${w}`, args);
    const listArgs = [...args, safeSize, (safePage - 1) * safeSize];
    const rows = await pg().query(`SELECT * FROM bookings ${w} ORDER BY at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, listArgs);
    return { items: rows.rows.map(mapBooking), total: Number(count.rows[0]?.c || 0), page: safePage, size: safeSize };
  },
  async get(id) {
    if (!usePostgres()) return sqliteCall("bookings", "get", id);
    const r = await pg().query("SELECT * FROM bookings WHERE id=$1", [id]);
    return mapBooking(r.rows[0] || null);
  },
  async byToken(token) {
    if (!usePostgres()) return sqliteCall("bookings", "byToken", token);
    const r = await pg().query("SELECT * FROM bookings WHERE token=$1 AND deleted_at IS NULL", [token]);
    return mapBooking(r.rows[0] || null);
  },
  async byNomusa(nomusaId) {
    if (!usePostgres()) return sqliteCall("bookings", "byNomusa", nomusaId);
    const r = await pg().query("SELECT * FROM bookings WHERE assigned_nomusa_id=$1 AND deleted_at IS NULL ORDER BY at DESC", [nomusaId]);
    return r.rows.map(mapBooking);
  },
  async update(id, fields, actor = "operator") {
    if (!usePostgres()) return sqliteCall("bookings", "update", id, fields, actor);
    const allow = ["status", "assigned", "assigned_nomusa_id", "memo", "deleted_at"];
    const keys = allow.filter((key) => key in (fields || {}));
    if (!keys.length) return false;
    const values = keys.map((key) => fields[key]);
    values.push(id);
    const sets = keys.map((key, index) => `"${key}"=$${index + 1}`).join(",");
    const r = await pg().query(`UPDATE bookings SET ${sets} WHERE id=$${values.length}`, values);
    if (!r.rowCount) return false;
    await this.logEvent(id, fields.status ? `status:${fields.status}` : "update", actor, fields.status ? "" : keys.join(","));
    return true;
  },
  async logEvent(bookingId, type, actor = "", note = "") {
    if (!usePostgres()) return sqliteCall("bookings", "logEvent", bookingId, type, actor, note);
    await pg().query("INSERT INTO booking_events (booking_id,at,type,actor,note) VALUES ($1,$2,$3,$4,$5)", [bookingId, nowISO(), type, actor, note]);
  },
  async events(bookingId) {
    if (!usePostgres()) return sqliteCall("bookings", "events", bookingId);
    const r = await pg().query("SELECT * FROM booking_events WHERE booking_id=$1 ORDER BY at,id", [bookingId]);
    return r.rows.map((row) => mapTimestampFields(row, ["at"]));
  },
};

export const leads = {
  async insert(rec) {
    if (!usePostgres()) return sqliteCall("leads", "insert", rec);
    const row = { id: genId("l"), at: nowISO(), kind: rec.kind || "general", name: rec.name || "", contact: rec.contact || "", message: rec.message || "", status: "new" };
    await pg().query("INSERT INTO leads (id,at,kind,name,contact,message,status) VALUES ($1,$2,$3,$4,$5,$6,$7)", Object.values(row));
    return row;
  },
  async all() {
    if (!usePostgres()) return sqliteCall("leads", "all");
    const r = await pg().query("SELECT * FROM leads ORDER BY at ASC");
    return r.rows.map((row) => mapTimestampFields(row, ["at"]));
  },
  async list({ kind = "", page = 1, size = 100 } = {}) {
    if (!usePostgres()) return sqliteCall("leads", "list", { kind, page, size });
    const args = []; let where = "";
    if (kind && kind !== "all") { args.push(kind); where = "WHERE kind=$1"; }
    const safeSize = Math.max(1, Math.min(200, Number(size) || 100));
    const safePage = Math.max(1, Number(page) || 1);
    const count = await pg().query(`SELECT COUNT(*)::int c FROM leads ${where}`, args);
    const listArgs = [...args, safeSize, (safePage - 1) * safeSize];
    const r = await pg().query(`SELECT * FROM leads ${where} ORDER BY at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, listArgs);
    return { items: r.rows.map((row) => mapTimestampFields(row, ["at"])), total: Number(count.rows[0]?.c || 0) };
  },
};

export const nomusa = {
  async count() {
    if (!usePostgres()) return sqliteCall("nomusa", "count");
    const r = await pg().query("SELECT COUNT(*)::int c FROM nomusa"); return Number(r.rows[0]?.c || 0);
  },
  async upsert(rec) {
    if (!usePostgres()) return sqliteCall("nomusa", "upsert", rec);
    const sido = (rec.loc || "").split(" ")[0] || "";
    const doc = { ...rec };
    await pg().query(`INSERT INTO nomusa (id,name,loc,sido,opted_out,featured,doc) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,loc=EXCLUDED.loc,sido=EXCLUDED.sido,doc=EXCLUDED.doc`,
    [rec.id, rec.n || rec.name || "", rec.loc || "", sido, !!rec.opted_out, !!rec.featured, doc]);
  },
  async replaceAll(arr) {
    if (!usePostgres()) return sqliteCall("nomusa", "replaceAll", arr);
    await withPostgresTransaction(pg(), async (client) => {
      await client.query("DELETE FROM nomusa");
      for (const rec of arr) {
        const sido = (rec.loc || "").split(" ")[0] || "";
        await client.query("INSERT INTO nomusa (id,name,loc,sido,opted_out,featured,doc) VALUES ($1,$2,$3,$4,$5,$6,$7)", [rec.id, rec.n || rec.name || "", rec.loc || "", sido, !!rec.opted_out, !!rec.featured, { ...rec }]);
      }
    });
  },
  async publicList({ region = "" } = {}) {
    if (!usePostgres()) return sqliteCall("nomusa", "publicList", { region });
    const args = []; let where = "WHERE opted_out=FALSE";
    if (region) { args.push(`%${region}%`); where += ` AND loc ILIKE $1`; }
    const r = await pg().query(`SELECT doc,featured FROM nomusa ${where} ORDER BY featured DESC,name`, args);
    return r.rows.map((row) => ({ ...(row.doc || {}), featured: !!row.featured }));
  },
  async adminList() {
    if (!usePostgres()) return sqliteCall("nomusa", "adminList");
    const r = await pg().query("SELECT doc,featured,opted_out FROM nomusa ORDER BY featured DESC,name");
    return r.rows.map((row) => ({ ...(row.doc || {}), featured: !!row.featured, opted_out: !!row.opted_out }));
  },
  async get(id) {
    if (!usePostgres()) return sqliteCall("nomusa", "get", id);
    const r = await pg().query("SELECT doc FROM nomusa WHERE id=$1", [id]); return r.rows[0]?.doc || null;
  },
  async toggle(id, field, val) {
    if (!["opted_out", "featured"].includes(field)) return false;
    if (!usePostgres()) return sqliteCall("nomusa", "toggle", id, field, val);
    const r = await pg().query(`UPDATE nomusa SET "${field}"=$1, doc=jsonb_set(COALESCE(doc,'{}'::jsonb), $2::text[], to_jsonb($1::boolean), true) WHERE id=$3`, [!!val, [field], id]);
    return r.rowCount > 0;
  },
};

export const accessLogs = {
  async add({ booking_id, token, ip_hash, ua }) {
    if (!usePostgres()) return sqliteCall("accessLogs", "add", { booking_id, token, ip_hash, ua });
    await pg().query("INSERT INTO access_logs (booking_id,token,at,ip_hash,ua) VALUES ($1,$2,$3,$4,$5)", [booking_id || "", token || "", nowISO(), ip_hash || "", String(ua || "").slice(0,300)]);
  },
  async forBooking(id) {
    if (!usePostgres()) return sqliteCall("accessLogs", "forBooking", id);
    const r = await pg().query("SELECT at,ip_hash FROM access_logs WHERE booking_id=$1 ORDER BY at", [id]);
    return r.rows.map((row) => mapTimestampFields(row, ["at"]));
  },
};

export const events = {
  async add(type, ref = "", meta = null) {
    if (!EVENT_TYPES.includes(type) && type !== "privacy_delete") return;
    if (!usePostgres()) {
      const { repo } = await sqliteModules();
      if (repo.EVENT_TYPES.includes(type)) return repo.events.add(type, ref, meta);
      const { db } = await sqliteModules();
      db.db.prepare("INSERT INTO events (at,type,ref,meta) VALUES (?,?,?,?)").run(nowISO(), type, ref, meta ? JSON.stringify(meta) : null);
      return;
    }
    await pg().query("INSERT INTO events (at,type,ref,meta) VALUES ($1,$2,$3,$4)", [nowISO(), type, ref, meta]);
  },
  async stats(days = 30) {
    if (!usePostgres()) return sqliteCall("events", "stats", days);
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const r = await pg().query("SELECT type,COUNT(*)::int c FROM events WHERE at >= $1 GROUP BY type", [since]);
    return Object.fromEntries(r.rows.map((row) => [row.type, Number(row.c)]));
  },
};

export const partners = {
  async issue(nomusaId, name) {
    if (!usePostgres()) return sqliteCall("partners", "issue", nomusaId, name);
    const token = crypto.randomBytes(24).toString("hex");
    await withPostgresTransaction(pg(), async (client) => {
      await client.query("DELETE FROM nomusa_accounts WHERE nomusa_id=$1", [nomusaId]);
      await client.query("INSERT INTO nomusa_accounts (nomusa_id,name,token_hash,created_at) VALUES ($1,$2,$3,$4)", [nomusaId, name || "", sha(token), nowISO()]);
    });
    return token;
  },
  async verify(token) {
    if (!usePostgres()) return sqliteCall("partners", "verify", token);
    if (!token) return null;
    const r = await pg().query("SELECT * FROM nomusa_accounts WHERE token_hash=$1", [sha(token)]);
    return mapTimestampFields(r.rows[0] || null, ["created_at", "last_login"]);
  },
  async touch(id) {
    if (!usePostgres()) return sqliteCall("partners", "touch", id);
    await pg().query("UPDATE nomusa_accounts SET last_login=$1 WHERE id=$2", [nowISO(), id]);
  },
  async byNomusaId(nomusaId) {
    if (!usePostgres()) return sqliteCall("partners", "byNomusaId", nomusaId);
    const r = await pg().query("SELECT id,nomusa_id,name,created_at,last_login FROM nomusa_accounts WHERE nomusa_id=$1", [nomusaId]);
    return mapTimestampFields(r.rows[0] || null, ["created_at", "last_login"]);
  },
  async all() {
    if (!usePostgres()) return sqliteCall("partners", "all");
    const r = await pg().query("SELECT id,nomusa_id,name,created_at,last_login FROM nomusa_accounts");
    return r.rows.map((row) => mapTimestampFields(row, ["created_at", "last_login"]));
  },
};

export const privacy = {
  async deleteByToken(token) {
    if (!usePostgres()) return sqliteCall("privacy", "deleteByToken", token);
    const r = await pg().query("SELECT id FROM bookings WHERE token=$1 AND deleted_at IS NULL", [token]);
    if (!r.rows[0]) return 0;
    const at = nowISO();
    await pg().query("UPDATE bookings SET deleted_at=$1 WHERE id=$2", [at, r.rows[0].id]);
    await bookings.logEvent(r.rows[0].id, "deleted:user", "user");
    return 1;
  },
  async deleteByContact(contact) {
    if (!usePostgres()) return sqliteCall("privacy", "deleteByContact", contact);
    return withPostgresTransaction(pg(), async (client) => {
      const bs = await client.query("SELECT id FROM bookings WHERE contact=$1 AND deleted_at IS NULL", [contact]);
      const at = nowISO();
      for (const row of bs.rows) {
        await client.query("UPDATE bookings SET deleted_at=$1 WHERE id=$2", [at, row.id]);
        await client.query("INSERT INTO booking_events (booking_id,at,type,actor,note) VALUES ($1,$2,$3,$4,$5)", [row.id, at, "deleted:request", "user", ""]);
      }
      const ls = await client.query("DELETE FROM leads WHERE contact=$1", [contact]);
      await client.query("INSERT INTO events (at,type,ref,meta) VALUES ($1,$2,$3,$4)", [at, "privacy_delete", "", { bookings: bs.rowCount, leads: ls.rowCount }]);
      return bs.rowCount + ls.rowCount;
    });
  },
};

export const feedback = {
  async add({ kind = "answer", ref = "", message = "" }) {
    if (!usePostgres()) return sqliteCall("feedback", "add", { kind, ref, message });
    await pg().query("INSERT INTO feedback (at,kind,ref,message,status) VALUES ($1,$2,$3,$4,'new')", [nowISO(), kind, String(ref).slice(0,80), String(message).slice(0,2000)]);
  },
  async recent(n = 50) {
    if (!usePostgres()) return sqliteCall("feedback", "recent", n);
    const r = await pg().query("SELECT * FROM feedback ORDER BY at DESC LIMIT $1", [Math.max(1, Math.min(200, Number(n) || 50))]);
    return r.rows.map((row) => mapTimestampFields(row, ["at"]));
  },
  async count() {
    if (!usePostgres()) return sqliteCall("feedback", "count");
    const r = await pg().query("SELECT COUNT(*)::int c FROM feedback WHERE status='new'"); return Number(r.rows[0]?.c || 0);
  },
  async resolvePrivacyDeleteRequests(contact) {
    if (!usePostgres()) {
      const { db } = await sqliteModules();
      return db.db.prepare("UPDATE feedback SET status='done' WHERE kind='privacy_delete_request' AND ref=? AND status='new'").run(contact).changes;
    }
    const r = await pg().query("UPDATE feedback SET status='done' WHERE kind='privacy_delete_request' AND ref=$1 AND status='new'", [contact]);
    return r.rowCount;
  },
};

export const notificationStore = {
  async add({ at = nowISO(), channel = "console", recipient = "", template = "", subject = "", body = "", status = "logged" } = {}) {
    if (!usePostgres()) {
      const { db } = await sqliteModules();
      db.db.prepare("INSERT INTO notifications (at,channel,recipient,template,subject,body,status) VALUES (?,?,?,?,?,?,?)").run(at, channel, recipient, template, subject, body, status);
      return;
    }
    await pg().query("INSERT INTO notifications (at,channel,recipient,template,subject,body,status) VALUES ($1,$2,$3,$4,$5,$6,$7)", [at, channel, recipient, template, subject, body, status]);
  },
  async recent(n = 20) {
    if (!usePostgres()) {
      const { db } = await sqliteModules();
      return db.db.prepare("SELECT * FROM notifications ORDER BY at DESC LIMIT ?").all(n);
    }
    const r = await pg().query("SELECT * FROM notifications ORDER BY at DESC LIMIT $1", [Math.max(1, Math.min(200, Number(n) || 20))]);
    return r.rows.map((row) => mapTimestampFields(row, ["at"]));
  },
  async pendingCount() {
    if (!usePostgres()) {
      const { db } = await sqliteModules();
      return db.db.prepare("SELECT COUNT(*) c FROM notifications WHERE status IN ('logged','pending')").get().c;
    }
    const r = await pg().query("SELECT COUNT(*)::int c FROM notifications WHERE status IN ('logged','pending')"); return Number(r.rows[0]?.c || 0);
  },
};

export async function retentionSweep() {
  if (!usePostgres()) {
    const { repo } = await sqliteModules(); return repo.retentionSweep();
  }
  const now = Date.now();
  const yearAgo = new Date(now - 365 * 864e5).toISOString();
  const monthAgo = new Date(now - 30 * 864e5).toISOString();
  return withPostgresTransaction(pg(), async (client) => {
    const delB = await client.query("DELETE FROM bookings WHERE at < $1", [yearAgo]);
    const delL = await client.query("DELETE FROM leads WHERE at < $1", [yearAgo]);
    await client.query("DELETE FROM access_logs WHERE at < $1", [yearAgo]);
    await client.query("DELETE FROM booking_events WHERE at < $1", [yearAgo]);
    const softB = await client.query("UPDATE bookings SET deleted_at=$1 WHERE deleted_at IS NULL AND status IN ('received','reviewed') AND at < $2", [nowISO(), monthAgo]);
    return { deletedBookings: delB.rowCount, deletedLeads: delL.rowCount, abandonedSoftDeleted: softB.rowCount };
  });
}

export async function adminStats() {
  if (!usePostgres()) {
    const { repo } = await sqliteModules(); return repo.adminStats();
  }
  const [statusRows, leadCount, nomuVisible, eventStats] = await Promise.all([
    pg().query("SELECT status,COUNT(*)::int c FROM bookings WHERE deleted_at IS NULL GROUP BY status"),
    pg().query("SELECT COUNT(*)::int c FROM leads"),
    pg().query("SELECT COUNT(*)::int c FROM nomusa WHERE opted_out=FALSE"),
    events.stats(30),
  ]);
  const byStatus = Object.fromEntries(statusRows.rows.map((row) => [row.status, Number(row.c)]));
  const total = Object.values(byStatus).reduce((a,b) => a + b, 0);
  const done = byStatus.done || 0;
  const open = total - done - (byStatus.canceled || 0);
  return { total, open, done, conversion: total ? Math.round((done / total) * 100) : 0, byStatus, leads: Number(leadCount.rows[0]?.c || 0), nomuVisible: Number(nomuVisible.rows[0]?.c || 0), events: eventStats };
}

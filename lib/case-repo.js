import { db, genId, nowISO } from "./db.js";
import { ensureCaseSchema } from "./case-db.js";

ensureCaseSchema();

export const CASE_STATUSES = ["intake", "analysis", "active", "waiting", "resolved", "archived"];
export const CASE_USER_TYPES = ["worker", "employer", "hr", "freelancer", "unknown"];

const JSON_FIELDS = [
  "facts",
  "missing_facts",
  "issues",
  "calculations",
  "evidence",
  "actions",
  "documents",
  "legal_sources",
  "meta",
];

const MUTABLE_FIELDS = [
  "status",
  "user_type",
  "case_type",
  "title",
  "summary",
  "event_date",
  "period_start",
  "period_end",
  "employment_start_date",
  "employment_end_date",
  ...JSON_FIELDS,
];

function toJson(value, fallback) {
  if (value === undefined) return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function fromJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeStatus(value) {
  return CASE_STATUSES.includes(value) ? value : "intake";
}

function normalizeUserType(value) {
  return CASE_USER_TYPES.includes(value) ? value : "unknown";
}

function mapCase(row) {
  if (!row) return null;
  return {
    ...row,
    facts: fromJson(row.facts, {}),
    missing_facts: fromJson(row.missing_facts, []),
    issues: fromJson(row.issues, []),
    calculations: fromJson(row.calculations, []),
    evidence: fromJson(row.evidence, []),
    actions: fromJson(row.actions, []),
    documents: fromJson(row.documents, []),
    legal_sources: fromJson(row.legal_sources, []),
    meta: fromJson(row.meta, {}),
  };
}

export const cases = {
  insert(rec = {}, actor = "user") {
    const now = nowISO();
    const row = {
      id: genId("c"),
      created_at: now,
      updated_at: now,
      status: normalizeStatus(rec.status),
      user_type: normalizeUserType(rec.user_type || "worker"),
      case_type: String(rec.case_type || "unknown").slice(0, 80),
      title: String(rec.title || "").slice(0, 200),
      summary: String(rec.summary || "").slice(0, 4000),
      event_date: rec.event_date || null,
      period_start: rec.period_start || null,
      period_end: rec.period_end || null,
      employment_start_date: rec.employment_start_date || null,
      employment_end_date: rec.employment_end_date || null,
      facts: toJson(rec.facts, {}),
      missing_facts: toJson(rec.missing_facts, []),
      issues: toJson(rec.issues, []),
      calculations: toJson(rec.calculations, []),
      evidence: toJson(rec.evidence, []),
      actions: toJson(rec.actions, []),
      documents: toJson(rec.documents, []),
      legal_sources: toJson(rec.legal_sources, []),
      meta: toJson(rec.meta, {}),
      deleted_at: null,
    };

    db.prepare(`INSERT INTO cases (
      id,created_at,updated_at,status,user_type,case_type,title,summary,
      event_date,period_start,period_end,employment_start_date,employment_end_date,
      facts,missing_facts,issues,calculations,evidence,actions,documents,legal_sources,meta,deleted_at
    ) VALUES (
      @id,@created_at,@updated_at,@status,@user_type,@case_type,@title,@summary,
      @event_date,@period_start,@period_end,@employment_start_date,@employment_end_date,
      @facts,@missing_facts,@issues,@calculations,@evidence,@actions,@documents,@legal_sources,@meta,@deleted_at
    )`).run(row);

    this.logEvent(row.id, "created", actor);
    return this.get(row.id);
  },

  get(id) {
    return mapCase(db.prepare("SELECT * FROM cases WHERE id=? AND deleted_at IS NULL").get(id));
  },

  list({ status = "", case_type = "", limit = 50 } = {}) {
    const where = ["deleted_at IS NULL"];
    const args = {};
    if (status) { where.push("status=@status"); args.status = status; }
    if (case_type) { where.push("case_type=@case_type"); args.case_type = case_type; }
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return db.prepare(`SELECT * FROM cases WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ${safeLimit}`)
      .all(args)
      .map(mapCase);
  },

  update(id, fields = {}, actor = "user") {
    const sets = [];
    const args = { id, updated_at: nowISO() };

    for (const key of MUTABLE_FIELDS) {
      if (!(key in fields)) continue;
      let value = fields[key];
      if (key === "status") value = normalizeStatus(value);
      else if (key === "user_type") value = normalizeUserType(value);
      else if (key === "case_type") value = String(value || "unknown").slice(0, 80);
      else if (key === "title") value = String(value || "").slice(0, 200);
      else if (key === "summary") value = String(value || "").slice(0, 4000);
      else if (JSON_FIELDS.includes(key)) value = JSON.stringify(value ?? (key === "facts" || key === "meta" ? {} : []));
      else value = value || null;
      sets.push(`${key}=@${key}`);
      args[key] = value;
    }

    if (!sets.length) return this.get(id);
    sets.push("updated_at=@updated_at");
    const result = db.prepare(`UPDATE cases SET ${sets.join(",")} WHERE id=@id AND deleted_at IS NULL`).run(args);
    if (!result.changes) return null;
    this.logEvent(id, "updated", actor, Object.keys(fields).join(","));
    return this.get(id);
  },

  archive(id, actor = "user") {
    const at = nowISO();
    const result = db.prepare("UPDATE cases SET status='archived', deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
      .run(at, at, id);
    if (!result.changes) return false;
    this.logEvent(id, "archived", actor);
    return true;
  },

  logEvent(case_id, type, actor = "system", note = "") {
    db.prepare("INSERT INTO case_events (case_id,at,type,actor,note) VALUES (?,?,?,?,?)")
      .run(case_id, nowISO(), String(type).slice(0, 80), String(actor).slice(0, 80), String(note).slice(0, 1000));
  },

  events(case_id) {
    return db.prepare("SELECT id,case_id,at,type,actor,note FROM case_events WHERE case_id=? ORDER BY at,id").all(case_id);
  },
};

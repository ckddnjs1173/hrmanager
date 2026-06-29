// 도메인 저장소 — 라우트는 이 함수들만 사용. 내부 구현(SQLite)은 캡슐화.
import { db, nowISO, genId } from "./db.js";
import crypto from "node:crypto";
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

/* ===== 예약(bookings) ===== */
export const bookings = {
  insert(rec) {
    const id = genId("b");
    const row = {
      id, at: nowISO(), status: "received",
      name: rec.name || "", contact: rec.contact || "", nomu: rec.nomu || "",
      message: rec.message || "", summary: rec.summary || "",
      consent: rec.consent ? 1 : 0, assigned: "", memo: "",
      token: rec.token || "", expires: rec.expires || "", deleted_at: null,
    };
    db.prepare(`INSERT INTO bookings (id,at,status,name,contact,nomu,message,summary,consent,assigned,memo,token,expires,deleted_at)
      VALUES (@id,@at,@status,@name,@contact,@nomu,@message,@summary,@consent,@assigned,@memo,@token,@expires,@deleted_at)`).run(row);
    this.logEvent(id, "created", "user");
    return { ...row, consent: !!row.consent };
  },
  all() {
    return db.prepare("SELECT * FROM bookings WHERE deleted_at IS NULL ORDER BY at ASC").all().map(mapBooking);
  },
  // 검색·필터·페이지네이션
  list({ status = "", q = "", page = 1, size = 50 } = {}) {
    const where = ["deleted_at IS NULL"]; const args = {};
    if (status && status !== "all") {
      if (status === "open") where.push("status NOT IN ('done','canceled')");
      else { where.push("status = @status"); args.status = status; }
    }
    if (q) { where.push("(name LIKE @q OR contact LIKE @q OR nomu LIKE @q)"); args.q = `%${q}%`; }
    const w = "WHERE " + where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) c FROM bookings ${w}`).get(args).c;
    const off = (Math.max(1, page) - 1) * size;
    const items = db.prepare(`SELECT * FROM bookings ${w} ORDER BY at DESC LIMIT ${size} OFFSET ${off}`).all(args).map(mapBooking);
    return { items, total, page, size };
  },
  get(id) { const r = db.prepare("SELECT * FROM bookings WHERE id=?").get(id); return r ? mapBooking(r) : null; },
  byToken(token) { const r = db.prepare("SELECT * FROM bookings WHERE token=? AND deleted_at IS NULL").get(token); return r ? mapBooking(r) : null; },
  byNomusa(nomusaId) {
    return db.prepare("SELECT * FROM bookings WHERE assigned_nomusa_id=? AND deleted_at IS NULL ORDER BY at DESC").all(nomusaId).map(mapBooking);
  },
  update(id, fields, actor = "operator") {
    const allow = ["status", "assigned", "assigned_nomusa_id", "memo", "deleted_at"];
    const sets = [], args = { id };
    for (const k of allow) if (k in fields) { sets.push(`${k}=@${k}`); args[k] = fields[k]; }
    if (!sets.length) return false;
    const n = db.prepare(`UPDATE bookings SET ${sets.join(",")} WHERE id=@id`).run(args).changes;
    if (n && fields.status) this.logEvent(id, "status:" + fields.status, actor);
    else if (n) this.logEvent(id, "update", actor, Object.keys(fields).join(","));
    return !!n;
  },
  logEvent(booking_id, type, actor = "", note = "") {
    db.prepare("INSERT INTO booking_events (booking_id,at,type,actor,note) VALUES (?,?,?,?,?)").run(booking_id, nowISO(), type, actor, note);
  },
  events(booking_id) { return db.prepare("SELECT * FROM booking_events WHERE booking_id=? ORDER BY at").all(booking_id); },
};
function mapBooking(r) { return { ...r, consent: !!r.consent }; }

/* ===== 리드(leads) ===== */
export const leads = {
  insert(rec) {
    const id = genId("l");
    const row = { id, at: nowISO(), kind: rec.kind || "general", name: rec.name || "", contact: rec.contact || "", message: rec.message || "", status: "new" };
    db.prepare("INSERT INTO leads (id,at,kind,name,contact,message,status) VALUES (@id,@at,@kind,@name,@contact,@message,@status)").run(row);
    return row;
  },
  all() { return db.prepare("SELECT * FROM leads ORDER BY at ASC").all(); },
  list({ kind = "", page = 1, size = 100 } = {}) {
    const where = [], args = {};
    if (kind && kind !== "all") { where.push("kind=@kind"); args.kind = kind; }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = db.prepare(`SELECT COUNT(*) c FROM leads ${w}`).get(args).c;
    const off = (Math.max(1, page) - 1) * size;
    const items = db.prepare(`SELECT * FROM leads ${w} ORDER BY at DESC LIMIT ${size} OFFSET ${off}`).all(args);
    return { items, total };
  },
};

/* ===== 노무사(nomusa) ===== */
export const nomusa = {
  count() { return db.prepare("SELECT COUNT(*) c FROM nomusa").get().c; },
  // doc(JSON)에 전체 레코드 보관 + 검색·정렬용 컬럼 색인
  upsert(rec) {
    const sido = (rec.loc || "").split(" ")[0] || "";
    db.prepare(`INSERT INTO nomusa (id,name,loc,sido,opted_out,featured,doc) VALUES (@id,@name,@loc,@sido,@opted_out,@featured,@doc)
      ON CONFLICT(id) DO UPDATE SET name=@name,loc=@loc,sido=@sido,doc=@doc`)
      .run({ id: rec.id, name: rec.n || rec.name || "", loc: rec.loc || "", sido, opted_out: rec.opted_out ? 1 : 0, featured: rec.featured ? 1 : 0, doc: JSON.stringify(rec) });
  },
  replaceAll(arr) { const t = db.prepare("DELETE FROM nomusa"); t.run(); for (const r of arr) this.upsert(r); },
  publicList({ region = "" } = {}) {
    let rows = db.prepare("SELECT doc,featured,opted_out FROM nomusa WHERE opted_out=0").all();
    let list = rows.map((r) => ({ ...JSON.parse(r.doc), featured: !!r.featured }));
    if (region) list = list.filter((n) => (n.loc || "").includes(region));
    list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    return list;
  },
  adminList() {
    return db.prepare("SELECT doc,featured,opted_out FROM nomusa ORDER BY featured DESC, name").all()
      .map((r) => ({ ...JSON.parse(r.doc), featured: !!r.featured, opted_out: !!r.opted_out }));
  },
  get(id) { const r = db.prepare("SELECT doc FROM nomusa WHERE id=?").get(id); return r ? JSON.parse(r.doc) : null; },
  toggle(id, field, val) {
    if (!["opted_out", "featured"].includes(field)) return false;
    const r = db.prepare("SELECT doc FROM nomusa WHERE id=?").get(id);
    if (!r) return false;
    const doc = JSON.parse(r.doc); doc[field] = !!val;
    db.prepare(`UPDATE nomusa SET ${field}=?, doc=? WHERE id=?`).run(val ? 1 : 0, JSON.stringify(doc), id);
    return true;
  },
};

/* ===== 열람 로그 / 이벤트 ===== */
export const accessLogs = {
  add({ booking_id, token, ip_hash, ua }) {
    db.prepare("INSERT INTO access_logs (booking_id,token,at,ip_hash,ua) VALUES (?,?,?,?,?)").run(booking_id || "", token || "", nowISO(), ip_hash || "", (ua || "").slice(0, 300));
  },
  forBooking(id) { return db.prepare("SELECT at, ip_hash FROM access_logs WHERE booking_id=? ORDER BY at").all(id); },
};
export const EVENT_TYPES = ["view", "calc", "doc", "pack", "booking_start", "booking", "lead", "nomu_view"];
export const events = {
  add(type, ref = "", meta = null) { if (!EVENT_TYPES.includes(type)) return; db.prepare("INSERT INTO events (at,type,ref,meta) VALUES (?,?,?,?)").run(nowISO(), type, ref, meta ? JSON.stringify(meta) : null); },
  // 최근 N일 타입별 집계
  stats(days = 30) {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const rows = db.prepare("SELECT type, COUNT(*) c FROM events WHERE at >= ? GROUP BY type").all(since);
    const by = {}; for (const r of rows) by[r.type] = r.c;
    return by;
  },
};

/* ===== 노무사 계정 (운영자 발급 접속 토큰) ===== */
export const partners = {
  // 노무사에게 접속 토큰 발급(재발급 시 기존 토큰 폐기). 평문 토큰은 1회만 반환.
  issue(nomusaId, name) {
    const token = crypto.randomBytes(24).toString("hex");
    db.prepare("DELETE FROM nomusa_accounts WHERE nomusa_id=?").run(nomusaId);
    db.prepare("INSERT INTO nomusa_accounts (nomusa_id,name,token_hash,created_at) VALUES (?,?,?,?)").run(nomusaId, name || "", sha(token), nowISO());
    return token;
  },
  verify(token) {
    if (!token) return null;
    const r = db.prepare("SELECT * FROM nomusa_accounts WHERE token_hash=?").get(sha(token));
    return r || null;
  },
  touch(id) { db.prepare("UPDATE nomusa_accounts SET last_login=? WHERE id=?").run(nowISO(), id); },
  byNomusaId(nomusaId) { return db.prepare("SELECT id,nomusa_id,name,created_at,last_login FROM nomusa_accounts WHERE nomusa_id=?").get(nomusaId) || null; },
  all() { return db.prepare("SELECT id,nomusa_id,name,created_at,last_login FROM nomusa_accounts").all(); },
};

/* ===== 개인정보 보존·삭제 (정책 정합) ===== */
export const privacy = {
  // 토큰으로 본인 예약 즉시 파기(소프트)
  deleteByToken(token) {
    const r = db.prepare("SELECT id FROM bookings WHERE token=? AND deleted_at IS NULL").get(token);
    if (!r) return 0;
    db.prepare("UPDATE bookings SET deleted_at=? WHERE id=?").run(nowISO(), r.id);
    bookings.logEvent(r.id, "deleted:user", "user");
    return 1;
  },
  // 연락처로 본인 데이터 파기(예약+리드) — 요청 기록 남김
  deleteByContact(contact) {
    const at = nowISO();
    const bs = db.prepare("SELECT id FROM bookings WHERE contact=? AND deleted_at IS NULL").all(contact);
    for (const b of bs) { db.prepare("UPDATE bookings SET deleted_at=? WHERE id=?").run(at, b.id); bookings.logEvent(b.id, "deleted:request", "user"); }
    const ls = db.prepare("DELETE FROM leads WHERE contact=?").run(contact).changes;
    events.add("privacy_delete", "", { bookings: bs.length, leads: ls });
    return bs.length + ls;
  },
};

// 보존 기간 자동 파기 — 서버 기동 시 + 1일 주기
export function retentionSweep() {
  const now = Date.now();
  const yearAgo = new Date(now - 365 * 864e5).toISOString();
  const monthAgo = new Date(now - 30 * 864e5).toISOString();
  // 1년 경과 → 완전 삭제
  const delB = db.prepare("DELETE FROM bookings WHERE at < ?").run(yearAgo).changes;
  const delL = db.prepare("DELETE FROM leads WHERE at < ?").run(yearAgo).changes;
  db.prepare("DELETE FROM access_logs WHERE at < ?").run(yearAgo);
  db.prepare("DELETE FROM booking_events WHERE at < ?").run(yearAgo);
  // 미수락(접수·검토 상태)으로 30일 방치 → 단기 파기(소프트)
  const softB = db.prepare("UPDATE bookings SET deleted_at=? WHERE deleted_at IS NULL AND status IN ('received','reviewed') AND at < ?").run(new Date(now).toISOString(), monthAgo).changes;
  return { deletedBookings: delB, deletedLeads: delL, abandonedSoftDeleted: softB };
}

/* ===== 피드백 (AI 오답 신고 등) ===== */
export const feedback = {
  add({ kind = "answer", ref = "", message = "" }) {
    db.prepare("INSERT INTO feedback (at,kind,ref,message,status) VALUES (?,?,?,?, 'new')").run(nowISO(), kind, String(ref).slice(0, 80), String(message).slice(0, 2000));
  },
  recent(n = 50) { return db.prepare("SELECT * FROM feedback ORDER BY at DESC LIMIT ?").all(n); },
  count() { return db.prepare("SELECT COUNT(*) c FROM feedback WHERE status='new'").get().c; },
};

/* ===== 통계(대시보드) ===== */
export function adminStats() {
  const byStatus = {};
  for (const r of db.prepare("SELECT status, COUNT(*) c FROM bookings WHERE deleted_at IS NULL GROUP BY status").all()) byStatus[r.status] = r.c;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const done = byStatus.done || 0;
  const open = total - done - (byStatus.canceled || 0);
  const leadCount = db.prepare("SELECT COUNT(*) c FROM leads").get().c;
  const nomuVisible = db.prepare("SELECT COUNT(*) c FROM nomusa WHERE opted_out=0").get().c;
  return { total, open, done, conversion: total ? Math.round((done / total) * 100) : 0, byStatus, leads: leadCount, nomuVisible, events: events.stats(30) };
}

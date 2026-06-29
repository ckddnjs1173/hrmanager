// 기존 data/*.json → SQLite 1회 이관 (idempotent: 이미 있으면 건너뜀)
// 실행: node scripts/migrate-json-to-db.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../lib/db.js";
import { nomusa } from "../lib/repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");
const read = (f) => { try { const a = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8")); return Array.isArray(a) ? a : []; } catch { return []; } };

// bookings
let nb = 0;
for (const b of read("bookings.json")) {
  const exists = db.prepare("SELECT 1 FROM bookings WHERE id=?").get(b.id);
  if (exists) continue;
  db.prepare(`INSERT INTO bookings (id,at,status,name,contact,nomu,message,summary,consent,assigned,memo,token,expires,deleted_at)
    VALUES (@id,@at,@status,@name,@contact,@nomu,@message,@summary,@consent,@assigned,@memo,@token,@expires,NULL)`)
    .run({ id: b.id, at: b.at || "", status: b.status || "received", name: b.name || "", contact: b.contact || "", nomu: b.nomu || "", message: b.message || "", summary: b.summary || "", consent: b.consent ? 1 : 0, assigned: b.assigned || "", memo: b.memo || "", token: b.token || "", expires: b.expires || "" });
  nb++;
}

// leads
let nl = 0;
for (const l of read("leads.json")) {
  if (db.prepare("SELECT 1 FROM leads WHERE id=?").get(l.id)) continue;
  db.prepare("INSERT INTO leads (id,at,kind,name,contact,message,status) VALUES (@id,@at,@kind,@name,@contact,@message,@status)")
    .run({ id: l.id, at: l.at || "", kind: l.kind || "general", name: l.name || "", contact: l.contact || "", message: l.message || "", status: l.status || "new" });
  nl++;
}

// nomusa (전량 교체 — 공공데이터 seed가 원천)
const nomu = read("nomusa.json");
if (nomu.length) nomusa.replaceAll(nomu);

console.log(`✅ 이관 완료 — bookings +${nb}, leads +${nl}, nomusa ${nomu.length}건`);

import { resolveStorageRuntimeMode } from "./storage-runtime-contract.js";
import { getRuntimePostgresPool } from "./runtime-postgres.js";

export const CASE_STATUSES = Object.freeze(["intake", "analysis", "active", "waiting", "resolved", "archived"]);
export const CASE_USER_TYPES = Object.freeze(["worker", "employer", "hr", "freelancer", "unknown"]);

const JSON_FIELDS = Object.freeze(["facts","missing_facts","issues","calculations","evidence","actions","documents","legal_sources","meta"]);
const MUTABLE_FIELDS = Object.freeze(["status","user_type","case_type","title","summary","event_date","period_start","period_end","employment_start_date","employment_end_date",...JSON_FIELDS]);
const mode = resolveStorageRuntimeMode();
let sqlitePromise = null;

function nowISO(){return new Date().toISOString();}
function genId(prefix="c"){return prefix+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);}
function normalizeStatus(v){return CASE_STATUSES.includes(v)?v:"intake";}
function normalizeUserType(v){return CASE_USER_TYPES.includes(v)?v:"unknown";}
function isPostgres(){return mode==="postgres";}
function pg(){return getRuntimePostgresPool();}
async function sqlite(){if(!sqlitePromise)sqlitePromise=import("./case-repo.js");return sqlitePromise;}

function iso(value){if(value==null||value==="")return value??null;return value instanceof Date?value.toISOString():String(value);}
function dateOnly(value){if(value==null||value==="")return value??null;if(value instanceof Date)return value.toISOString().slice(0,10);return String(value).slice(0,10);}
function mapCase(row){
  if(!row)return null;
  const out={...row};
  for(const key of ["created_at","updated_at","deleted_at"]) if(key in out) out[key]=iso(out[key]);
  for(const key of ["event_date","period_start","period_end","employment_start_date","employment_end_date"]) if(key in out) out[key]=dateOnly(out[key]);
  for(const key of JSON_FIELDS){
    if(typeof out[key]==="string"){try{out[key]=JSON.parse(out[key]);}catch{out[key]=key==="facts"||key==="meta"?{}:[];}}
    else if(out[key]==null) out[key]=key==="facts"||key==="meta"?{}:[];
  }
  return out;
}

export const cases={
  async insert(rec={},actor="user"){
    if(!isPostgres()){const m=await sqlite();return m.cases.insert(rec,actor);}
    const now=nowISO();
    const row={
      id:genId("c"),created_at:now,updated_at:now,status:normalizeStatus(rec.status),user_type:normalizeUserType(rec.user_type||"worker"),
      case_type:String(rec.case_type||"unknown").slice(0,80),title:String(rec.title||"").slice(0,200),summary:String(rec.summary||"").slice(0,4000),
      event_date:rec.event_date||null,period_start:rec.period_start||null,period_end:rec.period_end||null,employment_start_date:rec.employment_start_date||null,employment_end_date:rec.employment_end_date||null,
      facts:rec.facts||{},missing_facts:rec.missing_facts||[],issues:rec.issues||[],calculations:rec.calculations||[],evidence:rec.evidence||[],actions:rec.actions||[],documents:rec.documents||[],legal_sources:rec.legal_sources||[],meta:rec.meta||{},deleted_at:null,
    };
    const columns=Object.keys(row);const values=columns.map((k)=>row[k]);const placeholders=values.map((_,i)=>`$${i+1}`).join(",");
    await pg().query(`INSERT INTO cases (${columns.join(",")}) VALUES (${placeholders})`,values);
    await this.logEvent(row.id,"created",actor);
    return this.get(row.id);
  },
  async get(id){
    if(!isPostgres()){const m=await sqlite();return m.cases.get(id);}
    const r=await pg().query("SELECT * FROM cases WHERE id=$1 AND deleted_at IS NULL",[id]);return mapCase(r.rows[0]||null);
  },
  async list({status="",case_type="",limit=50}={}){
    if(!isPostgres()){const m=await sqlite();return m.cases.list({status,case_type,limit});}
    const where=["deleted_at IS NULL"];const args=[];
    if(status){args.push(status);where.push(`status=$${args.length}`);}if(case_type){args.push(case_type);where.push(`case_type=$${args.length}`);}
    const safeLimit=Math.max(1,Math.min(200,Number(limit)||50));args.push(safeLimit);
    const r=await pg().query(`SELECT * FROM cases WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT $${args.length}`,args);return r.rows.map(mapCase);
  },
  async update(id,fields={},actor="user"){
    if(!isPostgres()){const m=await sqlite();return m.cases.update(id,fields,actor);}
    const keys=MUTABLE_FIELDS.filter((key)=>key in fields);if(!keys.length)return this.get(id);
    const values=[];const sets=[];
    for(const key of keys){
      let value=fields[key];
      if(key==="status")value=normalizeStatus(value);else if(key==="user_type")value=normalizeUserType(value);else if(key==="case_type")value=String(value||"unknown").slice(0,80);else if(key==="title")value=String(value||"").slice(0,200);else if(key==="summary")value=String(value||"").slice(0,4000);else if(JSON_FIELDS.includes(key))value=value??(key==="facts"||key==="meta"?{}:[]);else value=value||null;
      values.push(value);sets.push(`${key}=$${values.length}`);
    }
    values.push(nowISO());sets.push(`updated_at=$${values.length}`);values.push(id);
    const r=await pg().query(`UPDATE cases SET ${sets.join(",")} WHERE id=$${values.length} AND deleted_at IS NULL`,values);if(!r.rowCount)return null;
    await this.logEvent(id,"updated",actor,Object.keys(fields).join(","));return this.get(id);
  },
  async archive(id,actor="user"){
    if(!isPostgres()){const m=await sqlite();return m.cases.archive(id,actor);}
    const at=nowISO();const r=await pg().query("UPDATE cases SET status='archived',deleted_at=$1,updated_at=$1 WHERE id=$2 AND deleted_at IS NULL",[at,id]);if(!r.rowCount)return false;
    await this.logEvent(id,"archived",actor);return true;
  },
  async logEvent(caseId,type,actor="system",note=""){
    if(!isPostgres()){const m=await sqlite();return m.cases.logEvent(caseId,type,actor,note);}
    await pg().query("INSERT INTO case_events (case_id,at,type,actor,note) VALUES ($1,$2,$3,$4,$5)",[caseId,nowISO(),String(type).slice(0,80),String(actor).slice(0,80),String(note).slice(0,1000)]);
  },
  async events(caseId){
    if(!isPostgres()){const m=await sqlite();return m.cases.events(caseId);}
    const r=await pg().query("SELECT id,case_id,at,type,actor,note FROM case_events WHERE case_id=$1 ORDER BY at,id",[caseId]);return r.rows.map((row)=>({...row,at:iso(row.at)}));
  },
};

export async function runtimeCaseRetentionSweep(now=Date.now(),{retentionDays=30,archivedRetentionDays=7}={}){
  if(!isPostgres()){
    const m=await import("./case-retention.js");return m.caseRetentionSweep(now);
  }
  const abandonedBefore=new Date(now-retentionDays*86400000).toISOString();
  const archivedBefore=new Date(now-archivedRetentionDays*86400000).toISOString();
  const archived=await pg().query("DELETE FROM cases WHERE deleted_at IS NOT NULL AND deleted_at < $1",[archivedBefore]);
  const abandoned=await pg().query("DELETE FROM cases WHERE deleted_at IS NULL AND updated_at < $1",[abandonedBefore]);
  return {at:nowISO(),retentionDays,archivedRetentionDays,deletedArchived:archived.rowCount,deletedAbandoned:abandoned.rowCount};
}

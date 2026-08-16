import crypto from "node:crypto";
import { resolveStorageRuntimeMode } from "./storage-runtime-contract.js";
import { getRuntimePostgresPool } from "./runtime-postgres.js";

const parsedTtl=Number.parseInt(process.env.CASE_TOKEN_TTL_DAYS||"7",10);
export const CASE_TOKEN_TTL_DAYS=Number.isFinite(parsedTtl)&&parsedTtl>0?parsedTtl:7;
const mode=resolveStorageRuntimeMode();
let sqlitePromise=null;
const hashToken=(token)=>crypto.createHash("sha256").update(String(token||"")).digest("hex");
const nowISO=()=>new Date().toISOString();
const nextExpiry=()=>new Date(Date.now()+CASE_TOKEN_TTL_DAYS*86400000).toISOString();
function isPostgres(){return mode==="postgres";}
function pg(){return getRuntimePostgresPool();}
async function sqlite(){if(!sqlitePromise)sqlitePromise=import("./case-access.js");return sqlitePromise;}

export const caseAccess={
  async issue(caseId){
    if(!isPostgres()){const m=await sqlite();return m.caseAccess.issue(caseId);}
    const token=crypto.randomBytes(32).toString("base64url");const expiresAt=nextExpiry();
    await pg().query(`INSERT INTO case_access_tokens (case_id,token_hash,created_at,last_used_at,expires_at)
      VALUES ($1,$2,$3,NULL,$4)
      ON CONFLICT(case_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=EXCLUDED.created_at,last_used_at=NULL,expires_at=EXCLUDED.expires_at`,
    [caseId,hashToken(token),nowISO(),expiresAt]);
    return token;
  },
  async verify(caseId,token){
    if(!isPostgres()){const m=await sqlite();return m.caseAccess.verify(caseId,token);}
    if(!caseId||!token)return false;
    const r=await pg().query("SELECT case_id,expires_at FROM case_access_tokens WHERE case_id=$1 AND token_hash=$2",[caseId,hashToken(token)]);const row=r.rows[0];if(!row)return false;
    const expiresAt=Date.parse(row.expires_at instanceof Date?row.expires_at.toISOString():String(row.expires_at||""));
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){await pg().query("DELETE FROM case_access_tokens WHERE case_id=$1",[caseId]);return false;}
    await pg().query("UPDATE case_access_tokens SET last_used_at=$1 WHERE case_id=$2",[nowISO(),caseId]);return true;
  },
  async revoke(caseId){
    if(!isPostgres()){const m=await sqlite();return m.caseAccess.revoke(caseId);}
    const r=await pg().query("DELETE FROM case_access_tokens WHERE case_id=$1",[caseId]);return r.rowCount>0;
  },
};

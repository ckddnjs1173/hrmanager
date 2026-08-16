import { runtimeCaseRetentionSweep } from "./runtime-case-repo.js";
import { retentionSweep } from "./runtime-repo.js";

export const RETENTION_SWEEP_INTERVAL_MS=24*3600*1000;

export async function runRetentionSweep({log=console.log,warn=console.warn}={}){
  try{const result=await retentionSweep();if(result.deletedBookings||result.deletedLeads||result.abandonedSoftDeleted)log(`🧹 보존정책 정리: 예약삭제 ${result.deletedBookings}, 리드삭제 ${result.deletedLeads}, 미수락파기 ${result.abandonedSoftDeleted}`);return result;}catch(error){warn("sweep error:",error?.message||error);return null;}
}
export async function runCaseRetentionSweep({now=Date.now(),log=console.log,warn=console.warn}={}){
  try{const result=await runtimeCaseRetentionSweep(now,{retentionDays:Number.parseInt(process.env.CASE_RETENTION_DAYS||"30",10)||30,archivedRetentionDays:Number.parseInt(process.env.CASE_ARCHIVED_RETENTION_DAYS||"7",10)||7});if(result.deletedArchived||result.deletedAbandoned)log(`🧹 Case 보존정책 정리: 삭제완료 ${result.deletedArchived}, 방치사건 ${result.deletedAbandoned}`);return result;}catch(error){warn("case sweep error:",error?.message||error);return null;}
}
export function startRetentionScheduler({intervalMs=RETENTION_SWEEP_INTERVAL_MS,runImmediately=true,log=console.log,warn=console.warn}={}){
  const sweep=()=>Promise.all([runRetentionSweep({log,warn}),runCaseRetentionSweep({log,warn})]).catch((error)=>warn("retention scheduler error:",error?.message||error));
  if(runImmediately)sweep();const timer=setInterval(sweep,intervalMs);timer.unref?.();return()=>clearInterval(timer);
}

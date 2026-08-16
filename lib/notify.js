// 알림 추상화 — 실제 발송 채널과 저장소를 분리한다.
import { notificationStore } from "./runtime-repo.js";

const adapters = {
  console: async (m) => { console.log(`🔔 [알림→${m.recipient || "운영자"}] ${m.subject}${m.body ? " — " + m.body : ""}`); return "logged"; },
  email: process.env.SMTP_URL ? async (m) => { console.log(`📧 (email 미구현) ${m.recipient}`); return "pending"; } : null,
  kakao: process.env.KAKAO_API_KEY ? async (m) => { console.log(`💬 (kakao 미구현) ${m.recipient}`); return "pending"; } : null,
};

export function availableChannels(){return Object.entries(adapters).filter(([k,v])=>k!=="console"&&v).map(([k])=>k);}

export async function notify({channel="auto",recipient="operator",subject="",body="",template=""}={}){
  let ch=channel;if(ch==="auto")ch=availableChannels()[0]||"console";const adapter=adapters[ch]||adapters.console;let status="logged";
  try{status=(await adapter({recipient,subject,body,template}))||"logged";}catch(e){status="error";console.warn("notify error:",e?.message||e);}
  try{await notificationStore.add({channel:ch,recipient,template,subject,body,status});}catch(e){console.warn("notification outbox error:",e?.message||e);}
  return{channel:ch,status};
}

export const notifications={
  recent:(n=20)=>notificationStore.recent(n),
  pendingCount:()=>notificationStore.pendingCount(),
};

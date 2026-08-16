import { createPostgresPool } from "./postgres-client.js";

let pool=null;
export function getRuntimePostgresPool(){
  if(!pool)pool=createPostgresPool({applicationName:"insaya-runtime"});
  return pool;
}
export async function closeRuntimePostgres(){
  if(!pool)return;
  const current=pool;pool=null;await current.end();
}

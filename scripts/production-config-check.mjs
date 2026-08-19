import { evaluateProductionDeploymentConfig } from "../lib/production-deployment-contract.js";

const result=evaluateProductionDeploymentConfig(process.env);
for(const warning of result.warnings)console.warn(`⚠ production config: ${warning}`);
if(!result.ok){
  for(const error of result.errors)console.error(`✖ production config: ${error}`);
  process.exit(1);
}
console.log(`✅ production configuration gate passed (${result.production?"production":"non-production"}${result.saasEnabled?", SaaS enabled":""})`);

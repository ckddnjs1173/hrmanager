import { isValidEmail } from "./validators.js";

function text(value){return String(value||"").trim();}
function isHttpsOrigin(value){
  try{const url=new URL(text(value));return url.protocol==="https:"&&url.origin===text(value).replace(/\/$/,"");}catch{return false;}
}

export function evaluateProductionDeploymentConfig(env=process.env){
  const errors=[];const warnings=[];
  const production=env.NODE_ENV==="production";
  const storage=text(env.STORAGE_DRIVER||"sqlite").toLowerCase();
  const persistentRequired=env.REQUIRE_PERSISTENT_DB==="1";
  const persistentDeclared=env.PERSISTENT_STORAGE==="1";
  const saasEnabled=env.SAAS_ENABLED==="1";

  if(!production)return {ok:true,production:false,saasEnabled,persistentRequired,errors,warnings};

  if(persistentRequired){
    if(!persistentDeclared)errors.push("persistent_storage_not_declared");
    if(storage==="postgres"){
      if(!text(env.DATABASE_URL))errors.push("postgres_database_url_required");
    }else{
      if(!text(env.DB_PATH)||text(env.DB_PATH)===":memory:")errors.push("durable_sqlite_path_required");
    }
  }else{
    warnings.push("persistent_storage_not_enforced");
  }

  if(env.SAAS_AUTH_TOKEN_ECHO==="1")errors.push("saas_auth_token_echo_forbidden_in_production");

  if(saasEnabled){
    if(storage!=="postgres")errors.push("saas_requires_postgres_runtime");
    if(!text(env.DATABASE_URL))errors.push("saas_database_url_required");
    if(!persistentRequired||!persistentDeclared)errors.push("saas_requires_verified_persistent_storage");
    if(text(env.SAAS_SESSION_SECRET||env.SESSION_SECRET).length<32)errors.push("saas_session_secret_too_short");
    if(text(env.DOCUMENT_STORAGE_SECRET).length<32)errors.push("document_storage_secret_too_short");
    const site=text(env.SITE_URL||env.RENDER_EXTERNAL_URL).replace(/\/$/,"");
    if(!isHttpsOrigin(site))errors.push("saas_https_site_url_required");
    if(text(env.SAAS_EMAIL_PROVIDER).toLowerCase()!=="resend")errors.push("saas_email_provider_required");
    if(!text(env.RESEND_API_KEY))errors.push("resend_api_key_required");
    if(!isValidEmail(text(env.SAAS_EMAIL_FROM)))errors.push("saas_email_from_required");
  }

  return {ok:errors.length===0,production:true,saasEnabled,persistentRequired,errors,warnings};
}

export function assertProductionDeploymentConfig(env=process.env){
  const result=evaluateProductionDeploymentConfig(env);
  if(!result.ok)throw new Error(`production_deployment_config_invalid:${result.errors.join(",")}`);
  return result;
}

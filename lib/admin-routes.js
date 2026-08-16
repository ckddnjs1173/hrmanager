import express from "express";
import crypto from "node:crypto";
import { bookings, leads, nomusa, accessLogs, adminStats, partners, feedback } from "./runtime-repo.js";
import { fulfillPrivacyDeletion } from "./privacy-operations.js";
import { notifications, availableChannels } from "./notify.js";

const STATUSES=["received","reviewed","sent","in_progress","done","canceled"];

export function createAdminRouter({rateLimit,clean,adminToken,sessionTtl,parseCookies,verifySession,setSessionCookie,clearSessionCookie}){
  for(const[name,value]of Object.entries({rateLimit,clean,parseCookies,verifySession,setSessionCookie,clearSessionCookie}))if(typeof value!=="function")throw new Error(`admin_router_${name}_required`);
  if(typeof adminToken!=="string"||!adminToken)throw new Error("admin_router_admin_token_required");
  if(!Number.isFinite(Number(sessionTtl))||Number(sessionTtl)<=0)throw new Error("admin_router_session_ttl_required");
  const router=express.Router();
  function tokenOk(token){if(!token||token.length!==adminToken.length)return false;try{return crypto.timingSafeEqual(Buffer.from(token),Buffer.from(adminToken));}catch{return false;}}
  function adminAuth(req,res,next){if(tokenOk(req.get("x-admin-token")||""))return next();const session=verifySession(parseCookies(req).nomu_sess);if(!session)return res.status(401).json({error:"unauthorized"});if(req.method!=="GET"&&(req.get("x-csrf-token")||"")!==session.csrf)return res.status(403).json({error:"csrf"});req.adminSession=session;return next();}

  router.post("/admin/login",rateLimit({max:10}),(req,res)=>{if(!tokenOk(String(req.body?.token||"")))return res.status(401).json({error:"invalid_token"});const csrf=crypto.randomBytes(16).toString("hex");setSessionCookie(req,res,{exp:Date.now()+Number(sessionTtl),csrf});return res.json({ok:true,csrf});});
  router.post("/admin/logout",(_req,res)=>{clearSessionCookie(res);return res.json({ok:true});});
  router.get("/admin/session",(req,res)=>{const session=verifySession(parseCookies(req).nomu_sess);if(!session)return res.status(401).json({error:"no_session"});return res.json({ok:true,csrf:session.csrf});});

  router.get("/admin/data",adminAuth,async(req,res)=>res.json({bookings:await bookings.all(),leads:await leads.all(),origin:`${req.protocol}://${req.get("host")}`}));
  router.get("/admin/summary",adminAuth,async(_req,res)=>res.json({...await adminStats(),notifyPending:await notifications.pendingCount(),notifyChannels:availableChannels(),feedbackNew:await feedback.count()}));
  router.get("/admin/notifications",adminAuth,async(_req,res)=>res.json(await notifications.recent(30)));
  router.get("/admin/feedback",adminAuth,async(_req,res)=>res.json(await feedback.recent(50)));

  router.post("/admin/privacy/delete-contact",adminAuth,async(req,res)=>{const contact=clean(req.body?.contact);if(!contact)return res.status(400).json({error:"contact_required"});if(req.body?.verified!==true)return res.status(400).json({error:"identity_verification_required"});return res.json(await fulfillPrivacyDeletion(contact));});
  router.get("/admin/bookings",adminAuth,async(req,res)=>res.json(await bookings.list({status:req.query.status,q:clean(req.query.q),page:+req.query.page||1,size:Math.min(200,+req.query.size||50)})));

  router.post("/admin/booking/:id",adminAuth,async(req,res)=>{
    const fields={};if(req.body?.status&&STATUSES.includes(req.body.status))fields.status=req.body.status;if(typeof req.body?.memo==="string")fields.memo=clean(req.body.memo);
    if(typeof req.body?.assigned_nomusa_id==="string"){fields.assigned_nomusa_id=clean(req.body.assigned_nomusa_id);const expert=fields.assigned_nomusa_id?await nomusa.get(fields.assigned_nomusa_id):null;fields.assigned=expert?(expert.n||expert.name||""):"";}else if(typeof req.body?.assigned==="string")fields.assigned=clean(req.body.assigned);
    if(!(await bookings.update(req.params.id,fields)))return res.status(404).json({error:"not_found"});return res.json({ok:true});
  });

  router.get("/admin/booking/:id/events",adminAuth,async(req,res)=>{const booking=await bookings.get(req.params.id);if(!booking)return res.status(404).json({error:"not_found"});return res.json({consent:!!booking.consent,consentAt:booking.at,events:await bookings.events(req.params.id),views:await accessLogs.forBooking(req.params.id)});});
  router.get("/admin/nomu",adminAuth,async(_req,res)=>res.json(await nomusa.adminList()));
  router.post("/admin/nomu/:id",adminAuth,async(req,res)=>{let done=false;if(typeof req.body?.opted_out==="boolean")done=(await nomusa.toggle(req.params.id,"opted_out",req.body.opted_out))||done;if(typeof req.body?.featured==="boolean")done=(await nomusa.toggle(req.params.id,"featured",req.body.featured))||done;if(!done)return res.status(404).json({error:"not_found"});return res.json({ok:true});});
  router.post("/admin/nomu/:id/token",adminAuth,async(req,res)=>{const expert=await nomusa.get(req.params.id);if(!expert)return res.status(404).json({error:"not_found"});const token=await partners.issue(req.params.id,expert.n||expert.name||"");return res.json({ok:true,token,link:`${req.protocol}://${req.get("host")}/partner#token=${token}`});});
  return router;
}

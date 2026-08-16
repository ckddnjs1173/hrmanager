import express from "express";
import crypto from "node:crypto";
import { bookings, partners } from "./runtime-repo.js";

export function createPartnerRouter({rateLimit,clean,sessionTtl,parseCookies,verifySession,setSessionCookie,clearSessionCookie}){
  for(const[name,value]of Object.entries({rateLimit,clean,parseCookies,verifySession,setSessionCookie,clearSessionCookie}))if(typeof value!=="function")throw new Error(`partner_router_${name}_required`);
  if(!Number.isFinite(Number(sessionTtl))||Number(sessionTtl)<=0)throw new Error("partner_router_session_ttl_required");
  const router=express.Router();
  function partnerAuth(req,res,next){const session=verifySession(parseCookies(req).nomu_partner);if(!session||!session.nomusa_id)return res.status(401).json({error:"unauthorized"});if(req.method!=="GET"&&(req.get("x-csrf-token")||"")!==session.csrf)return res.status(403).json({error:"csrf"});req.partner=session;return next();}

  router.post("/partner/login",rateLimit({max:10}),async(req,res)=>{const account=await partners.verify(String(req.body?.token||""));if(!account)return res.status(401).json({error:"invalid_token"});await partners.touch(account.id);const csrf=crypto.randomBytes(16).toString("hex");setSessionCookie(req,res,{exp:Date.now()+Number(sessionTtl),csrf,nomusa_id:account.nomusa_id,name:account.name},"nomu_partner");return res.json({ok:true,csrf,name:account.name});});
  router.post("/partner/logout",(_req,res)=>{clearSessionCookie(res,"nomu_partner");return res.json({ok:true});});
  router.get("/partner/me",(req,res)=>{const session=verifySession(parseCookies(req).nomu_partner);if(!session||!session.nomusa_id)return res.status(401).json({error:"no_session"});return res.json({ok:true,csrf:session.csrf,name:session.name,nomusa_id:session.nomusa_id});});
  router.get("/partner/bookings",partnerAuth,async(req,res)=>res.json(await bookings.byNomusa(req.partner.nomusa_id)));
  router.post("/partner/booking/:id",partnerAuth,async(req,res)=>{const booking=await bookings.get(req.params.id);if(!booking||booking.assigned_nomusa_id!==req.partner.nomusa_id)return res.status(404).json({error:"not_found"});const fields={};if(["in_progress","done"].includes(req.body?.status))fields.status=req.body.status;if(typeof req.body?.memo==="string")fields.memo=clean(req.body.memo);if(Object.keys(fields).length)await bookings.update(req.params.id,fields,`partner:${req.partner.nomusa_id}`);return res.json({ok:true});});
  return router;
}

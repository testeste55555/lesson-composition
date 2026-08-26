(() => {
"use strict";

const cfg=window.HG_FIREBASE_CONFIG||{};
const enabled=cfg.enabled===true&&!!cfg.apiKey&&!!cfg.projectId;
const SESSION_KEY="human_gate_firebase_session_v1";
const REVIEW_COLLECTION=cfg.reviewCollection||"humanGateReviews";
const POLL_MS=Math.max(10000,Number(cfg.pollIntervalMs)||15000);
let timer=null;

function readSession(){
  try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")}catch(e){return null}
}
function writeSession(s){
  if(!s)sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));
}
function currentUser(){const s=readSession();return s?{uid:s.uid,email:s.email||""}:null}
function hasSession(){return !!readSession()}
function errorMessage(data,status){return data?.error?.message||data?.error?.status||`HTTP_${status}`}
async function requestJson(url,options={}){
  const res=await fetch(url,options);
  let data={};
  try{data=await res.json()}catch(e){}
  if(!res.ok){const err=new Error(errorMessage(data,res.status));err.status=res.status;throw err}
  return data;
}
async function signIn(email,password){
  if(!enabled)throw new Error("SYNC_DISABLED");
  const url=`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`;
  const data=await requestJson(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})});
  const s={uid:data.localId,email:data.email||email,idToken:data.idToken,refreshToken:data.refreshToken,expiresAt:Date.now()+(Number(data.expiresIn)||3600)*1000};
  writeSession(s);return currentUser();
}
async function refreshSession(){
  const s=readSession();
  if(!s?.refreshToken)throw new Error("AUTH_REQUIRED");
  const url=`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`;
  const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:s.refreshToken});
  const data=await requestJson(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const next={uid:data.user_id||s.uid,email:s.email||"",idToken:data.id_token,refreshToken:data.refresh_token||s.refreshToken,expiresAt:Date.now()+(Number(data.expires_in)||3600)*1000};
  writeSession(next);return next.idToken;
}
async function token(){
  const s=readSession();
  if(!s)throw new Error("AUTH_REQUIRED");
  if(s.idToken&&Number(s.expiresAt)>Date.now()+60000)return s.idToken;
  return refreshSession();
}
function signOut(){stop();writeSession(null)}
function asValue(v){
  if(v===null||v===undefined)return {nullValue:null};
  if(typeof v==="boolean")return {booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  return {stringValue:String(v)};
}
function fromValue(v){
  if(!v)return null;
  if(Object.prototype.hasOwnProperty.call(v,"stringValue"))return v.stringValue;
  if(Object.prototype.hasOwnProperty.call(v,"integerValue"))return Number(v.integerValue);
  if(Object.prototype.hasOwnProperty.call(v,"doubleValue"))return Number(v.doubleValue);
  if(Object.prototype.hasOwnProperty.call(v,"booleanValue"))return !!v.booleanValue;
  if(Object.prototype.hasOwnProperty.call(v,"nullValue"))return null;
  return null;
}
function fieldsToObject(fields={}){const out={};Object.entries(fields).forEach(([k,v])=>out[k]=fromValue(v));return out}
function firestoreBase(){return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents`}
async function saveReview(review){
  if(!enabled)return;
  const id=review?.candidate_id;if(!id)throw new Error("MISSING_CANDIDATE_ID");
  const uid=currentUser()?.uid;if(!uid)throw new Error("AUTH_REQUIRED");
  const clean={candidate_id:id,term:review.term||"",category:review.category||"",action:review.action||"",revised_text:review.revised_text||"",reviewer_id:uid,reviewed_at:review.reviewed_at||new Date().toISOString()};
  const fields={};Object.entries(clean).forEach(([k,v])=>fields[k]=asValue(v));
  const t=await token();
  return requestJson(`${firestoreBase()}/${encodeURIComponent(REVIEW_COLLECTION)}/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json","Authorization":`Bearer ${t}`},body:JSON.stringify({fields})});
}
async function fetchAllReviews(){
  if(!enabled)return [];
  const t=await token();
  let pageToken="",out=[];
  do{
    const qs=new URLSearchParams({pageSize:"1000"});if(pageToken)qs.set("pageToken",pageToken);
    const data=await requestJson(`${firestoreBase()}/${encodeURIComponent(REVIEW_COLLECTION)}?${qs}`,{headers:{"Authorization":`Bearer ${t}`}});
    (data.documents||[]).forEach(d=>out.push(fieldsToObject(d.fields||{})));
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return out.filter(r=>r&&r.candidate_id);
}
async function start(onReviews,onStatus){
  if(!enabled)return;
  stop();
  const pull=async()=>{
    try{const rows=await fetchAllReviews();onReviews?.(rows);onStatus?.("synced",null)}
    catch(e){onStatus?.("error",e)}
  };
  await pull();
  timer=setInterval(pull,POLL_MS);
}
function stop(){if(timer){clearInterval(timer);timer=null}}

window.HG_SYNC={enabled,hasSession,currentUser,signIn,signOut,start,stop,saveReview,fetchAllReviews};
})();

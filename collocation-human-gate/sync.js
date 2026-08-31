(() => {
"use strict";

const cfg=window.COLLOCATION_HG_FIREBASE_CONFIG||{};
const enabled=cfg.enabled===true&&!!cfg.apiKey&&!!cfg.projectId;
const REVIEW_COLLECTION=cfg.reviewCollection||"collocationHumanGateReviewsV1_1";
const GENERATION_VERSION=cfg.generationVersion||"collocation-v1.1-2026-08-31";
const FIREBASE_APP_URL="https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
const FIREBASE_AUTH_URL="https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
const FIREBASE_FIRESTORE_URL="https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

let servicePromise=null;
let listenerOff=null;
let authRef=null;

async function services(){
  if(!enabled)throw new Error("SYNC_DISABLED");
  if(!servicePromise){
    servicePromise=(async()=>{
      const [appMod,authMod,firestoreMod]=await Promise.all([
        import(FIREBASE_APP_URL),
        import(FIREBASE_AUTH_URL),
        import(FIREBASE_FIRESTORE_URL)
      ]);
      const app=appMod.initializeApp({apiKey:cfg.apiKey,projectId:cfg.projectId},"collocation-human-gate-v1-1");
      const auth=authMod.initializeAuth(app,{persistence:authMod.browserLocalPersistence});
      authRef=auth;
      if(typeof auth.authStateReady==="function")await auth.authStateReady();
      else await new Promise(resolve=>{const off=authMod.onAuthStateChanged(auth,()=>{off();resolve()})});
      const db=firestoreMod.getFirestore(app);
      return {auth,db,authMod,firestoreMod};
    })();
  }
  return servicePromise;
}

async function ready(){await services()}
function currentUser(){const user=authRef?.currentUser;return user?{uid:user.uid,email:user.email||""}:null}
function hasSession(){return !!authRef?.currentUser}
function reviewId(collocationId,uid=currentUser()?.uid){
  if(!collocationId)throw new Error("MISSING_COLLOCATION_ID");
  if(!uid)throw new Error("AUTH_REQUIRED");
  return `${collocationId}__${uid}`;
}

async function signIn(email,password){
  const {auth,authMod}=await services();
  await authMod.signInWithEmailAndPassword(auth,email,password);
  return currentUser();
}
async function signOut(){
  stop();
  const {auth,authMod}=await services();
  await authMod.signOut(auth);
}

function cleanReview(review){
  const uid=currentUser()?.uid;
  if(!uid)throw new Error("AUTH_REQUIRED");
  if(review?.reviewer_id&&review.reviewer_id!==uid)throw new Error("REVIEWER_MISMATCH");
  const collocationId=String(review?.collocation_id||"").trim();
  const termId=String(review?.term_id||"").trim();
  const action=String(review?.review_action||"");
  const revised=action==="EDIT"?String(review?.revised_collocation_text||"").trim():"";
  if(!collocationId)throw new Error("MISSING_COLLOCATION_ID");
  if(!termId)throw new Error("MISSING_TERM_ID");
  if(!["HEART","EDIT","REJECT"].includes(action))throw new Error("INVALID_REVIEW_ACTION");
  if(action==="EDIT"&&!revised)throw new Error("EMPTY_EDIT");
  const id=reviewId(collocationId,uid);
  return {
    schema_version:1,
    review_id:id,
    collocation_id:collocationId,
    term_id:termId,
    generation_version:GENERATION_VERSION,
    reviewer_id:uid,
    review_action:action,
    revised_collocation_text:revised,
    notes:String(review?.notes||""),
    client_reviewed_at:String(review?.client_reviewed_at||new Date().toISOString())
  };
}

async function saveReview(review){
  const {db,firestoreMod}=await services();
  const clean=cleanReview(review);
  const payload={...clean,updated_at:firestoreMod.serverTimestamp()};
  await firestoreMod.setDoc(firestoreMod.doc(db,REVIEW_COLLECTION,clean.review_id),payload);
  return clean;
}

function rowFromDoc(doc){
  const data=doc.data();
  return data&&data.collocation_id?{...data,review_id:doc.id}:null;
}

async function start(onSnapshotRows,onStatus){
  stop();
  const {db,firestoreMod}=await services();
  if(!currentUser())throw new Error("AUTH_REQUIRED");
  return new Promise((resolve,reject)=>{
    let first=true;
    listenerOff=firestoreMod.onSnapshot(
      firestoreMod.collection(db,REVIEW_COLLECTION),
      snapshot=>{
        const rows=first
          ? snapshot.docs.map(rowFromDoc).filter(Boolean)
          : snapshot.docChanges().filter(change=>change.type!=="removed").map(change=>rowFromDoc(change.doc)).filter(Boolean);
        onSnapshotRows?.(rows,{initial:first,fromCache:snapshot.metadata.fromCache});
        onStatus?.("synced",{initial:first,fromCache:snapshot.metadata.fromCache,changes:rows.length});
        if(first){first=false;resolve()}
      },
      error=>{
        onStatus?.("error",error);
        if(first){first=false;reject(error)}
      }
    );
  });
}

function stop(){if(listenerOff){listenerOff();listenerOff=null}}
function isPermissionDenied(error){return error?.code==="permission-denied"||String(error?.message||"").includes("permission-denied")}

window.COLLOCATION_HG_SYNC={
  enabled,reviewCollection:REVIEW_COLLECTION,generationVersion:GENERATION_VERSION,
  ready,currentUser,hasSession,reviewId,signIn,signOut,cleanReview,saveReview,start,stop,isPermissionDenied
};
})();

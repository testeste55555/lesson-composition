(() => {
"use strict";

const cfg=window.HG_FIREBASE_CONFIG||{};
const enabled=cfg.enabled===true&&!!cfg.apiKey&&!!cfg.projectId;
const REVIEW_COLLECTION=cfg.reviewCollection||"humanGateReviews";
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
      const app=appMod.initializeApp({apiKey:cfg.apiKey,projectId:cfg.projectId});
      const auth=authMod.initializeAuth(app,{persistence:authMod.browserSessionPersistence});
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
function currentUser(){const u=authRef?.currentUser;return u?{uid:u.uid,email:u.email||""}:null}
function hasSession(){return !!authRef?.currentUser}

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
  const id=review?.candidate_id;if(!id)throw new Error("MISSING_CANDIDATE_ID");
  const uid=currentUser()?.uid;if(!uid)throw new Error("AUTH_REQUIRED");
  return {
    candidate_id:id,
    term:review.term||"",
    category:review.category||"",
    action:review.action||"",
    revised_text:review.revised_text||"",
    reviewer_id:uid,
    reviewed_at:review.reviewed_at||new Date().toISOString()
  };
}

async function saveReview(review){
  if(!enabled)return;
  const {db,firestoreMod}=await services();
  const clean=cleanReview(review);
  await firestoreMod.setDoc(firestoreMod.doc(db,REVIEW_COLLECTION,clean.candidate_id),clean);
}

async function fetchAllReviews(){
  if(!enabled)return [];
  const {db,firestoreMod}=await services();
  if(!currentUser())throw new Error("AUTH_REQUIRED");
  const snap=await firestoreMod.getDocs(firestoreMod.collection(db,REVIEW_COLLECTION));
  return snap.docs.map(d=>d.data()).filter(r=>r&&r.candidate_id);
}

async function start(onReviews,onStatus){
  if(!enabled)return;
  stop();
  const {db,firestoreMod}=await services();
  if(!currentUser())throw new Error("AUTH_REQUIRED");

  return new Promise((resolve,reject)=>{
    let first=true;
    listenerOff=firestoreMod.onSnapshot(
      firestoreMod.collection(db,REVIEW_COLLECTION),
      snap=>{
        const rows=first
          ? snap.docs.map(d=>d.data())
          : snap.docChanges().filter(c=>c.type!=="removed").map(c=>c.doc.data());
        onReviews?.(rows);
        onStatus?.("synced",{initial:first,fromCache:snap.metadata.fromCache,changes:rows.length});
        if(first){first=false;resolve()}
      },
      err=>{
        onStatus?.("error",err);
        if(first){first=false;reject(err)}
      }
    );
  });
}

function stop(){
  if(listenerOff){listenerOff();listenerOff=null}
}

window.HG_SYNC={enabled,ready,hasSession,currentUser,signIn,signOut,start,stop,saveReview,fetchAllReviews};
})();

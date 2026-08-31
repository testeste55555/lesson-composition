(() => {
"use strict";

const DATA=window.COLLOCATION_HG_DATA;
const MODEL=window.COLLOCATION_HG_MODEL;
const SYNC=window.COLLOCATION_HG_SYNC;
const CACHE_KEY="collocation_human_gate_v1_1_shared_cache";
const PENDING_KEY="collocation_human_gate_v1_1_pending_writes";
const LOCAL_ONLY_KEY="collocation_human_gate_v1_1_reviews";
const ACTIONS=new Set(["HEART","EDIT","REJECT"]);

const app=document.getElementById("app");
const account=document.getElementById("account");
const accountEmail=document.getElementById("accountEmail");
const toolbar=document.getElementById("toolbar");
const crumbs=document.getElementById("crumbs");
const syncBar=document.getElementById("syncBar");
const syncState=document.getElementById("syncState");
const retryBtn=document.getElementById("retryBtn");
const footerNote=document.getElementById("footerNote");
const exportToggle=document.getElementById("exportToggle");
const exportMenu=document.getElementById("exportMenu");
const toast=document.getElementById("toast");

const terms=DATA.terms.filter(row=>row.is_active==="TRUE");
const candidates=DATA.candidates.filter(row=>row.is_active==="TRUE");
const categories=[...new Set(terms.map(row=>row.category))];
const candidatesById=new Map(candidates.map(row=>[row.collocation_id,row]));
let reviews=loadObject(CACHE_KEY);
let pending=loadObject(PENDING_KEY);
let route={category:null,termId:null};
let editOpen=null;
let listenerStarted=false;
let flushing=false;
let migrationCount=localOnlyReviewCount();
let toastTimer=null;

function loadObject(key){
  try{
    const parsed=JSON.parse(localStorage.getItem(key)||"{}");
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch{return {}}
}

function saveObject(key,value){
  localStorage.setItem(key,JSON.stringify(value));
}

function localOnlyReviewCount(){
  try{
    const raw=localStorage.getItem(LOCAL_ONLY_KEY);
    if(!raw)return 0;
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed.reviews==="object"&&!Array.isArray(parsed.reviews))return Object.keys(parsed.reviews).length;
    return Array.isArray(parsed)?parsed.length:Object.keys(parsed||{}).length;
  }catch{return 1}
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

function setSync(kind,label,{retry=false}={}){
  syncBar.hidden=false;
  syncState.className=`syncstate ${kind}`;
  syncState.textContent=label;
  retryBtn.hidden=!retry;
}

function notify(message){
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("show"),2200);
}

function pendingCount(uid=SYNC.currentUser()?.uid){
  const rows=Object.values(pending);
  return uid?rows.filter(row=>row.reviewer_id===uid).length:rows.length;
}

function ownReview(collocationId){
  const uid=SYNC.currentUser()?.uid;
  return uid?reviews[`${collocationId}__${uid}`]||null:null;
}

function renderShell(){
  const user=SYNC.currentUser();
  account.hidden=!user;
  accountEmail.textContent=user?.email||"";
  toolbar.hidden=!user;
  footerNote.hidden=!user;
  if(!user)return;
  renderCrumbs();
  if(route.termId)renderTerm(route.termId);
  else if(route.category)renderTerms(route.category);
  else renderCategories();
}

function renderCrumbs(){
  const parts=[`<button class="crumb" data-route="home" ${!route.category?"disabled":""}>カテゴリー</button>`];
  if(route.category){
    parts.push(`<span class="sep">›</span><button class="crumb" data-route="category" ${!route.termId?"disabled":""}>${escapeHtml(route.category)}</button>`);
  }
  if(route.termId){
    const term=terms.find(row=>row.term_id===route.termId);
    parts.push(`<span class="sep">›</span><button class="crumb" disabled>${escapeHtml(term?.term||route.termId)}</button>`);
  }
  crumbs.innerHTML=parts.join("");
}

function summaryHtml(){
  const states=candidates.map(candidate=>MODEL.candidateState(candidate,reviews));
  const termStates=terms.map(term=>MODEL.termState(term.term_id,candidates,reviews));
  return `<div class="summary">
    <div class="metric"><strong>${terms.length}</strong><span>対象語</span></div>
    <div class="metric"><strong>${candidates.length}</strong><span>候補</span></div>
    <div class="metric"><strong>${states.filter(row=>row.status==="RESOLVED").length}</strong><span>確定候補</span></div>
    <div class="metric"><strong>${states.filter(row=>row.status==="CONFLICT").length}</strong><span>判定不一致</span></div>
    <div class="metric"><strong>${termStates.filter(row=>["DONE","REGENERATE_REQUIRED"].includes(row.status)).length}</strong><span>判定終了語</span></div>
  </div>`;
}

function renderCategories(){
  app.innerHTML=`${migrationNotice()}${summaryHtml()}<h2>カテゴリー</h2><div class="grid">${categories.map(category=>{
    const state=MODEL.categoryState(category,terms,candidates,reviews);
    return `<button class="card clickcard" data-category="${escapeHtml(category)}"><div class="cardtop"><h3>${escapeHtml(category)}</h3><span class="mini">${state.ended} / ${state.total}語</span></div><div class="bar"><i style="width:${state.percent}%"></i></div><div class="mini">${state.percent}%</div>${state.regenerate?`<div class="regen">要再生成 ${state.regenerate}語</div>`:""}${state.conflicts?`<div class="conflict-text">判定不一致 ${state.conflicts}語</div>`:""}</button>`;
  }).join("")}</div>`;
}

function statusLabel(state){
  if(state.conflicts)return ["⚠ 判定不一致","s-conflict"];
  return ({UNSTARTED:["○ 未着手","s-unstarted"],IN_PROGRESS:["● 途中","s-progress"],DONE:["✓ 完了","s-done"],REGENERATE_REQUIRED:["⚠ 要再生成","s-regen"]})[state.status]||[state.status,"s-unstarted"];
}

function renderTerms(category){
  const categoryTerms=terms.filter(term=>term.category===category);
  const state=MODEL.categoryState(category,terms,candidates,reviews);
  app.innerHTML=`${migrationNotice()}<h2>${escapeHtml(category)}</h2><p class="help">判定終了 ${state.ended} / ${state.total}語${state.regenerate?`・要再生成 ${state.regenerate}語`:""}${state.conflicts?`・判定不一致 ${state.conflicts}語`:""}</p><div class="grid">${categoryTerms.map(term=>{
    const termState=MODEL.termState(term.term_id,candidates,reviews);
    const [label,klass]=statusLabel(termState);
    return `<button class="card clickcard" data-term="${term.term_id}"><div class="cardtop"><div><h3>${escapeHtml(term.term)}</h3><span class="mini">${term.term_id}・${termState.resolved}/${termState.total}候補確定</span></div><span class="status ${klass}">${label}</span></div>${termState.conflicts?`<div class="conflict-text">${termState.conflicts}件の不一致</div>`:""}</button>`;
  }).join("")}</div>`;
}

function renderTerm(termId){
  const term=terms.find(row=>row.term_id===termId);
  if(!term){route.termId=null;renderShell();return}
  const rows=candidates.filter(candidate=>candidate.term_id===termId);
  const termState=MODEL.termState(termId,candidates,reviews);
  const [label,klass]=statusLabel(termState);
  app.innerHTML=`${migrationNotice()}<section class="termhead"><div><div class="termword">${escapeHtml(term.term)}</div><span class="tag">${term.term_id}</span><span class="tag">${escapeHtml(term.category)}</span></div><div><span class="status ${klass}">${label}</span><div class="mini" style="margin-top:7px">${termState.resolved}/${termState.total}候補確定</div></div></section><p class="help">この語について残したい使用を、♥／修正／×で判定してください。内部分類による分割はありません。</p><div class="candidate-list">${rows.map(candidateCard).join("")}</div>`;
}

function candidateCard(candidate){
  const state=MODEL.candidateState(candidate,reviews);
  const mine=ownReview(candidate.collocation_id);
  const uid=SYNC.currentUser()?.uid;
  const other=state.reviews.some(review=>review.reviewer_id!==uid);
  const selected=action=>mine?.review_action===action?" selected":"";
  const open=editOpen===candidate.collocation_id;
  const revised=mine?.review_action==="EDIT"?mine.revised_collocation_text:candidate.collocation_text;
  return `<article class="candidate ${state.status==="CONFLICT"?"conflict":state.status==="RESOLVED"?"reviewed":""}" data-candidate="${candidate.collocation_id}"><div class="candrow"><div><div class="candtext">${escapeHtml(candidate.collocation_text)}</div><div class="candmeta">${candidate.collocation_id}</div><div class="badges">${other?`<span class="tag other-tag">他の判定あり</span>`:""}${state.status==="CONFLICT"?`<span class="tag conflict-tag">⚠ 判定不一致</span>`:""}</div>${mine?.review_action==="EDIT"?`<div class="effective">修正案：${escapeHtml(mine.revised_collocation_text)}</div>`:""}</div><div class="actions" aria-label="判定"><button class="act heart${selected("HEART")}" data-action="HEART" title="残す" aria-label="残す">♥</button><button class="act edit${selected("EDIT")}" data-action="EDIT" title="修正" aria-label="修正">✎</button><button class="act reject${selected("REJECT")}" data-action="REJECT" title="不採用" aria-label="不採用">×</button></div></div><div class="editpanel ${open?"open":""}"><label>修正後のコロケーション</label><textarea data-edit-text>${escapeHtml(revised)}</textarea><div class="editbuttons"><button class="softbtn" data-edit-cancel>キャンセル</button><button class="primary" data-edit-save>修正を保存</button></div></div></article>`;
}

function migrationNotice(){
  return migrationCount?`<div class="notice"><strong>LOCAL_REVIEW_MIGRATION_REQUIRED</strong>：旧ローカル判定 ${migrationCount}件を検出しました。自動移植はしていません。</div>`:"";
}

function renderLogin(message=""){
  account.hidden=true;toolbar.hidden=true;footerNote.hidden=true;syncBar.hidden=true;
  app.innerHTML=`<section class="login"><h2>教員ログイン</h2><p class="help">認証済みのHuman Gateメンバーアカウントを使用してください。</p>${migrationNotice()}${message?`<div class="notice">${escapeHtml(message)}</div>`:""}<form class="loginform" id="loginForm"><label>メールアドレス<input type="email" name="email" autocomplete="username" required></label><label>パスワード<input type="password" name="password" autocomplete="current-password" required></label><button class="primary" type="submit">ログイン</button></form></section>`;
}

function reviewPayload(candidate,action,revised=""){
  return SYNC.cleanReview({collocation_id:candidate.collocation_id,term_id:candidate.term_id,review_action:action,revised_collocation_text:revised,notes:"",client_reviewed_at:new Date().toISOString()});
}

async function choose(candidateId,action,revised=""){
  const candidate=candidatesById.get(candidateId);
  if(!candidate||!ACTIONS.has(action))return;
  let review;
  try{review=reviewPayload(candidate,action,revised)}catch(error){notify(error.message==="EMPTY_EDIT"?"修正後の語を入力してください":"判定を保存できません");return}
  reviews[review.review_id]=review;
  pending[review.review_id]=review;
  saveObject(CACHE_KEY,reviews);saveObject(PENDING_KEY,pending);
  editOpen=null;renderShell();
  await flushPending();
}

async function flushPending(){
  if(flushing||!SYNC.currentUser())return;
  const uid=SYNC.currentUser().uid;
  const rows=Object.values(pending).filter(row=>row.reviewer_id===uid);
  if(!rows.length){setSync("synced","同期済み");return}
  flushing=true;setSync("saving",`保存中（${rows.length}件）`);
  try{
    for(const row of rows){
      await SYNC.saveReview(row);
      delete pending[row.review_id];
      saveObject(PENDING_KEY,pending);
    }
    setSync("synced","同期済み");
  }catch(error){
    const denied=SYNC.isPermissionDenied(error);
    setSync(denied?"membership":"pending",denied?"MEMBERSHIP_SETUP_REQUIRED：利用メンバー登録を確認してください":`未同期（${pendingCount()}件）`,{retry:true});
  }finally{
    flushing=false;
    if(!editOpen)renderShell();
  }
}

function mergeSnapshot(rows,{initial=false}={}){
  if(initial){
    reviews=Object.fromEntries(rows.map(row=>[row.review_id,row]));
  }else{
    rows.forEach(row=>{reviews[row.review_id]=row});
  }
  Object.values(pending).forEach(row=>{reviews[row.review_id]=row});
  saveObject(CACHE_KEY,reviews);
  if(!editOpen)renderShell();
}

async function connect(){
  if(listenerStarted)return;
  listenerStarted=true;setSync("saving","同期を開始しています…");
  try{
    await SYNC.start(mergeSnapshot,(state,detail)=>{
      if(state==="synced")setSync(pendingCount()?"pending":"synced",pendingCount()?`未同期（${pendingCount()}件）`:detail.fromCache?"端末キャッシュを表示中":"同期済み",{retry:pendingCount()>0});
    });
    await flushPending();
  }catch(error){
    listenerStarted=false;
    const denied=SYNC.isPermissionDenied(error);
    setSync(denied?"membership":"error",denied?"MEMBERSHIP_SETUP_REQUIRED：利用メンバー登録を確認してください":"同期エラー",{retry:true});
  }
}

function csvEscape(value){
  const text=String(value??"");
  return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

function downloadCsv(filename,columns,rows){
  const lines=[columns.join(","),...rows.map(row=>columns.map(column=>csvEscape(row[column])).join(","))];
  const url=URL.createObjectURL(new Blob(["\ufeff",lines.join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
  notify(`${rows.length}件を出力しました`);
}

function runExport(type){
  const definitions={
    reviews:{filename:"collocation_human_gate_v1_1_all_reviews.csv",columns:["collocation_id","term_id","term","category","collocation_text","reviewer_id","review_action","revised_collocation_text","effective_collocation_text","client_reviewed_at","generation_version"],rows:MODEL.allReviewRows(candidates,reviews)},
    accepted:{filename:"collocation_human_gate_v1_1_accepted_resolved.csv",columns:["collocation_id","term_id","term","category","effective_collocation_text","predicate_lemma","scope","generation_version","review_count"],rows:MODEL.acceptedRows(candidates,reviews)},
    regeneration:{filename:"collocation_human_gate_v1_1_regeneration_terms.csv",columns:["term_id","term","category","reason","generation_version"],rows:MODEL.regenerationRows(terms,candidates,reviews)},
    conflicts:{filename:"collocation_human_gate_v1_1_conflicts.csv",columns:["collocation_id","term_id","term","category","collocation_text","review_count","reviewer_ids","review_actions","revised_collocation_texts","generation_version"],rows:MODEL.conflictRows(candidates,reviews)}
  };
  const item=definitions[type];if(item)downloadCsv(item.filename,item.columns,item.rows);
  exportMenu.classList.remove("open");exportToggle.setAttribute("aria-expanded","false");
}

document.addEventListener("click",event=>{
  const categoryButton=event.target.closest("[data-category]");
  if(categoryButton){route={category:categoryButton.dataset.category,termId:null};renderShell();return}
  const termButton=event.target.closest("[data-term]");
  if(termButton){route.termId=termButton.dataset.term;renderShell();return}
  const routeButton=event.target.closest("[data-route]");
  if(routeButton&&!routeButton.disabled){if(routeButton.dataset.route==="home")route={category:null,termId:null};else route.termId=null;renderShell();return}
  const actionButton=event.target.closest("[data-action]");
  if(actionButton){
    const card=actionButton.closest("[data-candidate]");const action=actionButton.dataset.action;
    if(action==="EDIT"){editOpen=card.dataset.candidate;renderShell()}else choose(card.dataset.candidate,action);
    return;
  }
  if(event.target.closest("[data-edit-cancel]")){editOpen=null;renderShell();return}
  if(event.target.closest("[data-edit-save]")){
    const card=event.target.closest("[data-candidate]");const revised=card.querySelector("[data-edit-text]").value.trim();choose(card.dataset.candidate,"EDIT",revised);return;
  }
  const exportButton=event.target.closest("[data-export]");if(exportButton){runExport(exportButton.dataset.export)}
});

app.addEventListener("submit",async event=>{
  if(event.target.id!=="loginForm")return;
  event.preventDefault();const submit=event.target.querySelector("button[type=submit]");submit.disabled=true;submit.textContent="ログイン中…";
  try{
    const data=new FormData(event.target);await SYNC.signIn(data.get("email"),data.get("password"));renderShell();await connect();
  }catch(error){renderLogin("ログインできませんでした。アカウントとパスワードを確認してください。")}
});

document.getElementById("logoutBtn").addEventListener("click",async()=>{
  listenerStarted=false;await SYNC.signOut();route={category:null,termId:null};renderLogin();
});
retryBtn.addEventListener("click",async()=>{SYNC.stop();listenerStarted=false;await connect()});
exportToggle.addEventListener("click",()=>{const open=exportMenu.classList.toggle("open");exportToggle.setAttribute("aria-expanded",String(open))});
window.addEventListener("online",flushPending);

async function init(){
  if(!DATA||!MODEL||!SYNC){app.textContent="初期化に必要なデータを読み込めませんでした。";return}
  if(!SYNC.enabled){renderLogin("Firebase同期が無効です。");return}
  try{
    await SYNC.ready();
    if(SYNC.currentUser()){renderShell();await connect()}else renderLogin();
  }catch{renderLogin("Firebaseへ接続できませんでした。ネットワーク設定を確認してください。")}
}

window.COLLOCATION_HG_APP_TEST={CACHE_KEY,PENDING_KEY,LOCAL_ONLY_KEY,csvEscape,localOnlyReviewCount,reviewPayload,pendingCount};
init();
})();

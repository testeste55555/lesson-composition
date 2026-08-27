(() => {
"use strict";

const RAW=window.HG_CANDIDATES||[];
const CANDIDATES=RAW.map(r=>({
  candidate_id:r[0],term:r[1],category:r[2],candidate_type:r[3],
  case_label:r[4],primary_pattern_id:r[5],primary_pattern:r[6],text:r[7]
}));
const CATEGORY_ORDER=["道具・もの","動作・操作","点検・確認・手順","状態・異常","安全・環境","場所・仕事"];
const SYNC=window.HG_SYNC||{enabled:false};
const STORAGE_KEY=SYNC.enabled?"human_gate_shared_cache_v1":"human_gate_common_state_v2";

let state={schema_version:2,reviews:{},sync_queue:{},ui:{view:"home",category:null,term:null,index:0}};
let reviewerId=null;
let syncState={kind:SYNC.enabled?"waiting":"local",message:SYNC.enabled?"ログイン待ち":"端末内保存"};

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const pct=(a,b)=>b?Math.round(a/b*100):0;

function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;
    const s=JSON.parse(raw);
    if(s&&s.schema_version===2&&s.reviews&&s.ui){state=s;if(!state.sync_queue)state.sync_queue={}}
  }catch(e){}
}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){}}
function reviewed(c){return !!state.reviews[c.candidate_id]}
function candidatesForTerm(term){return CANDIDATES.filter(c=>c.term===term)}
function termsForCategory(cat){return [...new Set(CANDIDATES.filter(c=>c.category===cat).map(c=>c.term))]}
function termStats(term){
  const cs=candidatesForTerm(term),done=cs.filter(reviewed).length;
  return {done,total:cs.length,complete:cs.length>0&&done===cs.length,started:done>0};
}
function categoryStats(cat){
  const terms=termsForCategory(cat),termDone=terms.filter(t=>termStats(t).complete).length;
  const cs=CANDIDATES.filter(c=>c.category===cat),candDone=cs.filter(reviewed).length;
  return {terms,termDone,termTotal:terms.length,candDone,candTotal:cs.length};
}
function overallStats(){
  const terms=[...new Set(CANDIDATES.map(c=>c.term))];
  return {termDone:terms.filter(t=>termStats(t).complete).length,termTotal:terms.length,candDone:CANDIDATES.filter(reviewed).length,candTotal:CANDIDATES.length};
}
function setView(view,extra={}){state.ui={...state.ui,view,...extra};save();render()}
function syncNotice(){
  if(!SYNC.enabled)return "";
  const cls=syncState.kind==="synced"?"syncok":syncState.kind==="error"?"syncerr":"";
  const pending=Object.keys(state.sync_queue||{}).length;
  return `<div class="notice"><div class="syncrow"><strong class="${cls}">共有同期：${esc(syncState.message)}</strong><button class="secondary" id="logoutBtn">ログアウト</button></div><div style="margin-top:6px">Firebase共有モード${pending?`・未送信 ${pending}件`:""}</div></div>`;
}
function wireSyncNotice(){if(SYNC.enabled&&$("logoutBtn"))$("logoutBtn").onclick=()=>{SYNC.signOut();reviewerId=null;syncState={kind:"waiting",message:"ログイン待ち"};renderLogin()}}
function render(){
  $("exportBtn").hidden=false;
  $("actions").hidden=state.ui.view!=="review";
  if(state.ui.view==="home")renderHome();
  else if(state.ui.view==="category")renderCategory();
  else renderReview();
}
function renderLogin(message=""){
  $("headerTitle").textContent="共有Human Gate";$("exportBtn").hidden=true;$("actions").hidden=true;
  $("main").innerHTML=`<section class="panel"><h2 class="sectiontitle">教師ログイン</h2><div class="sub">2人の判定結果と進捗を共有します。メールアドレスとパスワードはFirebase Authenticationの認証にだけ使用し、このアプリには保存しません。</div>${message?`<div class="notice syncerr">${esc(message)}</div>`:""}<form class="loginform" id="loginForm"><label>メールアドレス<input id="loginEmail" type="email" autocomplete="username" required></label><label>パスワード<input id="loginPassword" type="password" autocomplete="current-password" required></label><button class="primary" id="loginBtn" type="submit">ログイン</button></form></section>`;
  $("loginForm").onsubmit=async e=>{e.preventDefault();const btn=$("loginBtn");btn.disabled=true;btn.textContent="ログイン中…";try{await SYNC.signIn($("loginEmail").value.trim(),$("loginPassword").value);reviewerId=SYNC.currentUser()?.uid||null;await connectShared()}catch(err){renderLogin("ログインできませんでした。アカウントまたはFirebase設定を確認してください。")}};
}
function renderHome(){
  $("headerTitle").textContent="Human Gate";
  const s=overallStats(),cats=CATEGORY_ORDER.filter(c=>termsForCategory(c).length);
  $("main").innerHTML=`
    <section class="panel overall"><div class="bigrow"><div><strong>職種共通のことば</strong><div class="sub">全体進捗</div></div><div class="status">${s.termDone} / ${s.termTotal}語 完了</div></div><div class="bar"><div style="width:${pct(s.candDone,s.candTotal)}%"></div></div><div class="sub" style="margin-top:8px">${s.candDone} / ${s.candTotal}候補を判定済み（${pct(s.candDone,s.candTotal)}%）</div>${syncNotice()}</section>
    <h2 class="sectiontitle">カテゴリーを選ぶ</h2>
    <div class="categorylist">${cats.map(cat=>{const x=categoryStats(cat);return `<button class="catcard" data-cat="${esc(cat)}"><div class="cathead"><span class="catname">${esc(cat)}</span><span class="status">${x.termDone} / ${x.termTotal}語</span></div><div class="minibar"><div style="width:${pct(x.candDone,x.candTotal)}%"></div></div><div class="sub" style="margin-top:7px">${x.candDone} / ${x.candTotal}候補　${pct(x.candDone,x.candTotal)}%</div></button>`}).join("")}</div>`;
  wireSyncNotice();
  document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>setView("category",{category:b.dataset.cat,term:null,index:0}));
}
function renderCategory(){
  const cat=state.ui.category,x=categoryStats(cat),next=x.terms.find(t=>!termStats(t).complete);
  $("headerTitle").textContent=cat;
  $("main").innerHTML=`<div class="breadcrumb"><button class="crumbbtn" id="homeBtn">職種共通</button><span>›</span><strong>${esc(cat)}</strong></div><section class="panel overall"><div class="bigrow"><div><strong>${esc(cat)}</strong><div class="sub">カテゴリー進捗</div></div><div class="status">${x.termDone} / ${x.termTotal}語 完了</div></div><div class="bar"><div style="width:${pct(x.candDone,x.candTotal)}%"></div></div><div class="sub" style="margin-top:8px">${x.candDone} / ${x.candTotal}候補を判定済み（${pct(x.candDone,x.candTotal)}%）</div></section><div class="toolbar">${next?`<button class="primary" id="nextTermBtn">次の未完了語：${esc(next)}</button>`:`<button class="secondary" disabled>このカテゴリーは完了しました ✓</button>`}</div><div class="termlist">${x.terms.map(term=>{const s=termStats(term),cls=s.complete?"done":s.started?"partial":"none",label=s.complete?"✓ 完了":s.started?`◐ ${s.done} / ${s.total}`:"○ 未着手";return `<button class="termcard" data-term="${esc(term)}"><div class="termhead"><span class="termname">${esc(term)}</span><span class="status ${cls}">${label}</span></div><div class="minibar"><div style="width:${pct(s.done,s.total)}%"></div></div></button>`}).join("")}</div>`;
  $("homeBtn").onclick=()=>setView("home",{category:null,term:null,index:0});if(next)$("nextTermBtn").onclick=()=>openTerm(next,true);document.querySelectorAll("[data-term]").forEach(b=>b.onclick=()=>openTerm(b.dataset.term,true));
}
function openTerm(term,preferUnreviewed){const cs=candidatesForTerm(term);let idx=0;if(preferUnreviewed){const n=cs.findIndex(c=>!reviewed(c));idx=n>=0?n:0}state.ui={view:"review",category:cs[0]?.category||state.ui.category,term,index:idx};save();render()}
function currentTermCandidates(){return candidatesForTerm(state.ui.term)}
function currentCandidate(){return currentTermCandidates()[state.ui.index]}
function reviewLabel(rv){if(!rv)return "未判定";if(rv.action==="HEART")return "✓ 採用済み";if(rv.action==="EDIT")return "✎ 修正して採用済み";if(rv.action==="REJECT")return "× 不採用済み";return "判定済み"}
function renderReview(){
  const cat=state.ui.category,term=state.ui.term,cs=currentTermCandidates();if(!cs.length){setView("category",{term:null,index:0});return}
  const i=Math.max(0,Math.min(state.ui.index,cs.length-1));state.ui.index=i;const c=cs[i],rv=state.reviews[c.candidate_id],s=termStats(term);
  $("headerTitle").textContent=term;
  $("main").innerHTML=`<div class="breadcrumb"><button class="crumbbtn" id="homeBtn">職種共通</button><span>›</span><button class="crumbbtn" id="catBtn">${esc(cat)}</button><span>›</span><strong>${esc(term)}</strong></div><section class="panel"><div class="bigrow"><div><strong>${esc(term)}</strong><div class="sub">この語の進捗</div></div><div class="status">${s.done} / ${s.total}</div></div><div class="bar"><div style="width:${pct(s.done,s.total)}%"></div></div></section><div class="reviewwrap" style="margin-top:12px"><div class="meta"><span class="tag">${esc(c.candidate_type)}</span><span class="tag">${esc(c.case_label)}</span><span class="tag">${esc(c.primary_pattern)}</span></div><section class="reviewcard"><div class="sentence" id="sentence">${esc(c.text)}</div><textarea class="editarea" id="editArea" hidden></textarea></section><div class="reviewstate">${reviewLabel(rv)}</div></div>`;
  $("homeBtn").onclick=()=>setView("home",{category:null,term:null,index:0});$("catBtn").onclick=()=>setView("category",{term:null,index:0});exitEdit();$("prevBtn").disabled=i===0;$("nextBtn").textContent=i===cs.length-1?"カテゴリーへ戻る":"次の文 →";
}
function advanceAfterReview(){const cs=currentTermCandidates();let next=cs.findIndex((c,j)=>j>state.ui.index&&!reviewed(c));if(next<0)next=cs.findIndex(c=>!reviewed(c));if(next>=0){state.ui.index=next;save();render();return}setView("category",{term:null,index:0})}
async function pushReview(rec){
  if(!SYNC.enabled)return;
  try{await SYNC.saveReview(rec);if(state.sync_queue?.[rec.candidate_id]?.reviewed_at===rec.reviewed_at)delete state.sync_queue[rec.candidate_id];save();syncState={kind:"synced",message:"同期済み"}}
  catch(e){syncState={kind:"error",message:"同期エラー・端末に一時保存"}}
}
function applyReview(action,revised=""){
  const c=currentCandidate();const rec={candidate_id:c.candidate_id,term:c.term,category:c.category,action,revised_text:revised,reviewer_id:reviewerId,reviewed_at:new Date().toISOString()};
  state.reviews[c.candidate_id]=rec;if(SYNC.enabled)state.sync_queue[c.candidate_id]=rec;save();pushReview(rec);advanceAfterReview();
}
function enterEdit(){const c=currentCandidate(),rv=state.reviews[c.candidate_id],ta=$("editArea");ta.hidden=false;ta.value=rv?.revised_text||c.text;$("sentence").hidden=true;$("normalActions").style.display="none";$("editActions").style.display="grid";ta.focus()}
function exitEdit(){const ta=$("editArea"),s=$("sentence");if(ta)ta.hidden=true;if(s)s.hidden=false;$("normalActions").style.display="grid";$("editActions").style.display="none"}
function move(delta){const cs=currentTermCandidates(),ni=state.ui.index+delta;if(ni<0)return;if(ni>=cs.length){setView("category",{term:null,index:0});return}state.ui.index=ni;save();render()}
function csvEscape(v){return '"'+String(v??"").replace(/"/g,'""')+'"'}
function exportCSV(){
  const h=["candidate_id","term","category","candidate_type","case_label","primary_pattern_id","primary_pattern","text","review_status","review_action","revised_text","reviewer_id","reviewed_at"];
  const lines=[h.map(csvEscape).join(",")];CANDIDATES.forEach(c=>{const r=state.reviews[c.candidate_id],o={...c,review_status:r?"REVIEWED":"UNREVIEWED",review_action:r?.action||"",revised_text:r?.revised_text||"",reviewer_id:r?.reviewer_id||"",reviewed_at:r?.reviewed_at||""};lines.push(h.map(k=>csvEscape(o[k])).join(","))});
  const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`human_gate_results_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
function stamp(r){const n=Date.parse(r?.reviewed_at||"");return Number.isFinite(n)?n:0}
function mergeRemote(rows,rerender=true){
  let changed=false;(rows||[]).forEach(r=>{if(!r?.candidate_id||state.sync_queue?.[r.candidate_id])return;const local=state.reviews[r.candidate_id];if(!local||stamp(r)>=stamp(local)){state.reviews[r.candidate_id]=r;changed=true}});if(changed){save();if(rerender)render()}
}
async function flushPending(){for(const rec of Object.values(state.sync_queue||{})){try{await SYNC.saveReview(rec);if(state.sync_queue?.[rec.candidate_id]?.reviewed_at===rec.reviewed_at)delete state.sync_queue[rec.candidate_id]}catch(e){syncState={kind:"error",message:"同期エラー・端末に一時保存"};break}}save()}
async function connectShared(){
  reviewerId=SYNC.currentUser()?.uid||null;syncState={kind:"syncing",message:"同期中"};render();
  try{const rows=await SYNC.fetchAllReviews();mergeRemote(rows,false);await flushPending();syncState={kind:"synced",message:"同期済み"};render();await SYNC.start(rows=>mergeRemote(rows,true),(kind)=>{if(kind==="error"){syncState={kind:"error",message:"同期エラー・端末に一時保存"};if(state.ui.view==="home")render()}else{syncState={kind:"synced",message:"同期済み"};if(state.ui.view==="home")render()}})}catch(e){syncState={kind:"error",message:"同期できません"};render()}
}

$("heartBtn").onclick=()=>applyReview("HEART");$("rejectBtn").onclick=()=>applyReview("REJECT");$("editBtn").onclick=enterEdit;$("cancelEditBtn").onclick=exitEdit;$("saveEditBtn").onclick=()=>{const v=$("editArea").value.trim();if(v)applyReview("EDIT",v)};$("prevBtn").onclick=()=>move(-1);$("nextBtn").onclick=()=>move(1);$("exportBtn").onclick=exportCSV;
document.addEventListener("keydown",e=>{if(state.ui.view!=="review")return;const ta=$("editArea");if(ta&&!ta.hidden)return;if(e.key==="1")applyReview("HEART");else if(e.key==="2")enterEdit();else if(e.key==="3")applyReview("REJECT");else if(e.key==="ArrowLeft")move(-1);else if(e.key==="ArrowRight")move(1)});

load();if(!CATEGORY_ORDER.includes(state.ui.category)&&state.ui.view!=="home")state.ui={view:"home",category:null,term:null,index:0};
if(SYNC.enabled){if(SYNC.hasSession()){reviewerId=SYNC.currentUser()?.uid||null;connectShared()}else renderLogin()}else render();
})();

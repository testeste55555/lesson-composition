// Result-quality guardrails.
// Keep targets, constraints, and explicit feature needs separate.

// Do not infer optional functions from learner level, L1 composition, or device availability alone.
delete V2.axes.support.items.level.w.a2;
delete V2.axes.support.items.l1.w.prea1;
delete V2.axes.support.items.l1.w.mixed_l1;
V2.axes.support.items.history.w={log:10};

const RESULT_QUALITY_THRESHOLDS={
  activity:{strong:10,recommend:5},
  participation:{strong:8,recommend:4},
  media:{strong:9,recommend:4},
  support:{strong:8,recommend:4},
  role:{strong:8,recommend:4}
};

function qualityAxisKey(axis){
  for(const [k,a] of Object.entries(V2.axes)) if(a===axis)return k;
  return '';
}
function qualityTier(axisKey,score){
  const t=RESULT_QUALITY_THRESHOLDS[axisKey]||{strong:8,recommend:4};
  return score>=t.strong?'強く推奨':score>=t.recommend?'推奨':score>0?'候補':'根拠不足';
}
function qualityClass(label){return label==='強く推奨'?'high':label==='推奨'?'mid':'low'}
function positive(arr){return arr.filter(x=>x.score>0)}
function topOrNull(arr){return positive(arr)[0]||null}
function blendedTop(axisKey,arr){
  const p=positive(arr); if(!p.length)return null;
  const first=p[0],second=p[1];
  const t=RESULT_QUALITY_THRESHOLDS[axisKey];
  if(second&&first.score>0&&second.score>=t.recommend&&second.score/first.score>=.72){
    return `${first.name}＋${second.name}`;
  }
  return first.name;
}

// Preserve raw ranking, but attach absolute confidence. Relative fit alone must not create a strong recommendation.
const _scoreAxisQualityBase=scoreAxis;
scoreAxis=function(axis){
  const key=qualityAxisKey(axis);
  const arr=_scoreAxisQualityBase(axis);
  arr.forEach(x=>{x.qualityTier=qualityTier(key,x.score)});
  return arr;
};

tier=function(x){return x.qualityTier||'候補'};

axisHtml=function(axis,arr){
  const key=qualityAxisKey(axis),shown=positive(arr).slice(0,4);
  if(!shown.length){
    return `<section class="result-axis"><h3>${axis.title}</h3><p class="note">この軸は、現在のチェックだけでは十分な根拠がありません。無理に候補を追加しません。</p></section>`;
  }
  return `<section class="result-axis"><h3>${axis.title}</h3>${shown.map((x,i)=>{const label=qualityTier(key,x.score);return `<div class="rank"><div class="rank-line"><span class="rank-num">${i+1}</span><b>${x.name}</b><span class="tier ${qualityClass(label)}">${label}</span></div><p>${x.desc}</p>${x.reasons.length?`<div class="chips">${x.reasons.slice(0,5).map(r=>`<span>${r}</span>`).join('')}</div>`:''}</div>`}).join('')}</section>`;
};

judge=function(){
  if(!state.size){alert('まず項目をいくつか選んでください。');return}
  const scored={};for(const[k,a]of Object.entries(V2.axes))scored[k]=scoreAxis(a);
  const A=topOrNull(scored.activity),P=topOrNull(scored.participation),M=topOrNull(scored.media),S=topOrNull(scored.support),R=topOrNull(scored.role);
  const activityLabel=blendedTop('activity',scored.activity)||'活動条件を追加してください';
  const participationLabel=blendedTop('participation',scored.participation)||'参加形態を追加してください';
  const mediaLabel=M?M.name:'未確定（活動・教室条件から選択）';
  const supportLabel=S?S.name:'追加機能なしでも可';
  const roleLabel=R?R.name:'授業内役割を追加してください';
  let blocks='';
  if(currentMode==='existing'&&fileAnalysis.blocks.length)blocks=`<section class="block-advice"><h3>元授業の活動ブロック</h3><p class="note">授業全体を一つの形式にせず、ブロックごとに媒体・活動を変える前提で検討します。</p>${fileAnalysis.blocks.map(b=>`<span class="block">${b.name}</span>`).join('')}</section>`;
  const result=$('#result');
  result.innerHTML=`<h2>判定結果</h2><div class="summary"><span>${currentMode==='existing'?'既存授業の推奨再構成':'推奨する授業の骨格'}</span><strong>${activityLabel} × ${participationLabel}</strong><p>主媒体：${mediaLabel} ／ 優先補助：${supportLabel} ／ 主な役割：${roleLabel}</p></div>${blocks}${changePlan()}${Object.entries(V2.axes).map(([k,a])=>axisHtml(a,scored[k])).join('')}<section class="result-actions"><button class="secondary" id="copyResult">結果をコピー</button></section>`;
  result.classList.add('show');
  $('#copyResult').onclick=async()=>{try{await navigator.clipboard.writeText(result.innerText);alert('結果をコピーしました')}catch{alert('コピーできませんでした')}};
  result.scrollIntoView({behavior:'smooth',block:'start'});
};

globalThis.__LESSON_RESULT_QUALITY__={RESULT_QUALITY_THRESHOLDS,qualityTier,positive,blendedTop};

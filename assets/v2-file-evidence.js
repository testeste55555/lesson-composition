// File-evidence layer for the existing-lesson mode.
// Principle: structural facts may be auto-preset; activity/operation inferences stay behind Human Gate.

let fileAutoConfirmed=new Set();

function embeddedMediaFeatures(entries=[]){
  const out=new Set();
  for(const e of entries){
    const n=e.name.toLowerCase();
    if(!/(^|\/)media\//.test(n))continue;
    if(/\.(png|jpe?g|gif|webp|svg|bmp|tiff?|emf|wmf)$/.test(n))out.add('cur_visual');
    if(/\.(mp3|wav|m4a|aac|ogg|oga|flac|wma)$/.test(n))out.add('cur_audio');
    if(/\.(mp4|m4v|mov|webm|avi|wmv|mpeg|mpg)$/.test(n))out.add('cur_visual');
  }
  return [...out];
}

function hasActualMultilingualText(text=''){
  const t=normalizeLessonText(text);
  const scriptSignals=[
    /[ăâđêôơưĂÂĐÊÔƠƯà-ỹ]{3,}/,
    /[ก-๙]{4,}/,
    /[က-႟]{4,}/,
    /[ក-៹]{4,}/,
    /[ऀ-ॿ]{4,}/,
    /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/
  ];
  return scriptSignals.some(r=>r.test(t));
}

function htmlStructuralFeatures(raw=''){
  const out=new Set();
  if(/<img\b|<svg\b|<canvas\b|<video\b/i.test(raw))out.add('cur_visual');
  if(/<audio\b|new\s+Audio\s*\(/i.test(raw))out.add('cur_audio');
  return [...out];
}

// Enhanced extraction: return only temporary text plus structural facts.
extractFile=async function(f){
  const n=f.name.toLowerCase(),warnings=[],confirmedFeatures=[];
  try{
    if(/\.(txt|md|csv|json|html?|xml)$/.test(n)){
      const raw=await f.text();
      const text=normalizeLessonText(raw);
      if(/\.html?$/.test(n))confirmedFeatures.push(...htmlStructuralFeatures(raw));
      if(hasActualMultilingualText(text))confirmedFeatures.push('cur_multilang');
      return {text,type:'text',warnings,confirmedFeatures:[...new Set(confirmedFeatures)]};
    }
    if(/\.(pptx|docx|xlsx|zip)$/.test(n)){
      const entries=await readZip(await f.arrayBuffer());
      const type=n.endsWith('.zip')
        ?detectZipLessonType(entries)
        :(n.endsWith('.pptx')?'pptx-zip':n.endsWith('.docx')?'docx-zip':'xlsx-zip');
      const text=await extractEntriesText(entries,type);
      confirmedFeatures.push(...embeddedMediaFeatures(entries));
      if(hasActualMultilingualText(text))confirmedFeatures.push('cur_multilang');
      if(n.endsWith('.zip')&&type!=='zip')warnings.push(`${f.name}: ZIP内を${type.replace('-zip','').toUpperCase()}構造として認識しました。`);
      if(!text)warnings.push(`${f.name}: 判定に使える本文を十分に抽出できませんでした。教師チェックを併用してください。`);
      return {text,type,warnings,confirmedFeatures:[...new Set(confirmedFeatures)]};
    }
    if(n.endsWith('.pdf')){
      warnings.push(`${f.name}: PDF本文の自動抽出は現在未対応です。教師チェックを中心に判定します。`);
      return {text:'',type:'pdf',warnings,confirmedFeatures:[]};
    }
    warnings.push(`${f.name}: 内容自動解析の対象外です。`);
    return {text:'',type:'other',warnings,confirmedFeatures:[]};
  }catch(e){
    warnings.push(`${f.name}: 自動解析できませんでした（${e.message}）。教師チェックは利用できます。`);
    return {text:'',type:'error',warnings,confirmedFeatures:[]};
  }
};

analyzeFiles=async function(files){
  const texts=[],warnings=[],meta=[],confirmed=new Set();
  for(let i=0;i<files.length;i++){
    const f=files[i],label=`ファイル${i+1}`;
    const r=await extractFile(f);
    meta.push({label,size:f.size,type:r.type});
    if(r.text)texts.push(r.text);
    for(const k of (r.confirmedFeatures||[]))confirmed.add(k);
    for(const w of r.warnings)warnings.push(String(w).split(f.name).join(label));
  }
  const text=texts.join('\n');
  const inferred=inferFeatures(text);
  const confirmedFeatures=[...confirmed];
  const candidateFeatures=inferred.filter(k=>!confirmed.has(k));
  const blocks=inferBlocks(text);
  return{files:meta,features:[...new Set([...confirmedFeatures,...candidateFeatures])],confirmedFeatures,candidateFeatures,blocks,warnings};
};

function decorateCurrentEvidence(){
  const confirmed=new Set(fileAnalysis.confirmedFeatures||[]);
  const candidates=new Set(fileAnalysis.candidateFeatures||[]);
  $$('#current .choice').forEach(b=>{
    b.classList.toggle('file-confirmed',confirmed.has(b.dataset.k));
    b.classList.toggle('file-suggested',!confirmed.has(b.dataset.k)&&candidates.has(b.dataset.k));
  });
}

bindFiles=async function(){
  const input=$('#lessonFiles');
  if(!input)return;
  input.onchange=async()=>{
    // Clear only the previous automatic presets. Teacher-approved candidates remain teacher decisions.
    for(const k of fileAutoConfirmed)state.delete(k);
    fileAutoConfirmed.clear();
    const files=[...input.files];
    $('#fileStatus').innerHTML=`<p class="status">${files.length}ファイルを確認中…</p>`;
    fileAnalysis=await analyzeFiles(files);
    for(const k of (fileAnalysis.confirmedFeatures||[])){
      state.add(k);
      fileAutoConfirmed.add(k);
    }
    renderFileFindings();
    $$('.choice').forEach(b=>{
      const on=state.has(b.dataset.k);
      b.classList.toggle('on',on);
      b.setAttribute('aria-pressed',on);
    });
    decorateCurrentEvidence();
    updateCount();
  };
};

renderFileFindings=function(){
  const s=$('#fileStatus'),f=$('#fileFindings');
  if(!s||!f)return;
  s.innerHTML=`<div class="file-list">${fileAnalysis.files.map(x=>`<span>${esc(x.label)}（${esc(x.type)}）</span>`).join('')}</div>`;
  const confirmed=(fileAnalysis.confirmedFeatures||[]).map(k=>`<span class="evidence-confirmed">✓ ${esc(V2.labels[k]||k)}</span>`).join('');
  const suggestions=(fileAnalysis.candidateFeatures||[]).map(k=>`<button type="button" class="suggestion${state.has(k)?' accepted':''}" data-suggest="${k}">${state.has(k)?'✓ ':''}${esc(V2.labels[k]||k)}</button>`).join('');
  f.innerHTML=`
    ${confirmed?`<div class="finding evidence-box"><b>ファイルで確認できたもの</b><p class="note">ファイル構造・実データから確認できたため、「元授業にすでにあるもの」へ自動反映しました。必要なら下の欄で修正できます。</p><div class="evidence-list">${confirmed}</div></div>`:''}
    ${suggestions?`<div class="finding"><b>教師確認が必要な候補</b><p class="note">教材には手掛かりがありますが、実際の授業で行っているかはファイルだけでは確定しません。合っているものだけタップしてください。</p><div class="suggestions">${suggestions}</div></div>`:''}
    <div class="finding evidence-unknown"><b>ファイルだけでは判定しないもの</b><p class="note">教師の発話量、実際の待ち時間、実際の反復回数など授業運用に依存する項目は、自動判定しません。</p></div>
    ${(fileAnalysis.blocks||[]).length?`<div class="finding"><b>活動ブロック候補</b><ol>${fileAnalysis.blocks.map(b=>`<li>${b.name} <small>手掛かり ${b.evidence}</small></li>`).join('')}</ol><small>活動ブロック候補は説明用で、得点には直接入りません。</small></div>`:''}
    ${(fileAnalysis.warnings||[]).length?`<div class="warning">${fileAnalysis.warnings.map(esc).join('<br>')}</div>`:''}
  `;
  $$('.suggestion').forEach(b=>b.onclick=()=>{
    const k=b.dataset.suggest;
    if(state.has(k))state.delete(k);else state.add(k);
    b.classList.toggle('accepted',state.has(k));
    b.textContent=`${state.has(k)?'✓ ':''}${V2.labels[k]||k}`;
    const target=$(`.choice[data-k="${k}"]`);
    if(target){target.classList.toggle('on',state.has(k));target.setAttribute('aria-pressed',state.has(k));}
    decorateCurrentEvidence();
    updateCount();
  });
};

// Re-render direct existing mode so this layer owns the file binding/rendering.
if(currentMode==='existing'||modeFromUrl()==='existing')render();

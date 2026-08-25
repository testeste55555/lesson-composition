Object.assign(V2.labels,{cur_clear_action:'学習者が何をするか明確',cur_speaking:'学習者の発話',cur_movement:'身体反応・動作',cur_pair:'ペア・やり取り',cur_group:'グループ活動',cur_visual:'画像・視覚情報',cur_audio:'音声',cur_random:'ランダム性',cur_repeat:'反復しやすい',cur_multilang:'母語支援',cur_feedback:'即時フィードバック',cur_level:'難易度切替',cur_self:'個別練習',cur_record:'履歴'});
if(!V2.sections.some(s=>s.id==='current')){
  const issueIndex=V2.sections.findIndex(s=>s.id==='issue');
  V2.sections.splice(issueIndex<0?V2.sections.length:issueIndex,0,{title:'元授業にすでにあるもの',id:'current',existingOnly:true,note:'ファイル解析は推定です。実際の授業と違うところはタップして修正してください。',items:[['cur_clear_action','学習者が何をするか明確',''],['cur_speaking','学習者の発話がある',''],['cur_movement','身体反応・動作がある',''],['cur_pair','ペア・やり取りがある',''],['cur_group','グループ活動がある',''],['cur_visual','画像・視覚情報がある',''],['cur_audio','音声がある',''],['cur_random','ランダム性がある',''],['cur_repeat','反復しやすい',''],['cur_multilang','母語支援がある',''],['cur_feedback','すぐフィードバックできる',''],['cur_level','難易度を変えられる',''],['cur_self','個別練習にも使える',''],['cur_record','結果・履歴を残せる','']]});
}

// Privacy hardening: lesson files are processed only in memory.
// Do not retain source text or original file names after feature extraction.
analyzeFiles=async function(files){
  const texts=[],warnings=[],meta=[];
  for(let i=0;i<files.length;i++){
    const f=files[i],label=`ファイル${i+1}`;
    const r=await extractFile(f);
    meta.push({label,size:f.size,type:r.type});
    if(r.text)texts.push(r.text);
    for(const w of r.warnings)warnings.push(String(w).split(f.name).join(label));
  }
  const text=texts.join('\n');
  const features=inferFeatures(text);
  const blocks=inferBlocks(text);
  return{files:meta,features,blocks,warnings};
};

filePanel=function(){return `<section class="card file-card"><h2>元授業ファイル</h2><div class="privacy-note"><b>🔒 端末内だけで解析します</b><p>選択したファイル本文を外部APIやGitHubへ送信しません。本文・元ファイル名は保存せず、判定に必要な特徴だけを一時的に保持します。</p></div><label class="file-drop"><input id="lessonFiles" type="file" multiple accept=".pptx,.docx,.xlsx,.pdf,.zip,.html,.htm,.txt,.md,.csv,.json"><b>ファイルを選ぶ</b><span>PPTX / DOCX / XLSX / PDF / ZIP / HTML / TXT など</span></label><div id="fileStatus"></div><div id="fileFindings"></div></section>`};

renderFileFindings=function(){
  const s=$('#fileStatus'),f=$('#fileFindings');
  s.innerHTML=`<div class="file-list">${fileAnalysis.files.map(x=>`<span>${esc(x.label)}（${esc(x.type)}）</span>`).join('')}</div>`;
  f.innerHTML=`${fileAnalysis.features.length?`<div class="finding"><b>ファイルから推定した特徴</b><p>${fileAnalysis.features.map(k=>`<span class="tag">${esc(V2.labels[k]||k)}</span>`).join('')}</p><small>推定です。下の「元授業にすでにあるもの」で修正してください。</small></div>`:''}${fileAnalysis.blocks.length?`<div class="finding"><b>活動ブロック候補</b><ol>${fileAnalysis.blocks.map(b=>`<li>${b.name} <small>手掛かり ${b.evidence}</small></li>`).join('')}</ol></div>`:''}${fileAnalysis.warnings.length?`<div class="warning">${fileAnalysis.warnings.map(esc).join('<br>')}</div>`:''}`;
};

render();
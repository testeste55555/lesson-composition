// Decision-first result presentation layer.
// Scoring stays in v2-quality.js; this file only changes how recommendations are communicated.

(function(){
  function bestPositive(arr){ return (arr||[]).find(x=>x.score>0)||null; }
  function strongEnoughPair(arr){
    const p=(arr||[]).filter(x=>x.score>0);
    if(p.length<2) return null;
    const [a,b]=p;
    const threshold=(RESULT_QUALITY_THRESHOLDS.activity||{}).recommend||5;
    if(b.score>=threshold && b.score/a.score>=0.72) return [a,b];
    return null;
  }
  function escText(s=''){ return esc(String(s)); }
  function reasons(item){
    if(!item?.reasons?.length) return '<p class="decision-muted">根拠はまだ十分ではありません。</p>';
    return `<div class="decision-evidence">${item.reasons.slice(0,4).map(r=>`<span>${escText(r)}</span>`).join('')}</div>`;
  }
  function recommendationModel(scored){
    const pair=strongEnoughPair(scored.activity);
    const activity=bestPositive(scored.activity);
    const participation=bestPositive(scored.participation);
    const media=bestPositive(scored.media);
    const support=bestPositive(scored.support);
    const role=bestPositive(scored.role);
    return {
      activity,
      activityLabel:pair ? `${pair[0].name}＋${pair[1].name}` : (activity?.name||'活動条件を追加してください'),
      participation,
      participationLabel:participation?.name||'参加形態を追加してください',
      media,
      mediaLabel:media?.name||'未確定（活動・教室条件から選択）',
      support,
      supportLabel:support?.name||'追加機能なしでも可',
      role,
      roleLabel:role?.name||'授業内役割を追加してください'
    };
  }
  function decisionCards(m){
    const items=[
      ['授業の中心',m.activityLabel,m.activity?.desc||'学習者に何をさせたいかを追加すると具体化します。',m.activity],
      ['参加のさせ方',m.participationLabel,m.participation?.desc||'全体・ペア・個別などの条件を追加してください。',m.participation],
      ['主に使う媒体',m.mediaLabel,m.media?.desc||'媒体は先に決めず、活動と教室条件から選びます。',m.media],
      ['補助機能',m.supportLabel,m.support?.desc||'必要な機能だけ追加します。',m.support],
      ['授業内の役割',m.roleLabel,m.role?.desc||'導入・練習・応用・評価のどこで使うかを整理します。',m.role]
    ];
    return `<section class="decision-grid">${items.map(([label,title,desc,item])=>`
      <article class="decision-card">
        <span class="decision-label">${label}</span>
        <strong>${escText(title)}</strong>
        <p>${escText(desc)}</p>
        ${reasons(item)}
      </article>`).join('')}</section>`;
  }
  function priorityRows(){
    if(currentMode!=='existing') return '';
    const rows=[];
    const add=(cls,label,text)=>rows.push(`<div class="priority-row ${cls}"><b>${label}</b><span>${escText(text)}</span></div>`);

    if(state.has('cur_speaking')) add('keep','残す','学習者が実際に話す活動');
    if(state.has('cur_movement')) add('keep','残す','身体反応・操作を伴う活動');
    if(state.has('cur_pair')) add('keep','残す','発話量を確保できるペア活動');
    if(state.has('cur_visual')) add('keep','残す','場面理解を助ける視覚情報');

    if(state.has('iss_fixed')) add('change','変える','固定順をランダムまたは複数順へ');
    if(state.has('iss_low_repeat')) add('change','変える','一回提示を短い反復サイクルへ');
    if(state.has('iss_level')) add('change','変える','一律課題を必要な場合のみ難易度調整へ');

    if(state.has('audio')&&!state.has('cur_audio')) add('add','追加','音声は必要と選んだ場合のみ追加');
    if(state.has('multilang')&&!state.has('cur_multilang')) add('add','追加','母語支援は必要時表示として追加');
    if(state.has('random')&&!state.has('cur_random')) add('add','追加','ランダム出題');

    if(state.has('iss_text')) add('cut','削る','学習行動に不要な文字・説明');
    if(state.has('iss_answer')) add('cut','削る','発話・判断前に見えている答え');
    if(state.has('iss_ui')) add('cut','削る','学習行動に関係しない操作');
    if(state.has('iss_l1')&&state.has('cur_multilang')) add('cut','削る','常時併記の翻訳。必要時表示へ');

    return `<section class="priority-panel"><h3>まず何を残し、何を変えるか</h3>${rows.length?rows.join(''):'<p class="decision-muted">元授業の特徴・改善点を選ぶと、ここに優先変更点が出ます。</p>'}</section>`;
  }
  function buildNewLessonFlow(m){
    if(currentMode!=='new') return '';
    const steps=[];
    if(m.role) steps.push(`<li><b>${escText(m.role.name)}</b>を中心に、${escText(m.activityLabel)}で活動を組む。</li>`);
    else steps.push(`<li><b>${escText(m.activityLabel)}</b>を中心に活動を組む。</li>`);
    steps.push(`<li>参加形態は<b>${escText(m.participationLabel)}</b>を第一候補にする。</li>`);
    steps.push(`<li>媒体は<b>${escText(m.mediaLabel)}</b>。必要がなければデジタル化を増やさない。</li>`);
    if(m.support) steps.push(`<li>補助は<b>${escText(m.supportLabel)}</b>だけを優先し、機能を盛りすぎない。</li>`);
    else steps.push('<li>補助機能は追加なしでもよい。授業活動を先に完成させる。</li>');
    return `<section class="priority-panel"><h3>授業を組む順序</h3><ol class="lesson-flow">${steps.join('')}</ol></section>`;
  }
  function mediaUsage(scored){
    const media=(scored.media||[]).filter(x=>x.score>0).slice(0,3);
    if(!media.length){
      return `<section class="media-usage"><h3>媒体の使い分け</h3><p class="decision-muted">媒体はまだ確定しません。学習活動・参加形態・教室条件を先に決めてください。</p></section>`;
    }
    return `<section class="media-usage"><h3>媒体の使い分け</h3><p class="decision-muted">1つの媒体に統一する必要はありません。役割が違えば併用します。</p>${media.map((x,i)=>`
      <div class="media-row"><span>${i===0?'主':'補'}</span><div><b>${escText(x.name)}</b><p>${escText(x.desc)}</p></div></div>`).join('')}</section>`;
  }
  function blockAdvice(){
    if(currentMode!=='existing'||!fileAnalysis.blocks.length) return '';
    return `<section class="block-advice decision-blocks"><h3>元授業の活動ブロック候補</h3><p class="decision-muted">授業全体を一形式へ変換せず、ブロックごとに活動・媒体を選びます。自動抽出は説明用で、得点には直接入りません。</p>${fileAnalysis.blocks.map(b=>`<span class="block">${escText(b.name)}</span>`).join('')}</section>`;
  }

  judge=function(){
    if(!state.size){ alert('まず項目をいくつか選んでください。'); return; }
    const scored={};
    for(const [k,a] of Object.entries(V2.axes)) scored[k]=scoreAxis(a);
    const m=recommendationModel(scored);
    const detailHtml=Object.entries(V2.axes).map(([k,a])=>axisHtml(a,scored[k])).join('');
    const title=currentMode==='existing'?'この授業はこう組み直す':'この方向で授業を組む';
    const intro=currentMode==='existing'
      ? '元授業を全部別形式へ置き換えず、残す活動と変える部分を分けます。'
      : '媒体を先に決めず、学習者にさせたい行動から授業を組みます。';

    const result=$('#result');
    result.innerHTML=`
      <h2>判定結果</h2>
      <section class="decision-hero">
        <span>${title}</span>
        <strong>${escText(m.activityLabel)} × ${escText(m.participationLabel)}</strong>
        <p>${intro}</p>
      </section>
      ${decisionCards(m)}
      ${priorityRows()}
      ${buildNewLessonFlow(m)}
      ${mediaUsage(scored)}
      ${blockAdvice()}
      <details class="result-details">
        <summary>5軸の詳しい判定を見る</summary>
        <div class="result-details-body">${detailHtml}</div>
      </details>
      <section class="result-actions"><button class="secondary" id="copyResult">結果をコピー</button></section>`;
    result.classList.add('show');
    $('#copyResult').onclick=async()=>{try{await navigator.clipboard.writeText(result.innerText);alert('結果をコピーしました')}catch{alert('コピーできませんでした')}};
    result.scrollIntoView({behavior:'smooth',block:'start'});
  };

  globalThis.__LESSON_RESULT_UI__={recommendationModel};
})();

// Generic acceptance fixes for ZIP-wrapped OOXML and lesson-file analysis.
// Important: acceptance-test-specific vocabulary must not become production rules.

function normalizeLessonText(s=''){
  return s
    .replace(/style\.visibility/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function detectZipLessonType(entries){
  const names=entries.map(e=>e.name);
  if(names.some(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n))) return 'pptx-zip';
  if(names.some(n=>/^word\/document\.xml$/i.test(n))) return 'docx-zip';
  if(names.some(n=>/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(n))) return 'xlsx-zip';
  return 'zip';
}

async function extractEntriesText(entries,type){
  let selected=[];
  if(type==='pptx-zip') selected=entries.filter(e=>/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i.test(e.name));
  else if(type==='docx-zip') selected=entries.filter(e=>/^word\/(document|header\d+|footer\d+)\.xml$/i.test(e.name));
  else if(type==='xlsx-zip') selected=entries.filter(e=>/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(e.name));
  else selected=entries.filter(e=>/\.(txt|md|csv|json|html?|xml)$/i.test(e.name)).slice(0,160);

  const parts=[];
  for(const e of selected){
    try{parts.push(await entryText(e));}catch(_e){}
  }
  return normalizeLessonText(xmlText(parts.join('\n')));
}

extractFile=async function(f){
  const n=f.name.toLowerCase(),warnings=[];
  try{
    if(/\.(txt|md|csv|json|html?|xml)$/.test(n)){
      return {text:normalizeLessonText(await f.text()),type:'text',warnings};
    }
    if(/\.(pptx|docx|xlsx|zip)$/.test(n)){
      const entries=await readZip(await f.arrayBuffer());
      const type=n.endsWith('.zip')
        ?detectZipLessonType(entries)
        :(n.endsWith('.pptx')?'pptx-zip':n.endsWith('.docx')?'docx-zip':'xlsx-zip');
      const text=await extractEntriesText(entries,type);
      if(n.endsWith('.zip')&&type!=='zip'){
        warnings.push(`${f.name}: ZIP内を${type.replace('-zip','').toUpperCase()}構造として認識しました。`);
      }
      if(!text){
        warnings.push(`${f.name}: 判定に使える本文を十分に抽出できませんでした。教師チェックを併用してください。`);
      }
      return {text,type,warnings};
    }
    if(n.endsWith('.pdf')){
      warnings.push(`${f.name}: PDF本文の自動抽出は現在未対応です。教師チェックを中心に判定します。`);
      return {text:'',type:'pdf',warnings};
    }
    warnings.push(`${f.name}: 内容自動解析の対象外です。`);
    return {text:'',type:'other',warnings};
  }catch(e){
    warnings.push(`${f.name}: 自動解析できませんでした（${e.message}）。教師チェックは利用できます。`);
    return {text:'',type:'error',warnings};
  }
};

// Only infer a lesson feature when the text suggests an activity/instruction/function.
// Bare vocabulary items such as 「ききます」「もちます」「しゃしん」 are not enough.
inferFeatures=function(raw){
  const t=normalizeLessonText(raw),f=[];
  const hit=(r,k)=>{if(r.test(t))f.push(k)};

  hit(/ペア(?:で|になって|ワーク)|二人(?:で|一組)|2人(?:で|一組)|相手と|pair\s*work/i,'cur_pair');
  hit(/グループ(?:で|ワーク)|チーム(?:で|活動)|相談して|話し合って|はなしあって|group\s*work/i,'cur_group');
  hit(/身体を動か|からだをうごか|動作をして|どうさをして|ジェスチャーをして|立って.+(?:ください|しましょう)|座って.+(?:ください|しましょう)|持って.+(?:ください|しましょう)|置いて.+(?:ください|しましょう)|指して.+(?:ください|しましょう)/,'cur_movement');
  hit(/言って(?:ください|みましょう)|いって(?:ください|みましょう)|話して(?:ください|みましょう)|はなして(?:ください|みましょう)|答えて(?:ください|みましょう)|こたえて(?:ください|みましょう)|質問して|しつもんして|発表して|会話練習|かいわれんしゅう|ロールプレイ/,'cur_speaking');
  hit(/音声|リスニング|再生(?:する|ボタン)|聞いて(?:答|選|動|ください)|きいて(?:こた|えら|うご|ください)|音を聞いて|おとをきいて/,'cur_audio');

  hit(/翻訳|対訳|母語|言語切替|げんごきりかえ|translation|bilingual|multilingual/i,'cur_multilang');
  const scriptSignals=[
    /[ăâđêôơưĂÂĐÊÔƠƯà-ỹ]{3,}/,
    /[ก-๙]{4,}/,
    /[က-႟]{4,}/,
    /[ក-៹]{4,}/,
    /[ऀ-ॿ]{4,}/
  ];
  if(scriptSignals.some(r=>r.test(t)))f.push('cur_multilang');

  hit(/ランダム|シャッフル|順不同|じゅんふどう|randomi[sz]e/i,'cur_random');
  hit(/もう一度|もういちど|くり返|繰り返|反復|復習|ふくしゅう|繰り返し練習|くりかえしれんしゅう/,'cur_repeat');
  hit(/ヒント|正解|せいかい|答えを見|こたえをみ|フィードバック|正誤|せいご|○×|まるばつ/,'cur_feedback');
  hit(/PreA1|CEFR|A1\s*(?:レベル|程度)|A2\s*(?:レベル|程度)|N5|N4|難易度|なんいど|レベル切替|れべるきりかえ/,'cur_level');
  hit(/画像を見|がぞうをみ|イラストを見|イラストをみ|図を見|図をみ|絵を見|絵をみ|写真を見|しゃしんをみ|画面を見|がめんをみ/,'cur_visual');

  return [...new Set(f)];
};

// Generic activity blocks only. Do not create blocks named after one test lesson's topic.
inferBlocks=function(raw){
  const t=normalizeLessonText(raw); if(!t)return[];
  const rules=[
    ['身体反応・操作',/身体を動か|からだをうごか|動作をして|どうさをして|ジェスチャーをして|立って.+(?:ください|しましょう)|座って.+(?:ください|しましょう)|持って.+(?:ください|しましょう)|置いて.+(?:ください|しましょう)|指して.+(?:ください|しましょう)/],
    ['発話・産出',/言って(?:ください|みましょう)|いって(?:ください|みましょう)|話して(?:ください|みましょう)|はなして(?:ください|みましょう)|答えて(?:ください|みましょう)|こたえて(?:ください|みましょう)|発表して|文を作|ぶんをつく/],
    ['やり取り',/ペア(?:で|ワーク)|相手と|質問して|しつもんして|返事を|へんじを|会話練習|かいわれんしゅう|ロールプレイ|報告して|ほうこくして/],
    ['協働・相談',/グループ(?:で|ワーク)|チーム(?:で|活動)|相談して|そうだんして|話し合って|はなしあって/],
    ['視覚認識・判断',/画像を見|がぞうをみ|イラストを見|イラストをみ|図を見|図をみ|絵を見|絵をみ|写真を見|しゃしんをみ|選んで|えらんで|どれ|どっち|正しいもの|ただしいもの/],
    ['反復・定着',/もう一度|もういちど|くり返|繰り返|反復|復習|ふくしゅう|繰り返し練習|くりかえしれんしゅう/],
    ['評価・確認',/正解|せいかい|答えを見|こたえをみ|正誤|せいご|テスト|確認問題|かくにんもんだい|チェック/],
    ['語彙・文型',/語彙|ごい|ことば|文型|ぶんけい|文法|ぶんぽう|例文|れいぶん/]
  ];
  const found=[];
  for(const [name,re] of rules){
    const m=t.match(new RegExp(re.source,'g'));
    if(m&&m.length)found.push({name,evidence:m.length});
  }
  return found.sort((a,b)=>b.evidence-a.evidence).slice(0,7);
};

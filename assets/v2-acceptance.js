// Acceptance fixes for ZIP-wrapped OOXML and Japanese teaching materials.
// This layer overrides V2 file analysis without changing the privacy-first model.

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

async function extractEntriesText(entries, type){
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
    if(/\.(txt|md|csv|json|html?|xml)$/.test(n)) return {text:normalizeLessonText(await f.text()),type:'text',warnings};
    if(/\.(pptx|docx|xlsx|zip)$/.test(n)){
      const entries=await readZip(await f.arrayBuffer());
      const type=n.endsWith('.zip')?detectZipLessonType(entries):(n.endsWith('.pptx')?'pptx-zip':n.endsWith('.docx')?'docx-zip':'xlsx-zip');
      const text=await extractEntriesText(entries,type);
      if(n.endsWith('.zip')&&type!=='zip') warnings.push(`${f.name}: ZIP内を${type.replace('-zip','').toUpperCase()}構造として認識しました。`);
      if(!text) warnings.push(`${f.name}: 判定に使える本文を十分に抽出できませんでした。教師チェックを併用してください。`);
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

inferFeatures=function(raw){
  const t=normalizeLessonText(raw),f=[];
  const hit=(r,k)=>{if(r.test(t))f.push(k)};
  hit(/ペア|二人|2人|ふたり|となりの人|相手/,'cur_pair');
  hit(/グループ|相談|話し合|はなしあ|チーム/,'cur_group');
  hit(/ジェスチャ|動作|うごいて|動いて|立って|たって|たちます|座って|すわって|すわります|持って|もって|もちます|置いて|おいて|おきます|指して|さして|まねして/,'cur_movement');
  hit(/言って|いって|話して|はなして|答えて|こたえて|発話|質問|しつもん|返事|へんじ|報告|ほうこく|会話|かいわ|何と言|なんとい/,'cur_speaking');

  // Do not treat vocabulary such as 「ききます」 as evidence that the material itself has audio.
  hit(/音声|聞いて|きいて|リスニング|再生|発音を聞|はつおんをき|音を聞/,'cur_audio');

  // Prefer explicit labels or script-specific signals. This avoids mistaking image-source URLs for translations.
  hit(/ベトナム|インドネシア|フィリピン|タガログ|タイ語|ミャンマー|クメール|中国語|ネパール|翻訳|母語|Tiếng\s*Việt|Bahasa\s*Indonesia|Filipino|Tagalog|မြန်မာ|ខ្មែរ|नेपाली|ไทย|中文/,'cur_multilang');
  const vietnameseMarks=(t.match(/[ăâđêôơưĂÂĐÊÔƠƯà-ỹ]/g)||[]).length;
  const seaWords=(t.match(/\b(?:Tolong|Harap|lakukan|gerakan|sesuai|dengan|sesuatu|Menyanyikan|Berpakaian|salamat|mangyaring|gawin)\b/gi)||[]).length;
  if(vietnameseMarks>=4||seaWords>=3)f.push('cur_multilang');

  hit(/ランダム|シャッフル|順不同|じゅんふどう/,'cur_random');
  hit(/もう一度|もういちど|くり返|繰り返|反復|復習|ふくしゅう|れんしゅう|練習/,'cur_repeat');
  hit(/ヒント|正解|せいかい|答え|こたえ|フィードバック|○|×|まる|ばつ/,'cur_feedback');

  // Bare A1/A2 strings can occur in answer labels, so require explicit level context.
  hit(/レベル|PreA1|CEFR|A1\s*(?:レベル|程度)|A2\s*(?:レベル|程度)|N5|N4|やさしい日本語/,'cur_level');

  // Do not treat vocabulary such as 「しゃしんを とります」 as evidence that images are used.
  hit(/画像|イラスト|図を見|図をみ|絵を見|絵をみ|えをみ|標識|ひょうしき|写真を見|しゃしんをみ/,'cur_visual');
  return [...new Set(f)];
};

inferBlocks=function(raw){
  const t=normalizeLessonText(raw); if(!t)return[];
  const rules=[
    ['身体反応・操作',/ジェスチャ|動作|うごいて|立って|たって|すわって|座って|持って|もって|置いて|おいて|右|みぎ|左|ひだり|上|うえ|下|した/],
    ['発話・文型練習',/言って|いって|話して|はなして|文型|ぶんけい|て形|てけい|れんしゅう|練習|発話|はつわ/],
    ['やり取り',/ペア|質問|しつもん|返事|へんじ|会話|かいわ|ロールプレイ|報告|ほうこく/],
    ['視覚認識・判断',/標識|ひょうしき|画像|イラスト|図を見|図をみ|絵を見|絵をみ|えをみ|どっち|どれ|選ん|えらん|ただしい/],
    ['数・分類',/数え|かぞえ|かぞえかた|何個|なんこ|何人|なんにん|分類|ぶんるい|グループ/],
    ['位置・指示',/いちのことば|位置|しじのことば|指示|右|みぎ|左|ひだり|上|うえ|下|した|前|まえ|後ろ|うしろ/],
    ['語彙・標識',/こうつうひょうしき|交通標識|きょうのことば|ことば|語彙/],
    ['動詞・語彙',/動詞|どうし|verb|verbs|kata kerja/]
  ];
  const found=[];
  for(const [name,re] of rules){
    const m=t.match(new RegExp(re.source,'g'));
    if(m&&m.length) found.push({name,evidence:m.length});
  }
  return found.sort((a,b)=>b.evidence-a.evidence).slice(0,7);
};

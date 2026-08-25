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
      let type=n.endsWith('.zip')?detectZipLessonType(entries):(n.endsWith('.pptx')?'pptx-zip':n.endsWith('.docx')?'docx-zip':'xlsx-zip');
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
  hit(/音声|聞いて|きいて|ききます|リスニング|再生|発音|はつおん/,'cur_audio');
  hit(/ベトナム|インドネシア|フィリピン|タガログ|タイ語|ミャンマー|クメール|中国語|ネパール|翻訳|母語|Tiếng\s*Việt|Bahasa\s*Indonesia/,'cur_multilang');
  hit(/ランダム|シャッフル|順不同|じゅんふどう/,'cur_random');
  hit(/もう一度|もういちど|くり返|繰り返|反復|復習|ふくしゅう|れんしゅう|練習/,'cur_repeat');
  hit(/ヒント|正解|せいかい|答え|こたえ|フィードバック|○|×|まる|ばつ/,'cur_feedback');
  hit(/レベル|PreA1|A1|A2|N5|N4|やさしい|むずかしい/,'cur_level');
  hit(/画像|写真|しゃしん|イラスト|図|絵|えをみ|標識|ひょうしき/,'cur_visual');

  // Some existing materials contain translations without explicit language labels.
  // Ignore short acronyms/metadata and infer multilingual support only when Latin-script words are sufficiently frequent.
  const latin=(t.match(/\b[A-Za-zÀ-ỹ]{4,}\b/g)||[]).filter(w=>!/^(style|visibility|slide|theme|color|width|height)$/i.test(w));
  if(latin.length>=8) f.push('cur_multilang');
  return [...new Set(f)];
};

inferBlocks=function(raw){
  const t=normalizeLessonText(raw); if(!t)return[];
  const rules=[
    ['身体反応・操作',/ジェスチャ|動作|うごいて|立って|たって|すわって|座って|持って|もって|置いて|おいて|右|みぎ|左|ひだり|上|うえ|下|した/],
    ['発話・文型練習',/言って|いって|話して|はなして|文型|ぶんけい|て形|てけい|ですか|ます|ください|れんしゅう|練習/],
    ['やり取り',/ペア|質問|しつもん|返事|へんじ|会話|かいわ|ロールプレイ|報告|ほうこく/],
    ['視覚認識・判断',/標識|ひょうしき|画像|写真|しゃしん|イラスト|どっち|どれ|選ん|えらん|ただしい/],
    ['数・分類',/数え|かぞえ|かぞえかた|何個|なんこ|何人|なんにん|分類|ぶんるい|グループ/],
    ['位置・指示',/いちのことば|位置|しじのことば|指示|右|みぎ|左|ひだり|上|うえ|下|した|前|まえ|後ろ|うしろ/],
    ['語彙・標識',/こうつうひょうしき|交通標識|きょうのことば|ことば|語彙/]
  ];
  const found=[];
  for(const [name,re] of rules){
    const m=t.match(new RegExp(re.source,'g'));
    if(m&&m.length) found.push({name,evidence:m.length});
  }
  return found.sort((a,b)=>b.evidence-a.evidence).slice(0,7);
};

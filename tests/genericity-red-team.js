const fs=require('fs');
const vm=require('vm');
const path=require('path');

// Minimal browser-like globals needed for loading the inference layers.
global.currentMode='';
global.modeFromUrl=()=>'';
global.render=()=>{};
global.state=new Set();
global.fileAnalysis={files:[],features:[],blocks:[],warnings:[]};
global.V2={labels:{}};
global.$=()=>null;
global.$$=()=>[];
global.esc=s=>String(s);
global.updateCount=()=>{};

for(const rel of ['../assets/v2-acceptance.js','../assets/v2-redteam.js']){
  const file=path.join(__dirname,rel);
  vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
}

let failed=0;
function check(name,condition,detail=''){
  if(condition){console.log('PASS',name);return;}
  failed++;
  console.error('FAIL',name,detail);
}
function features(text){return new Set(inferFeatures(text));}
function blocks(text){return new Set(inferBlocks(text).map(x=>x.name));}
function hasAll(set,arr){return arr.every(x=>set.has(x));}
function hasNone(set,arr){return arr.every(x=>!set.has(x));}

// 1. Vocabulary content must not be mistaken for lesson functions.
{
  const f=features('ききます。もちます。しゃしんを とります。たちます。すわります。');
  check('vocabulary-only does not imply audio/movement/visual',hasNone(f,['cur_audio','cur_movement','cur_visual']),[...f]);
}

// 2. Listening to a partner is not an audio-media feature.
{
  const f=features('ペアで質問してください。相手の返事を聞いてください。');
  check('pair interaction detected',hasAll(f,['cur_pair','cur_speaking']),[...f]);
  check('partner listening does not imply audio feature',!f.has('cur_audio'),[...f]);
}

// 3. Explicit audio functionality is detected.
{
  const f=features('音声を再生します。聞いて答えてください。');
  check('explicit audio detected',f.has('cur_audio'),[...f]);
}

// 4. Physical instruction vs physical vocabulary.
{
  const f1=features('立ってください。机の前に移動しましょう。');
  const f2=features('立ちます。座ります。持ちます。');
  check('physical instruction detected',f1.has('cur_movement'),[...f1]);
  check('physical vocabulary alone not detected',!f2.has('cur_movement'),[...f2]);
}

// 5. Target level metadata is not a level-switch feature.
{
  const f1=features('対象：A1レベルの学習者。');
  const f2=features('難易度を切り替えて練習できます。');
  check('A1 label does not imply level switch',!f1.has('cur_level'),[...f1]);
  check('explicit level switch detected',f2.has('cur_level'),[...f2]);
}

// 6. Visual prompt and production prompt can coexist.
{
  const f=features('絵を見て、何と言いますか。');
  check('visual prompt detected',f.has('cur_visual'),[...f]);
  check('production prompt detected',f.has('cur_speaking'),[...f]);
}

// 7. Selection alone is judgment/selection, not necessarily visual media.
{
  const f=features('正しいものを選んでください。');
  const b=blocks('正しいものを選んでください。');
  check('selection alone does not imply visual feature',!f.has('cur_visual'),[...f]);
  check('selection/judgment block detected',b.has('認識・選択・判断'),[...b]);
}

// 8. Group collaboration.
{
  const f=features('グループで相談して、答えを決めてください。');
  const b=blocks('グループで相談して、答えを決めてください。');
  check('group collaboration feature detected',f.has('cur_group'),[...f]);
  check('collaboration block detected',b.has('協働・相談'),[...b]);
}

// 9. URL/Latin metadata must not look multilingual.
{
  const f=features('画像出典 https://example.com/photo/lesson-material source image width height');
  check('URL metadata does not imply multilingual support',!f.has('cur_multilang'),[...f]);
}

// 10. Strong non-Japanese script signal can be suggested as multilingual support.
{
  const f=features('กรุณาเลือกคำตอบที่ถูกต้อง');
  check('Thai script multilingual candidate detected',f.has('cur_multilang'),[...f]);
}

// 11. Random/repeat/feedback functions.
{
  const f=features('問題をシャッフルします。もう一度復習します。正誤をフィードバックします。');
  check('random/repeat/feedback detected',hasAll(f,['cur_random','cur_repeat','cur_feedback']),[...f]);
}

// 12. Grammar presentation alone must not imply learner speaking.
{
  const text='文型：～てもいいですか。例文：ここに座ってもいいですか。';
  const f=features(text),b=blocks(text);
  check('grammar presentation alone not speaking',!f.has('cur_speaking'),[...f]);
  check('grammar/vocabulary block detected',b.has('語彙・文型'),[...b]);
}

// 13. File inference must remain advisory: no silent state.add loop from inferred features.
{
  const src=fs.readFileSync(path.join(__dirname,'../assets/v2-acceptance.js'),'utf8');
  check('file inference is advisory',!src.includes('fileAnalysis.features.forEach(k=>state.add(k))'));
  check('human-gate suggestion UI exists',src.includes('data-suggest'));
}

if(failed){
  console.error(`\n${failed} genericity RED TEAM test(s) failed.`);
  process.exit(1);
}
console.log('\nAll genericity RED TEAM tests passed.');

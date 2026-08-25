const fs = require('fs');
const vm = require('vm');

const base = fs.readFileSync('assets/v2.js','utf8').replace(/\nrender\(\);\s*$/,'') + '\n;globalThis.__V2__=V2;';
const quality = fs.readFileSync('assets/v2-quality.js','utf8');
const sandbox = {
  console,
  document:{querySelector(){return null},querySelectorAll(){return[]},createElement(){return {innerHTML:'',value:''}}},
  location:{search:'',pathname:'/'}, history:{replaceState(){}}, navigator:{clipboard:{writeText(){}}}, alert(){},
  URLSearchParams, TextDecoder, DataView, Uint8Array, Blob, Response, DecompressionStream: global.DecompressionStream,
};
vm.createContext(sandbox);
try{ vm.runInContext(base, sandbox); vm.runInContext(quality, sandbox); }
catch(e){ console.error('Cannot load scoring runtime:', e); process.exit(1); }
const V2=sandbox.__V2__;
const Q=sandbox.__LESSON_RESULT_QUALITY__;

function score(axisKey, selected){
  const axis=V2.axes[axisKey];
  return Object.entries(axis.items).map(([key,o])=>{
    let s=0,reasons=[];
    for(const [k,v] of Object.entries(o.w)) if(selected.has(k)){s+=v;reasons.push(k)}
    return {key,name:o.name,score:s,reasons};
  }).sort((a,b)=>b.score-a.score);
}
function top(axisKey, keys){return score(axisKey,new Set(keys))[0]}
function must(cond,msg){if(!cond){console.error('RESULT QUALITY RED TEAM:',msg);process.exitCode=1}}

// 1. Teacher-led projector lesson should not default to HTML.
let keys=['teacher_control','projector','quick_make','quick_edit','easy_teacher','minimal_ui'];
must(top('media',keys).key==='slides','teacher-led projector lesson should prefer slides');

// 2. TPR/realia lesson should favor bodily activity and realia.
keys=['prea1','low_literacy','listen_act','see_act','whole_act','move_body','teacher_control','large_class','space_move'];
must(top('activity',keys).key==='tpr','TPR case should rank TPR first');
must(top('media',keys).key==='realia','TPR case should rank realia first');

// 3. Individual web drill should favor HTML and individual practice.
keys=['a1','learner_self','learner_device','repeat_many','random','hide_answer','instant_feedback','level_switch','log','frequent_update'];
must(top('media',keys).key==='html','individual drill should rank HTML first');
must(top('participation',keys).key==='individual','individual drill should rank individual first');

// 4. Pair role-play should not invent history needs.
keys=['a2','interaction','pair','roleplay','scene_judge','extend_say'];
must(top('activity',keys).key==='interaction','pair role-play should rank interaction first');
must(score('support',new Set(keys)).find(x=>x.key==='history').score===0,'pair role-play should not recommend history without log need');

// 5. A2 alone must not imply level switching.
keys=['a2'];
must(score('support',new Set(keys)).find(x=>x.key==='level').score===0,'A2 alone must not imply level switching');

// 6. PreA1 alone must not imply mother-tongue support.
keys=['prea1'];
must(score('support',new Set(keys)).find(x=>x.key==='l1').score===0,'PreA1 alone must not imply L1 support');

// 7. Learner device/self pace alone must not imply keeping history.
keys=['learner_self','learner_device'];
must(score('support',new Set(keys)).find(x=>x.key==='history').score===0,'device/self pace alone must not imply history');

// 8. Weak evidence must never become a strong recommendation merely because it ranks first.
must(Q.qualityTier('support',2)!=='強く推奨','weak support evidence must not be labelled strong');
must(Q.qualityTier('media',1)==='候補','single weak media evidence should remain candidate');

// 9. Zero-score options must be suppressible rather than filling a top-4 list.
const none=score('media',new Set(['a2','interaction']));
must(Q.positive(none).length===0,'zero-score media options should be suppressible');

// 10. Close, sufficiently supported activity candidates should be representable as a hybrid rather than forced to one winner.
const hybrid=Q.blendedTop('activity',[{name:'A',score:10},{name:'B',score:8},{name:'C',score:2}]);
must(hybrid==='A＋B','close supported activities should produce a blended recommendation');

if(!process.exitCode) console.log('Result Quality RED TEAM: PASS');

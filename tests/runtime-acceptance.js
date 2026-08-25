const fs=require('fs');
const vm=require('vm');

function load(){
  const base=fs.readFileSync('assets/v2.js','utf8').replace(/\nrender\(\);\s*$/,'');
  const quality=fs.readFileSync('assets/v2-quality.js','utf8');
  const result=fs.readFileSync('assets/v2-result-ui.js','utf8');
  const src=`${base}\n${quality}\n${result}\n;globalThis.__V2__=V2;globalThis.__scoreAxis__=scoreAxis;`;
  const sandbox={
    console,
    document:{querySelector(){return null},querySelectorAll(){return[]},createElement(){return{innerHTML:'',value:''}}},
    location:{search:'',pathname:'/'},history:{replaceState(){}},navigator:{},alert(){},
    URLSearchParams,TextDecoder,DataView,Uint8Array,Blob,Response,DecompressionStream:global.DecompressionStream
  };
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox);
  return sandbox;
}

const s=load();
const V2=s.__V2__;
const scoreAxis=s.__scoreAxis__;
const recommendationModel=s.__LESSON_RESULT_UI__.recommendationModel;

function scored(keys){
  const selected=new Set(keys);
  const out={};
  for(const [k,a] of Object.entries(V2.axes)){
    const oldState=s.state;
    // scoreAxis closes over the app's state, so reproduce the same axis calculation deterministically here.
    out[k]=Object.values(a.items).map(o=>{
      let score=0,reasons=[];
      for(const [key,w] of Object.entries(o.w)) if(selected.has(key)){score+=w;reasons.push(V2.labels[key]||key)}
      return {...o,score,reasons};
    }).sort((x,y)=>y.score-x.score);
  }
  return out;
}
function model(keys){return recommendationModel(scored(keys))}
function must(cond,msg){if(!cond){console.error('RUNTIME ACCEPTANCE:',msg);process.exitCode=1}}

// 1. Learner level alone must not force medium/support/participation conclusions.
let m=model(['prea1']);
must(m.media===null,'PreA1 alone must not choose paper/realia as main medium');
must(m.support===null,'PreA1 alone must not add support features');
must(m.participation===null,'PreA1 alone must not fix participation format');

// 2. Multiple L1s are a class condition, not consent to add translation support.
m=model(['mixed_l1']);
must(m.support===null,'mixed L1 alone must not recommend mother-tongue switching');

// 3. Teacher-led projector lesson should produce a simple slides-first decision.
m=model(['teacher_control','projector','quick_make','quick_edit','easy_teacher','minimal_ui']);
must(m.media?.name==='PowerPoint／Slides','teacher-led projector case should choose Slides');

// 4. TPR with movable classroom should prefer realia and whole-class bodily response.
m=model(['prea1','low_literacy','listen_act','see_act','whole_act','move_body','teacher_control','large_class','space_move']);
must(m.activity?.name==='身体反応・TPR','TPR case should choose TPR');
must(m.participation?.name==='全体一斉','TPR case should choose whole-class participation');
must(m.media?.name==='実物・教室空間','TPR case should choose realia');

// 5. Pair role-play should not invent a medium or support feature when none is needed.
m=model(['a2','interaction','pair','roleplay','scene_judge','extend_say']);
must(m.activity?.name==='やり取り・ロールプレイ','pair role-play should choose interaction');
must(m.participation?.name==='ペア','pair role-play should choose pair');
must(m.media===null,'pair role-play should allow medium to remain undecided');
must(m.support===null,'pair role-play should not add optional support');

// 6. Explicit web/individual requirements should justify HTML.
m=model(['a1','learner_self','learner_device','repeat_many','random','hide_answer','instant_feedback','level_switch','log','frequent_update']);
must(m.media?.name==='HTML／Webアプリ','explicit individual web drill should choose HTML');
must(m.participation?.name==='個別','explicit individual drill should choose individual participation');

// 7. Random teacher-led drill may be hybrid; both slides and HTML should have recommendation-level evidence.
let sc=scored(['a1','recall_say','rapid_say','repeat_many','random','hide_answer','teacher_control','projector']);
const mediaRecommended=sc.media.filter(x=>x.score>=4).map(x=>x.name);
must(mediaRecommended.includes('PowerPoint／Slides'),'teacher-led random drill should retain Slides as viable');
must(mediaRecommended.includes('HTML／Webアプリ'),'teacher-led random drill should retain HTML as viable');

if(!process.exitCode) console.log('Runtime Acceptance: PASS');

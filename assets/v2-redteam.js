// RED TEAM guardrails layered on top of generic file inference.
// Keep this small: correct category-boundary false positives rather than adding lesson-specific rules.

const _inferFeaturesBeforeRedTeam=inferFeatures;
inferFeatures=function(raw){
  const t=normalizeLessonText(raw);
  const f=new Set(_inferFeaturesBeforeRedTeam(raw));

  // Listening to a teacher/partner is an activity, not evidence that the material has an audio feature.
  if(f.has('cur_audio')&&!/(音声|おんせい|リスニング|再生|さいせい|録音|ろくおん|音を聞|おとをき)/.test(t)){
    f.delete('cur_audio');
  }

  // Common production prompts that do indicate learner speaking.
  if(/何と言|なんとい|どう言|どうい/.test(t))f.add('cur_speaking');

  return [...f];
};

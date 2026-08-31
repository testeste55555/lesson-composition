(() => {
"use strict";

const reviewValues=reviews=>Array.isArray(reviews)?reviews:Object.values(reviews||{});
const reviewsFor=(collocationId,reviews)=>reviewValues(reviews).filter(row=>row?.collocation_id===collocationId);
const signature=review=>review?.review_action==="EDIT"
  ? `EDIT\u0000${String(review.revised_collocation_text||"").trim()}`
  : String(review?.review_action||"");

function candidateState(candidate,reviews){
  const rows=reviewsFor(candidate.collocation_id,reviews);
  if(!rows.length)return {status:"UNREVIEWED",reviews:[],reviewCount:0,resolution:null};
  const signatures=new Set(rows.map(signature));
  if(signatures.size>1)return {status:"CONFLICT",reviews:rows,reviewCount:rows.length,resolution:null};
  const first=rows[0];
  return {
    status:"RESOLVED",reviews:rows,reviewCount:rows.length,
    resolution:{
      review_action:first.review_action,
      revised_collocation_text:first.review_action==="EDIT"?String(first.revised_collocation_text||"").trim():""
    }
  };
}

function termState(termId,candidates,reviews){
  const rows=candidates.filter(candidate=>candidate.term_id===termId&&candidate.is_active==="TRUE");
  const states=rows.map(candidate=>candidateState(candidate,reviews));
  const resolved=states.filter(state=>state.status==="RESOLVED").length;
  const conflicts=states.filter(state=>state.status==="CONFLICT").length;
  if(states.every(state=>state.status==="UNREVIEWED"))return {status:"UNSTARTED",resolved,conflicts,total:rows.length};
  if(conflicts||resolved<rows.length)return {status:"IN_PROGRESS",resolved,conflicts,total:rows.length};
  const accepted=states.some(state=>["HEART","EDIT"].includes(state.resolution?.review_action));
  return {status:accepted?"DONE":"REGENERATE_REQUIRED",resolved,conflicts,total:rows.length};
}

function categoryState(category,terms,candidates,reviews){
  const categoryTerms=terms.filter(term=>term.category===category&&term.is_active==="TRUE");
  const states=categoryTerms.map(term=>termState(term.term_id,candidates,reviews));
  const ended=states.filter(state=>["DONE","REGENERATE_REQUIRED"].includes(state.status)).length;
  return {
    total:categoryTerms.length,ended,
    regenerate:states.filter(state=>state.status==="REGENERATE_REQUIRED").length,
    conflicts:states.filter(state=>state.conflicts>0).length,
    percent:categoryTerms.length?Math.round(ended/categoryTerms.length*100):0
  };
}

function effectiveText(candidate,review){
  if(review?.review_action==="HEART")return candidate.collocation_text;
  if(review?.review_action==="EDIT")return String(review.revised_collocation_text||"").trim();
  return "";
}

function allReviewRows(candidates,reviews){
  const byId=new Map(candidates.map(candidate=>[candidate.collocation_id,candidate]));
  return reviewValues(reviews).map(review=>{
    const candidate=byId.get(review.collocation_id);if(!candidate)return null;
    return {
      collocation_id:candidate.collocation_id,term_id:candidate.term_id,term:candidate.term,category:candidate.category,
      collocation_text:candidate.collocation_text,reviewer_id:review.reviewer_id,review_action:review.review_action,
      revised_collocation_text:review.revised_collocation_text||"",effective_collocation_text:effectiveText(candidate,review),
      client_reviewed_at:review.client_reviewed_at,generation_version:review.generation_version
    };
  }).filter(Boolean);
}

function acceptedRows(candidates,reviews){
  return candidates.map(candidate=>{
    const state=candidateState(candidate,reviews);
    if(state.status!=="RESOLVED"||!["HEART","EDIT"].includes(state.resolution.review_action))return null;
    return {
      collocation_id:candidate.collocation_id,term_id:candidate.term_id,term:candidate.term,category:candidate.category,
      effective_collocation_text:state.resolution.review_action==="EDIT"?state.resolution.revised_collocation_text:candidate.collocation_text,
      predicate_lemma:candidate.predicate_lemma,scope:candidate.scope,generation_version:candidate.generation_version,
      review_count:state.reviewCount
    };
  }).filter(Boolean);
}

function regenerationRows(terms,candidates,reviews){
  return terms.filter(term=>termState(term.term_id,candidates,reviews).status==="REGENERATE_REQUIRED").map(term=>({
    term_id:term.term_id,term:term.term,category:term.category,reason:"ALL_CANDIDATES_RESOLVED_REJECT",
    generation_version:candidates.find(candidate=>candidate.term_id===term.term_id)?.generation_version||""
  }));
}

function conflictRows(candidates,reviews){
  return candidates.map(candidate=>{
    const state=candidateState(candidate,reviews);if(state.status!=="CONFLICT")return null;
    return {
      collocation_id:candidate.collocation_id,term_id:candidate.term_id,term:candidate.term,category:candidate.category,
      collocation_text:candidate.collocation_text,review_count:state.reviewCount,
      reviewer_ids:state.reviews.map(review=>review.reviewer_id).join(" | "),
      review_actions:state.reviews.map(review=>review.review_action).join(" | "),
      revised_collocation_texts:state.reviews.map(review=>review.revised_collocation_text||"").join(" | "),
      generation_version:candidate.generation_version
    };
  }).filter(Boolean);
}

window.COLLOCATION_HG_MODEL={reviewsFor,signature,candidateState,termState,categoryState,effectiveText,allReviewRows,acceptedRows,regenerationRows,conflictRows};
})();

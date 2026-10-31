(function(root){
  'use strict';
  // Pure, read-only filtering. This module never sends or persists card content.
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
  // When legacy action/recurring labels are eventually detached, keep their
  // historic search vocabulary backed by an unambiguous validated description.
  // The review core is loaded after this module on priority-review.html, but
  // already available by the time matches() is called. No source = no alias.
  function classificationAliases(card){
    if(!card||typeof card.desc!=='string')return [];
    const core=root.KoyoriReviewCore;
    if(!core||typeof core.derive!=='function')return [];
    let review;
    try{review=core.derive(card);}catch(_){return [];}
    if(!review||review.paused||review.dataMissing||review.manyActions)return [];
    const result=[...(Array.isArray(review.action)?review.action:[])];
    if(review.routine)result.push('日次・定常');
    return result;
  }
  function matches(card,filters={}){
    if(!card||typeof card!=='object')return false;
    const list=filters.list||'all';
    if(list!=='all'&&card.idList!==list)return false;
    const query=normalize(filters.query||'').trim();
    if(!query)return true;
    const searchable=[card.name,card.desc,card.listName,...(card.labels||[]),
      ...classificationAliases(card)].map(normalize).join('\n');
    // Space-separated words may occur in different fields; every word must match.
    return query.split(/\s+/u).every(word=>searchable.includes(word));
  }
  root.KoyoriTaskFilterCore=Object.freeze({matches});
})(window);

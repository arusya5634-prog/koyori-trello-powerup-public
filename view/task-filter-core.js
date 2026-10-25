(function(root){
  'use strict';
  // Pure, read-only filtering. This module never sends or persists card content.
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
  function matches(card,filters={}){
    const list=filters.list||'all';
    if(list!=='all'&&card.idList!==list)return false;
    const query=normalize(filters.query||'').trim();
    if(!query)return true;
    const searchable=[card.name,card.desc,card.listName,...(card.labels||[])].map(normalize).join('\n');
    // Space-separated words may occur in different fields; every word must match.
    return query.split(/\s+/u).every(word=>searchable.includes(word));
  }
  root.KoyoriTaskFilterCore=Object.freeze({matches});
})(window);

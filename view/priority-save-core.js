(function(root){
  'use strict';
  const PRIORITIES=Object.freeze(['emergency','urgent','soon','normal']);
  const valid=value=>value===null||value===undefined||PRIORITIES.includes(value);
  const canonical=value=>value===undefined?null:value;

  // All mutations are serialized by the caller per card. A mismatching remote
  // value is never overwritten silently; an ambiguous write is never undone.
  async function save(t,cardId,expected,requested){
    if(!valid(expected)||!valid(requested))return {status:'invalid'};
    let before;
    try{before=canonical(await t.get(cardId,'shared','priority',null));}
    catch(e){return {status:'read-failed'};}
    if(!valid(before))return {status:'invalid-remote'};
    if(before!==expected)return {status:'conflict',value:before};
    if(requested===before)return {status:'unchanged',value:before};

    let writeError=false;
    try{
      if(requested===null)await t.remove(cardId,'shared','priority');
      else await t.set(cardId,'shared','priority',requested);
    }catch(e){writeError=true;}

    let after;
    try{after=canonical(await t.get(cardId,'shared','priority',null));}
    catch(e){return {status:'unverified'};}
    if(!valid(after))return {status:'invalid-remote'};
    if(after===requested)return {status:'saved',value:after};
    if(after!==before)return {status:'conflict',value:after};
    return {status:writeError?'write-failed':'unverified',value:after};
  }

  root.KoyoriPrioritySaveCore=Object.freeze({PRIORITIES,valid,save});
})(window);

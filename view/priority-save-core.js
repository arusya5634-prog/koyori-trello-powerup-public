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

  // Explicit, card-bound requests can be staged by the ChatGPT Trello
  // connector in a card description. The description is a REQUEST ONLY:
  // shared plugin data remains the single source of truth.
  const PREFIX='Power-Up優先度反映依頼:';
  const REQUEST=/^\s*[-*]?\s*Power-Up優先度反映依頼:\s*v1\|([0-9a-f]{24})\|([A-Za-z0-9_-]{8,64})\|(unset|emergency|urgent|soon|normal)\|(emergency|urgent|soon|normal)\s*$/u;
  const RECEIPT='priorityLastAppliedRequest';
  function instruction(description,cardId){
    if(typeof description!=='string')return {status:'none'};
    const lines=description.split(/\r?\n/u).filter(x=>x.includes(PREFIX));
    if(!lines.length)return {status:'none'};
    if(!(/^[0-9a-f]{24}$/iu.test(String(cardId||''))))return {status:'invalid'};
    if(lines.length!==1)return {status:'invalid'};
    const match=lines[0].match(REQUEST);
    if(!match||match[1].toLowerCase()!==cardId.toLowerCase())
      return {status:'invalid'};
    return {status:'ready',request:Object.freeze({
      cardId:match[1],id:match[2],
      expected:match[3]==='unset'?null:match[3],requested:match[4]
    })};
  }
  async function applyInstruction(t,cardId,request){
    if(!t||typeof t.get!=='function'||typeof t.set!=='function'||
      !request||cardId!==request.cardId||
      !/^[0-9a-f]{24}$/iu.test(cardId)||!/^[A-Za-z0-9_-]{8,64}$/u.test(request.id)||
      !valid(request.expected)||!PRIORITIES.includes(request.requested))
      return {status:'invalid'};
    async function read(){
      const result=await Promise.all([
        t.get(cardId,'shared','priority',null),
        t.get(cardId,'shared',RECEIPT,null)
      ]);
      const priority=canonical(result[0]),receipt=canonical(result[1]);
      if(!valid(priority)|| (receipt!==null&&typeof receipt!=='string'))
        return null;
      return {priority,receipt};
    }
    let before;
    try{before=await read();}catch(_){return {status:'read-failed'};}
    if(!before)return {status:'invalid-remote'};
    // A consumed request must NEVER overwrite a subsequent manual change.
    if(before.receipt===request.id)return {status:before.priority===request.requested?
      'already-applied':'superseded',value:before.priority};
    // Fail closed if the saved priority has moved since the request was staged.
    if(before.priority!==request.expected)return {status:'conflict',value:before.priority};
    let latest;
    try{latest=await read();}catch(_){return {status:'read-failed'};}
    if(!latest)return {status:'invalid-remote'};
    if(latest.priority!==before.priority||latest.receipt!==before.receipt)
      return {status:'conflict',value:latest.priority};
    // Set both keys in ONE SDK shared-data write. There is no REST write
    // endpoint and the SDK does not provide atomic compare-and-swap.
    let writeFailed=false;
    try{
      await t.set(cardId,'shared',{priority:request.requested,[RECEIPT]:request.id});
    }catch(_){writeFailed=true;}
    let after;
    try{after=await read();}catch(_){return {status:'unverified'};}
    if(!after)return {status:'invalid-remote'};
    if(after.receipt===request.id&&after.priority===request.requested)
      return {status:'saved',value:after.priority};
    if(after.priority===before.priority&&after.receipt===before.receipt)
      return {status:writeFailed?'write-failed':'unverified',value:after.priority};
    return {status:'unverified',value:after.priority};
  }

  root.KoyoriPrioritySaveCore=Object.freeze({PRIORITIES,valid,save,instruction,applyInstruction});
})(window);

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
  async function applyInstruction(t,cardId,request,checkedBefore){
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
    // In the auto badge path, the same SDK turn reads the fresh card and
    // both priority keys concurrently. Reuse those values; the second SDK
    // read below still guards against edits before the write.
    let before;
    try{before=checkedBefore===undefined?await read():checkedBefore;}
    catch(_){return {status:'read-failed'};}
    if(!before||!valid(before.priority)||
      (before.receipt!==null&&typeof before.receipt!=='string'))
      return {status:'invalid-remote'};
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

  // Chat-originated requests can be consumed when Trello next renders a card.
  // This works only in an authorized, writable Power-Up context. It does NOT
  // provide background execution when the Trello board is closed.
  // Render callbacks are invoked repeatedly, so only attempt once per card
  // and request ID for the lifetime of this connector page.
  const autoAttempts=new Map();
  async function autoConsume(t,card){
    const parsed=instruction(card&&card.desc,card&&card.id);
    if(parsed.status!=='ready')return {status:parsed.status};
    if(!t||typeof t.card!=='function'||typeof t.getContext!=='function'||
      typeof t.isMemberSignedIn!=='function'||
      typeof t.memberCanWriteToModel!=='function')return {status:'not-authorized'};
    let context,canWrite;
    try{
      context=t.getContext();
      canWrite=t.isMemberSignedIn()===true&&t.memberCanWriteToModel('card')===true;
    }catch(_){return {status:'not-authorized'};}
    // Trello recommends memberCanWriteToModel('card') before every shared set.
    // Context fields also defend against cross-card, anonymous or board-read
    // only execution. Do not guess that a missing card context is writable.
    if(!canWrite||!context||!context.member||context.member==='notLoggedIn'||
      !context.permissions||context.permissions.board!=='write'||
      context.permissions.card!=='write'||context.card!==card.id)
      return {status:'not-authorized'};
    const key=card.id+'|'+parsed.request.id;
    // The connector already fetched the saved priority for this render.
    // After any first attempt (including ambiguous outcomes), do not read
    // or write the same queued request again within this connector page.
    // A fresh render can use that already-fetched priority for its badge.
    if(autoAttempts.has(key))return {status:'already-attempted'};
    const pending=(async()=>{
      let fresh,priority,receipt;
      try{
        [fresh,priority,receipt]=await Promise.all([
          t.card('id','name','desc'),
          t.get(card.id,'shared','priority',null),
          t.get(card.id,'shared',RECEIPT,null)
        ]);
      }catch(_){return {status:'card-read-failed'};}
      if(!fresh||fresh.id!==card.id||fresh.name!==card.name||
        fresh.desc!==card.desc)return {status:'card-changed'};
      return applyInstruction(t,card.id,parsed.request,{
        priority:canonical(priority),receipt:canonical(receipt)
      });
    })().catch(()=>({status:'unverified'}));
    autoAttempts.set(key,pending);
    return pending;
  }


  // A genuine card fact, NOT a queued command. This is read-only until
  // a separate, approved native-card write is performed through Trello.
  const NATIVE_LABELS=Object.freeze({
    '最優先':'emergency','急ぎ':'urgent','早め':'soon','通常':'normal'
  });
  const NATIVE_NAMES=Object.freeze({
    emergency:'最優先',urgent:'急ぎ',soon:'早め',normal:'通常'
  });
  const NATIVE_FIELD=/^(\s*[-*]?\s*現在の優先度\s*[:：]\s*)(.*?)\s*$/u;
  function nativePriority(desc){
    if(typeof desc!=='string')return {status:'invalid-description'};
    const matches=desc.split(/\r?\n/u).map((s,i)=>({match:s.match(NATIVE_FIELD),line:i})).filter(x=>x.match);
    if(matches.length===0)return {status:'absent'};
    if(matches.length!==1)return {status:'duplicate'};
    const text=matches[0].match[2].trim();
    if(!Object.prototype.hasOwnProperty.call(NATIVE_LABELS,text))
      return {status:'invalid-value'};
    return {status:'present',value:NATIVE_LABELS[text],line:matches[0].line};
  }
  function resolvePriority(desc,saved,options){
    const n=nativePriority(desc);
    const opts=options||{};
    if(n.status!=='absent'&&n.status!=='present')return {status:'invalid',reason:n.status};
    if(n.status==='present'){
      return {status:'ready',value:n.value,source:'description',
        legacyMismatch:opts.sharedReadOK!==false&&PRIORITIES.includes(saved)&&saved!==n.value,
        sharedUnverified:opts.sharedReadOK===false};
    }
    if(opts.sharedReadOK===false)return {status:'unverified'};
    if(saved!==null&&saved!==undefined){
      if(!PRIORITIES.includes(saved))return {status:'invalid',reason:'invalid-pluginData'};
      return {status:'ready',value:saved,source:'pluginData'};
    }
    return {status:'ready',
      value:PRIORITIES.includes(opts.legacy)?opts.legacy:'normal',
      source:'legacy'};
  }
  // Pure planning helper for the legitimate canonical card field.
  // Cannot itself bypass connector restrictions or mutate Trello.
  function planNativeUpdate(desc,expected,requested){
    if(typeof desc!=='string'||!PRIORITIES.includes(requested)||
      (expected!==null&&!PRIORITIES.includes(expected)))return {status:'invalid'};
    const n=nativePriority(desc);
    if(n.status!=='present'&&n.status!=='absent')return {status:'invalid',reason:n.status};
    const live=n.status==='present'?n.value:null;
    if(live!==expected)return {status:'conflict',value:live};
    if(live===requested)return {status:'unchanged',desc};
    const lines=desc.split(/\r?\n/u);
    const canonical='- 現在の優先度: '+NATIVE_NAMES[requested];
    if(n.status==='absent'){
      const divider=desc&& !desc.endsWith('\n')?'\n':'';
      return {status:'planned',desc:desc+divider+'\n'+canonical+'\n',value:requested};
    }
    lines[n.line]=canonical;
    return {status:'planned',desc:lines.join('\n'),value:requested};
  }


  // Read-only handoff for a one-time, consented migration to description priority.
  // Do not export card titles, descriptions, assignees or labels. Never synthesize
  // "normal" for an unset old shared value or mask a failed priority read.
  function exportSnapshot(cards){
    if(!Array.isArray(cards)||!cards.length)return {status:'empty'};
    const seen=new Set(),rows=[],counts={description:0,shared:0,titleFallback:0,unset:0,conflict:0};
    const idPattern=/^[0-9a-f]{24}$/iu;
    for(const c of cards){
      if(!c||!idPattern.test(String(c.id||''))||
        !idPattern.test(String(c.idList||''))||seen.has(c.id))return {status:'invalid-card'};
      seen.add(c.id);
      if(c.readPending||c.readError)return {status:'read-incomplete'};
      if(c.descMissing||typeof c.desc!=='string')return {status:'missing-description'};
      const native=nativePriority(c.desc);
      if(!['present','absent'].includes(native.status))return {status:'invalid-native'};
      const old=c.saved===undefined?null:c.saved;
      if(!valid(old))return {status:'invalid-shared'};
      const title=typeof c.name==='string'&&/^\s*(?:🚨|🔴|🟡)\s*/u.test(c.name);
      const fallback=title&&PRIORITIES.includes(c.legacy)?c.legacy:null;
      const source=native.status==='present'?'description':
        old!==null?'shared':fallback?'title-fallback':'unset';
      const priority=native.status==='present'?native.value:old!==null?old:fallback;
      const conflict=native.status==='present'&&old!==null&&old!==native.value;
      const row={cardId:c.id,listId:c.idList,priority,source,legacySaved:old};
      if(conflict){row.legacyMismatch=true;counts.conflict++;}
      rows.push(row);
      if(source==='description')counts.description++;
      else if(source==='shared')counts.shared++;
      else if(source==='title-fallback')counts.titleFallback++;
      else counts.unset++;
    }
    const payload={format:'koyori-priority-snapshot-v1',count:rows.length,cards:rows};
    return {status:'ready',payload,text:JSON.stringify(payload,null,2),counts};
  }

  root.KoyoriPrioritySaveCore=Object.freeze({PRIORITIES,valid,save,instruction,applyInstruction,autoConsume,nativePriority,resolvePriority,planNativeUpdate,exportSnapshot});
})(window);

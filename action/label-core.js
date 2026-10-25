/* Pure action-label planning. Trello standard labels remain authoritative. */
(function(root){
  'use strict';
  const ACTIONS=Object.freeze(['自分が次に動く','次に確認する','検討・構想']);
  const ID=/^[a-f0-9]{24}$/i;
  function checkLabels(labels,scope){
    if(!Array.isArray(labels))throw new Error(scope+' labels missing');
    for(const x of labels){
      if(!x||typeof x.name!=='string'||!ID.test(x.id||''))throw new Error(scope+' label invalid');
    }
    if(new Set(labels.map(x=>x.id)).size!==labels.length)throw new Error(scope+' duplicate ids');
  }
  function boardActions(allBoardLabels){
    checkLabels(allBoardLabels,'board');
    const byName={};
    for(const name of ACTIONS){
      const matching=allBoardLabels.filter(l=>l.name===name);
      if(matching.length!==1)throw new Error('Expected exactly one board action label: '+name);
      byName[name]=matching[0].id;
    }
    return byName;
  }
  function inspect(cardLabels,allBoardLabels){
    checkLabels(cardLabels,'card');
    const ids=boardActions(allBoardLabels);
    const actionIdSet=new Set(Object.values(ids));
    const active=cardLabels.filter(l=>actionIdSet.has(l.id));
    if(active.some(l=>ids[l.name]!==l.id))throw new Error('Inconsistent action labels');
    return {
      action:active.length===1?active[0].name:null,
      hasConflict:active.length>1,
      actionIds:active.map(l=>l.id),
      otherIds:cardLabels.filter(l=>!actionIdSet.has(l.id)).map(l=>l.id)
    };
  }
  function plan(cardLabels,allBoardLabels,target){
    const ids=boardActions(allBoardLabels);
    if(target!==null&&!Object.prototype.hasOwnProperty.call(ids,target))throw new Error('Invalid action target');
    const current=inspect(cardLabels,allBoardLabels);
    if(current.hasConflict)throw new Error('Multiple action labels: manual reconciliation required');
    const targetId=target===null?null:ids[target];
    const previousId=current.actionIds.length?current.actionIds[0]:null;
    return Object.freeze({
      before:current.action,
      after:target,
      changed:previousId!==targetId,
      toAdd:previousId!==targetId?targetId:null,
      toRemove:previousId!==targetId?previousId:null,
      preservedOtherLabels:Object.freeze([...current.otherIds])
    });
  }
  root.KoyoriActionCore=Object.freeze({ACTIONS,boardActions,inspect,plan});
})(typeof window!=='undefined'?window:this);

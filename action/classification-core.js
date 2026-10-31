/* Pure, safe project-label planning for the future authenticated editor. */
(function(root){
 'use strict';
 const ACTIONS=Object.freeze(['自分が次に動く','次に確認する','検討・構想']);
 const META=Object.freeze(['日次・定常','保留']);
 // Native urgency labels never belong to project classification edits.
 const PRIORITIES=Object.freeze(['最優先','急ぎ','早め','通常']);
 const ID=/^[a-f0-9]{24}$/i;
 function labelsValid(items){
  if(!Array.isArray(items))throw Error('Missing labels');
  const ids=new Set();
  for(const l of items){
   if(!l||typeof l.name!=='string'||!ID.test(l.id||'')||ids.has(l.id))throw Error('Invalid or duplicate labels');
   ids.add(l.id);
  }
 }
 function projectCatalog(boardLabels){
  labelsValid(boardLabels);
  return boardLabels.filter(l=>l.name.trim()&&!ACTIONS.includes(l.name)&&!META.includes(l.name)&&!PRIORITIES.includes(l.name));
 }
 function inspect(cardLabels,boardLabels){
  labelsValid(cardLabels);labelsValid(boardLabels);
  const boardById=new Map(boardLabels.map(l=>[l.id,l]));
  if(cardLabels.some(l=>!boardById.has(l.id)||boardById.get(l.id).name!==l.name))throw Error('Unknown or renamed card label');
  const projectIds=new Set(projectCatalog(boardLabels).map(l=>l.id));
  return Object.freeze({
   projectIds:Object.freeze(cardLabels.filter(l=>projectIds.has(l.id)).map(l=>l.id)),
   preservedIds:Object.freeze(cardLabels.filter(l=>!projectIds.has(l.id)).map(l=>l.id))
  });
 }
 function plan(cardLabels,boardLabels,targetIds){
  if(!Array.isArray(targetIds)||targetIds.some(id=>typeof id!=='string')||new Set(targetIds).size!==targetIds.length)
   throw Error('Invalid project selection');
  const catalog=projectCatalog(boardLabels);
  const permitted=new Set(catalog.map(x=>x.id));
  if(targetIds.some(x=>!permitted.has(x)))throw Error('Selection includes a non-project label');
  const before=inspect(cardLabels,boardLabels);
  const selected=new Set(targetIds),previous=new Set(before.projectIds);
  return Object.freeze({
   toAdd:Object.freeze(targetIds.filter(x=>!previous.has(x))),
   toRemove:Object.freeze(before.projectIds.filter(x=>!selected.has(x))),
   preservedOtherLabels:before.preservedIds,
   beforeProjectIds:before.projectIds,
   afterProjectIds:Object.freeze([...targetIds]),
   changed:targetIds.length!==before.projectIds.length||targetIds.some(x=>!previous.has(x))
  });
 }
 root.KoyoriClassificationCore=Object.freeze({ACTIONS,META,projectCatalog,inspect,plan});
})(typeof window!=='undefined'?window:this);

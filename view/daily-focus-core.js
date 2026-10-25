(function(root){
 'use strict';
 // A read-only daily review, based only on explicit Trello metadata. A proposed
 // next step is displayed as such; it is not evidence that work has progressed.
 const GROUPS=Object.freeze({
  self:'自分が次に動く',waiting:'次に確認する',thinking:'検討・構想'
 });
 const RANK=Object.freeze({emergency:0,urgent:1,soon:2,normal:3});
 // Read the last explicitly labeled field, rather than an older draft line.
 // Missing/invalid fields are never inferred from free-text descriptions.
 function shorten(value){
  const chars=Array.from(String(value||'').replace(/\*\*\s*$/u,'').trim());
  if(!chars.length||['-','未設定','未記載'].includes(chars.join('')))return null;
  return chars.length>180?chars.slice(0,180).join('')+'…':chars.join('');
 }
 function field(description,kind){
  let selected={value:null,proposal:false};
  for(const line of String(description||'').split(/\r?\n/u)){
   const match=kind==='step'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次の一手(?:[（(][^）)]*[）)])?(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):
    kind==='state'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?現在地(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?ボール(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(!match)continue;
   selected={value:shorten(match[1]),proposal:kind==='step'&&match[0].includes('整理案')};
  }
  return selected;
 }
 function stepInfo(description){return field(description,'step');}
 function nextStep(description){return stepInfo(description).value;}
 function currentState(description){return field(description,'state').value;}
 function ballOwner(description){return field(description,'ball').value;}
 function infoMissing(description){return !currentState(description)||!nextStep(description);}
 function priorityKey(card){
  if(card.readPending||card.readError)return null;
  return Object.prototype.hasOwnProperty.call(RANK,card.saved)?card.saved:
   Object.prototype.hasOwnProperty.call(RANK,card.legacy)?card.legacy:'normal';
 }
 function collect(cards,reviewCore,group){
  const result=[];
  for(const card of cards){
   const review=reviewCore.derive(card);
   if(review.paused)continue;
   if(group==='unverified'?!review.unverified:!review.action.includes(GROUPS[group]))continue;
   const step=stepInfo(card.desc);
   result.push({card,review,step:step.value,stepProposal:step.proposal,
    status:currentState(card.desc),ball:ballOwner(card.desc),
    missingInfo:infoMissing(card.desc),priority:priorityKey(card)});
  }
  return result.sort((a,b)=>
   (a.priority===null?4:RANK[a.priority])-(b.priority===null?4:RANK[b.priority])||
   (!a.step?1:0)-(!b.step?1:0)||
   (a.card.order??0)-(b.card.order??0));
 }
 // Morning review = user's next actions, plus waiting items with a review date
 // on or before today. Never infer unrecorded deadlines or work completion.
 function morning(cards,reviewCore,calendar,today){
  const mine=collect(cards,reviewCore,'self').map(x=>({...x,focusReason:'self'}));
  const seen=new Set(mine.map(x=>x.card.id));
  const waiting=collect(cards,reviewCore,'waiting')
   .filter(x=>!seen.has(x.card.id)&&calendar.bucket(x.card.desc,today)==='due')
   .map(x=>({...x,focusReason:'followup'}));
  return mine.concat(waiting).sort((a,b)=>{
   const pa=a.priority===null?4:RANK[a.priority];
   const pb=b.priority===null?4:RANK[b.priority];
   return pa-pb||
    (a.focusReason==='followup'?0:1)-(b.focusReason==='followup'?0:1)||
    (a.card.order??0)-(b.card.order??0);
  });
 }

 // Missing review dates are neither overdue nor grounds to send reminders.
 function undatedWaiting(cards,reviewCore,calendar){
  return collect(cards,reviewCore,'waiting').filter(x=>{
   if(x.review.dataMissing)return false;
   const info=calendar.inspect(x.card.desc);
   return !info.invalid&&!info.date;
  });
 }
 // Rotates up to four read-only suggestions, consistently within each local week.
 function weeklyUndated(cards,reviewCore,calendar,today,limit=4){
  if(!calendar.valid(today))return [];
  const pool=undatedWaiting(cards,reviewCore,calendar);
  if(!pool.length)return [];
  const cap=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,10):4;
  const monday=new Date(today+'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const week=Math.floor(monday.getTime()/604800000);
  const start=((week*cap)%pool.length+pool.length)%pool.length;
  return Array.from({length:Math.min(cap,pool.length)},(_,i)=>pool[(start+i)%pool.length]);
 }
 root.KoyoriDailyFocusCore=Object.freeze({GROUPS,RANK,nextStep,stepInfo,currentState,ballOwner,infoMissing,priorityKey,collect,morning,undatedWaiting,weeklyUndated});
})(window);

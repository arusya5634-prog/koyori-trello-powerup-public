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
  // Read explicitly named current values before optional display summaries.
  // A canonical explicit clearing overrides even a previously written summary.
  // Never infer a next action from a heading or unlabeled prose.
  let selected={value:null,proposal:false,source:'absent'},explicitSeen=false;
  let display={value:null,proposal:false,source:'absent'},displaySeen=false,headingSeen=false;
  for(const line of String(description||'').split(/\r?\n/u)){
   // A named Markdown section without a labeled value is unreadable, not
   // proof that the user left the underlying action or state blank.
   const heading=kind==='step'?
    /^\s*#{1,6}\s*次の一手(?:[（(][^）)]*[）)])?\s*$/u:
    kind==='state'?/^\s*#{1,6}\s*現在地\s*$/u:
    /^\s*#{1,6}\s*ボール\s*$/u;
   if(heading.test(line))headingSeen=true;
   const match=kind==='step'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次の一手(?:[（(][^）)]*[）)])?(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):
    kind==='state'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?現在地(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?ボール(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(match){
    explicitSeen=true;
    selected={value:shorten(match[1]),proposal:kind==='step'&&match[0].includes('整理案'),source:'canonical'};
    continue;
   }
   // Some structured cards contain "## 次の一手" with prose under it,
   // plus an explicit "表示用次の一手" line maintained for their summary.
   // Use the written summary only when there is no canonical key.
   const alt=kind==='step'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?表示用次の一手(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):
    kind==='state'?
    line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?表示用現在地(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u):null;
   if(alt){displaySeen=true;display={value:shorten(alt[1]),proposal:false,source:'display'};}
  }
  return explicitSeen?selected:displaySeen?display:
   {...selected,source:headingSeen?'heading':'absent'};
 }
 function stepInfo(description){return field(description,'step');}
 function nextStep(description){return stepInfo(description).value;}
 function currentState(description){return field(description,'state').value;}
 function ballOwner(description){return field(description,'ball').value;}
 function sourceKind(description,kind){
  if(!['step','state','ball'].includes(kind))return 'absent';
  return field(description,kind).source;
 }
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
    missingInfo:!review.dataMissing&&infoMissing(card.desc),priority:priorityKey(card)});
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
 root.KoyoriDailyFocusCore=Object.freeze({GROUPS,RANK,nextStep,stepInfo,currentState,ballOwner,sourceKind,infoMissing,priorityKey,collect,morning,undatedWaiting,weeklyUndated});
})(window);

// Companion read-only focus selector; kept in the existing public allowlisted module.
(function(root){
 'use strict';
 // Read-only. The caller supplies Trello-authoritative priority data and
 // source card fields; no new deadlines, reminders, owners or writes.
 const RANK={emergency:0,urgent:1,soon:2,normal:3};
 function rank(item){
  return item.priority==null?4:RANK[item.priority]??4;
 }
 function byRank(a,b){
  return rank(a)-rank(b)||(a.card.order??0)-(b.card.order??0);
 }
 function unique(items){
  const ids=new Set();
  return items.filter(x=>{
   if(!x||!x.card||!x.card.id||ids.has(x.card.id))return false;
   ids.add(x.card.id);return true;
  });
 }
 function radar(cards,reviewCore,focusCore,calendar,today){
  if(!calendar.valid(today))return {ready:false,items:[],counts:null};
  const counts={due:0,week:0,later:0,undated:0,invalid:0,unknownData:0};
  const items=focusCore.collect(cards,reviewCore,'waiting').filter(x=>!x.review.paused).map(x=>{
   const bucket=x.review.dataMissing?'unknownData':
    calendar.bucket(x.card.desc,today);
   const category=bucket==='none'?'undated':bucket;
   counts[category]=(counts[category]||0)+1;
   return {...x,radarBucket:category,focusReason:'followup'};
  });
  const ORDER={due:0,week:1,invalid:2,unknownData:3,undated:4,later:5};
  items.sort((a,b)=>(ORDER[a.radarBucket]??6)-(ORDER[b.radarBucket]??6)||byRank(a,b));
  return {ready:true,counts,items};
 }
 function daily(cards,reviewCore,focusCore,calendar,today,limit=4){
  if(!calendar.valid(today))return {ready:false,items:[],attention:[],radar:radar(cards,reviewCore,focusCore,calendar,today)};
  const cap=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,4):4;
  const self=focusCore.collect(cards,reviewCore,'self').map(x=>({...x,focusReason:'self'}));
  const waiting=radar(cards,reviewCore,focusCore,calendar,today);
  const due=waiting.items.filter(x=>x.radarBucket==='due');
  // Normally three execution candidates and one confirmed-date follow-up.
  // Empty slots are filled from remaining *eligible* work; never pad to four.
  const firstSelf=self.slice(0,Math.min(3,cap));
  const firstDue=due.slice(0,Math.min(1,Math.max(0,cap-firstSelf.length)));
  const picked=unique([...firstSelf,...firstDue]);
  const candidates=unique([...self,...due]).filter(x=>!picked.some(y=>y.card.id===x.card.id)).sort(byRank);
  for(const item of candidates){if(picked.length>=cap)break;picked.push(item);}
  picked.sort(byRank);
  const attention=unique([
   ...self.filter(x=>x.missingInfo||x.stepProposal||x.review.dataMissing||x.review.manyActions),
   ...waiting.items.filter(x=>['invalid','unknownData'].includes(x.radarBucket))
  ]).map(x=>({card:x.card,reason:x.radarBucket==='invalid'?'invalid-review-date':
   x.review.dataMissing?'missing-source':
   x.review.manyActions?'conflicting-actions':'missing-action-or-state'}));
  return {ready:true,items:picked,attention,radar:waiting,
   inspectedEligible:unique([...self,...due]).length};
 }
 function thinking(cards,reviewCore,focusCore,limit=2){
  const cap=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,2):2;
  return focusCore.collect(cards,reviewCore,'thinking').slice(0,cap);
 }

 // Review candidates are evidence gaps, never evidence that a task is late.
 function quality(cards,reviewCore,focusCore,calendar,today,clock){
  if(!calendar.valid(today))return {ready:false,items:[],counts:null,scanned:0};
  const now=Number.isFinite(clock)?clock:Date.parse(today+'T23:59:59Z');
  const counts={sourceMissing:0,conflictingActions:0,missingNextAction:0,
   unreadableNextAction:0,missingCurrentState:0,unreadableCurrentState:0,
   missingOwner:0,unreadableOwner:0,invalidReviewDate:0,
   unverifiedStatus:0,staleCandidate:0};
  const items=[],seen=new Set();
  for(const card of cards){
   if(!card||!card.id||seen.has(card.id))continue;
   seen.add(card.id);
   const review=reviewCore.derive(card);
   if(review.paused)continue;
   const action=review.action||[];
   const active=action.includes('自分が次に動く')||action.includes('次に確認する');
   const reason=[];
   if(review.dataMissing)reason.push('sourceMissing');
   if(review.manyActions)reason.push('conflictingActions');
   // When the connector did not return source fields, report that single
   // uncertainty instead of claiming individual values were never written.
   if(active&&!review.dataMissing){
    if(!focusCore.nextStep(card.desc))
     reason.push(focusCore.sourceKind(card.desc,'step')==='heading'?
      'unreadableNextAction':'missingNextAction');
    if(!focusCore.currentState(card.desc))
     reason.push(focusCore.sourceKind(card.desc,'state')==='heading'?
      'unreadableCurrentState':'missingCurrentState');
    if(action.includes('次に確認する')&&!focusCore.ballOwner(card.desc))
     reason.push(focusCore.sourceKind(card.desc,'ball')==='heading'?
      'unreadableOwner':'missingOwner');
   }
   if(!review.dataMissing&&calendar.inspect(card.desc).invalid)reason.push('invalidReviewDate');
   if(review.unverified)reason.push('unverifiedStatus');
   const last=card.lastActivity?Date.parse(card.lastActivity):NaN;
   if(active&&!review.dataMissing&&!review.routine&&Number.isFinite(last)&&Number.isFinite(now)&&last<=now-14*86400000)
    reason.push('staleCandidate');
   if(!reason.length)continue;
   for(const key of reason)counts[key]++;
   items.push({card,review,priority:focusCore.priorityKey(card),
    step:focusCore.nextStep(card.desc),status:focusCore.currentState(card.desc),
    ball:focusCore.ballOwner(card.desc),missingInfo:!review.dataMissing&&focusCore.infoMissing(card.desc),
    stepProposal:focusCore.stepInfo(card.desc).proposal,
    attentionReasons:reason,focusReason:'health'});
  }
  items.sort((a,b)=>byRank(a,b));
  return {ready:true,items,counts,scanned:seen.size};
 }
 // Date-only next-week checks use the recorded review date, never Trello's
 // official due date, a description guess, or the card's activity timestamp.
 function nextWeekWindow(today){
  const midnight=Date.parse(today+'T00:00:00Z');
  const weekday=(new Date(midnight).getUTCDay()+6)%7;
  return {start:midnight+(7-weekday)*86400000,
   end:midnight+(14-weekday)*86400000};
 }
 // A weekly *snapshot*, not a statement about week-on-week improvement.
 // Progress deltas require an actual historic comparison that is not stored here.
 function weekly(cards,reviewCore,focusCore,calendar,today){
  if(!calendar.valid(today))return {ready:false};
  const focus=daily(cards,reviewCore,focusCore,calendar,today);
  const waiting=focus.radar;
  const exceptions=quality(cards,reviewCore,focusCore,calendar,today);
  const window=nextWeekWindow(today);
  const nextWeekFollowups=waiting.items.filter(x=>{
   if(x.review.dataMissing)return false;
   const info=calendar.inspect(x.card.desc);
   if(info.invalid||!info.date)return false;
   const date=Date.parse(info.date+'T00:00:00Z');
   return Number.isFinite(date)&&date>=window.start&&date<window.end;
  }).sort((a,b)=>{
   const dateA=calendar.inspect(a.card.desc).date;
   const dateB=calendar.inspect(b.card.desc).date;
   return dateA.localeCompare(dateB)||byRank(a,b);
  });
  return {ready:true,priorityActions:focus.items.slice(0,4),
   dueFollowups:waiting.items.filter(x=>x.radarBucket==='due'),
   upcomingFollowups:waiting.items.filter(x=>x.radarBucket==='week'),
   nextWeekFollowups,
   thinking:thinking(cards,reviewCore,focusCore,2),
   exceptions:exceptions.items.slice(0,3),
   changeEvidenceAvailable:false};
 }


 // Optional weekly overview: show a bounded snapshot. Never invent "this week
 // progressed" without actual change history and never duplicate the same card.
 function weeklyOverview(cards,reviewCore,focusCore,calendar,today){
  const snapshot=weekly(cards,reviewCore,focusCore,calendar,today);
  if(!snapshot.ready)return {ready:false,items:[],changeEvidenceAvailable:false};
  const seen=new Set(),items=[];
  const window=nextWeekWindow(today);
  const groups=[
   ['重点候補',snapshot.priorityActions,4],
   ['確認対象',[...snapshot.dueFollowups,...snapshot.upcomingFollowups],2],
   ['点検候補',snapshot.exceptions,1],
   ['来週の確認',snapshot.nextWeekFollowups,1],
   ['構想の見直し',snapshot.thinking,2]
  ];
  for(const [label,source,cap] of groups){
   let added=0;
   for(const item of source){
    if(added>=cap||items.length>=9)break;
    if(!item?.card?.id||seen.has(item.card.id))continue;
    const updated=Date.parse(item.card.lastActivity||'');
    const updatedThisWeek=Number.isFinite(updated)&&
     updated>=window.start-7*86400000-9*3600000&&updated<window.start-9*3600000;
    seen.add(item.card.id);items.push({...item,weeklyLabel:label,updatedThisWeek});
    added++;
   }
  }
  return {ready:true,items,changeEvidenceAvailable:false};
 }


 // PRIVATE preview candidate for a browser-only read of the current Trello
 // card snapshot. It intentionally does NOT retrieve historic board actions:
 // the SDK card feed cannot establish complete activity pagination.
 function datedNextAction(desc,today){
  const lines=String(desc||'').split(/\r?\n/u),groups=[];
  const dateValid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(d)&&
   Number.isFinite(Date.parse(d+'T00:00:00Z'))&&
   new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  let section={date:null,title:'',latest:false,steps:[]};
  groups.push(section);
  for(const line of lines){
   const header=line.match(/^\s*#{1,6}\s+(.+?)\s*$/u);
   if(header){
    const title=header[1],rawDate=title.match(/20\d{2}-\d{2}-\d{2}/u)?.[0]??null;
    section={date:dateValid(rawDate)?rawDate:null,title,
     latest:/(?:最新状況|最新更新)/u.test(title),steps:[]};
    groups.push(section);continue;
   }
   const match=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次の一手(?:[（(][^）)]*[）)])?(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(match)section.steps.push(match[1].trim());
  }
  const distinct=[...new Set(groups.flatMap(x=>x.steps))];
  if(!dateValid(today))return {value:null,source:'unverified',date:null,ambiguous:distinct.length>1};
  if(distinct.length<2)return {value:distinct[0]||null,source:distinct.length?'single-record':'unverified',
   date:null,ambiguous:false};
  const type=g=>g.latest?'dated-latest-note':/本人確認/u.test(g.title)?
   'dated-confirmed-note':/表示用項目整備/u.test(g.title)?
   'dated-display-setup':null;
  if(groups.some(g=>type(g)&&g.date>today&&g.steps.some(Boolean)))
   return {value:null,source:'unverified',date:null,ambiguous:true};
  const available=groups.filter(g=>type(g)&&g.date&&g.date<=today&&
   g.steps.length===1&&g.steps[0]&&!/整理案|実施状況未確認/u.test(g.steps[0]));
  if(!available.length)return {value:null,source:'unverified',date:null,ambiguous:true};
  const maximum=available.map(x=>x.date).sort().at(-1);
  const winners=available.filter(x=>x.date===maximum);
  if(winners.length!==1)return {value:null,source:'unverified',date:null,ambiguous:true};
  const winner=winners[0],value=winner.steps[0];
  if(groups.some(g=>g!==winner&&g.steps.some(x=>x!==value)&&
   (!g.date||g.date>=winner.date)))
   return {value:null,source:'unverified',date:null,ambiguous:true};
  return {value,source:type(winner),date:winner.date,ambiguous:true};
 }
 function weeklyDecisionCards(cards,reviewCore,focusCore,calendar,today,limit=4){
  if(!calendar?.valid?.(today)||!Array.isArray(cards))
   return {ready:false,items:[],counts:null,historyAvailable:false};
  const cap=Number.isInteger(limit)&&limit>=1&&limit<=4?limit:4;
  const seen=new Set(),buckets={reached:[],quality:[],condition:[],undated:[],future:[]};
  for(const card of cards){
   if(!card?.id||seen.has(card.id))continue;
   seen.add(card.id);
   const review=reviewCore.derive(card);
   if(review.paused||!review.action.includes('次に確認する'))continue;
   const info=calendar.inspect(card.desc),cond=calendar.condition(card.desc);
   const provenance=datedNextAction(card.desc,today);
   const step=provenance.ambiguous?provenance.value:focusCore.nextStep(card.desc);
   const owner=focusCore.ballOwner(card.desc);
   const quality=review.dataMissing||review.manyActions||info.invalid||cond.ambiguous||
    !focusCore.nextStep(card.desc)||!owner;
   const reached=!info.invalid&&info.date&&info.date<=today;
   const kind=reached?'review-date-reached':quality?'quality-review':
    info.date?'scheduled':cond.explicit?'condition-wait':'cadence-undecided';
   const item={card,review,step:step||null,stepSource:provenance.ambiguous?
    provenance.source:step?'single-record':'unverified',
    stepDate:provenance.ambiguous?provenance.date:null,
    ambiguous:provenance.ambiguous,
    decisionKind:kind,
    decisionLabel:reached?'確認日到来':quality?'記録の確認が必要':
     kind==='condition-wait'?'条件成立時に確認':
     kind==='scheduled'?'確認日を待つ':'確認契機を検討',
    reviewNow:reached||quality,condition:cond.explicit?cond.text:null,
    priority:focusCore.priorityKey(card),ball:owner||null,status:null,missingInfo:review.dataMissing,
    stepProposal:false,actionExecutionVerified:false};
   const target=reached?'reached':quality?'quality':kind==='condition-wait'?
    'condition':kind==='scheduled'?'future':'undated';
   buckets[target].push(item);
  }
  const byId=(a,b)=>String(a.card.id).localeCompare(String(b.card.id));
  const byDate=(a,b)=>calendar.inspect(a.card.desc).date.localeCompare(
   calendar.inspect(b.card.desc).date)||byId(a,b);
  buckets.reached.sort(byDate);buckets.quality.sort(byId);
  buckets.condition.sort(byId);buckets.undated.sort(byId);buckets.future.sort(byDate);
  // A single optional cadence candidate at most. No age-based urgency.
  const monday=new Date(today+'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const rotation=buckets.undated.length?
   Math.abs(Math.floor(monday.getTime()/604800000))%buckets.undated.length:0;
  const optional=buckets.undated.slice(rotation).concat(buckets.undated.slice(0,rotation));
  const items=[...buckets.reached,...buckets.quality,...buckets.condition,
   ...optional.slice(0,1)].slice(0,cap);
  return {ready:true,items,counts:Object.freeze({
   reached:buckets.reached.length,quality:buckets.quality.length,
   condition:buckets.condition.length,undated:buckets.undated.length,
   future:buckets.future.length}),
   historyAvailable:false,mutatesTrello:false};
 }

 root.KoyoriFocusV2Core=Object.freeze({daily,radar,thinking,quality,weekly,weeklyOverview,weeklyDecisionCards,datedNextAction});
})(window);

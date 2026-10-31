(function(root){
 'use strict';
 // Follow-up date only. Does not change Trello card due dates.
 const ISO=/^\d{4}-\d{2}-\d{2}$/u;
 function valid(s){
  if(!ISO.test(s||''))return false;
  const date=new Date(s+'T00:00:00Z');
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===s;
 }
 function inspect(desc){
  const dates=[];let invalid=false;
  for(const line of String(desc||'').split(/\r?\n/u)){
   const m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次回確認日(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(!m)continue;
   const value=m[1].trim();if(!valid(value))invalid=true;else dates.push(value);
  }
  if(invalid||new Set(dates).size>1)return {date:null,invalid:true};
  return {date:dates[0]||null,invalid:false};
 }
 // An explicitly written recheck *condition* is a separate field
 // from an optional review date. Never infer conditions from next steps.
 function condition(desc){
  const values=[];
  let empty=false;
  for(const line of String(desc||'').split(/\r?\n/u)){
   const match=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:確認条件|再確認条件|確認契機)(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(!match)continue;
   const value=match[1].trim();
   if(!value||/^(?:未設定|未確認|なし|[-—－])$/u.test(value))empty=true;
   else values.push(value);
  }
  const distinct=[...new Set(values)];
  if(empty||distinct.length>1)return {text:null,explicit:false,ambiguous:true};
  return {text:distinct[0]||null,explicit:distinct.length===1,ambiguous:false};
 }
 function todayLocal(d=new Date()){
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 }
 function weekEnd(today){
  if(!valid(today))return null;
  const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+(7-d.getUTCDay())%7);
  return d.toISOString().slice(0,10);
 }
 function bucket(desc,today){
  const info=inspect(desc);
  if(info.invalid)return 'invalid';
  if(!info.date)return 'none';
  if(!valid(today))return 'invalid';
  if(info.date<=today)return 'due';
  if(info.date<=weekEnd(today))return 'week';
  return 'later';
 }
 function included(desc,filter,today){
  const b=bucket(desc,today);
  return filter==='all'||b===filter;
 }

 // A separate, explicitly curated event day. Never derive it from prose:
 // "earliest possible", unscheduled windows and completed meetings are not promises.
 // Canonical example: - 次の予定: 2026-11-02｜会議
 function nextSchedule(desc){
  const found=[];
  for(const line of String(desc||'').split(/\r?\n/u)){
   const m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次の予定(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
   if(m)found.push(m[1].trim());
  }
  if(!found.length)return {date:null,label:null,invalid:false};
  if(found.length!==1)return {date:null,label:null,invalid:true};
  const match=found[0].match(/^(\d{4}-\d{2}-\d{2})\s*[｜|]\s*([^\s｜|]{1,6})$/u);
  if(!match||!valid(match[1])||!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]{1,6}$/u.test(match[2]))
   return {date:null,label:null,invalid:true};
  return {date:match[1],label:match[2],invalid:false};
 }
 // Read-only card-front badges. The description and real Trello due date are
 // not mutated. In particular, a missed follow-up is not a deadline breach.
 function frontBadge(desc,now=new Date()){
  // JavaScript realms (e.g. independent Power-Up / Node VM contexts) can
  // provide genuine Date values whose constructor differs from this module's.
  // Validate the date interface rather than rejecting cross-realm Dates.
  if(typeof desc!=='string'||!now||
     typeof now.getTime!=='function'||
     typeof now.getFullYear!=='function'||
     typeof now.getMonth!=='function'||
     typeof now.getDate!=='function'||
     !Number.isFinite(now.getTime()))return [];
  const review=inspect(desc),scheduled=nextSchedule(desc);
  if(review.invalid||scheduled.invalid)return [];
  const choices=[];
  if(review.date)choices.push({date:review.date,label:'確認',rank:1});
  if(scheduled.date)choices.push({date:scheduled.date,label:scheduled.label,rank:0});
  if(!choices.length)return [];
  choices.sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank);
  const next=choices[0],today=todayLocal(now);
  const past=next.date<today,day=next.date.split('-');
  return [{text:'📅 '+Number(day[1])+'/'+Number(day[2])+' '+next.label,
   color:past?'orange':next.date===today?'yellow':'light-gray'}];
 }

 root.KoyoriNextReviewCore=Object.freeze({valid,inspect,condition,todayLocal,weekEnd,bucket,included,nextSchedule,frontBadge});
})(window);

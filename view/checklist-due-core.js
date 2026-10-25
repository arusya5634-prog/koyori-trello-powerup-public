(function(root){
 'use strict';
 // Checklist item name is the only due-date source. This is not Trello's paid
 // Advanced Checklist due date, and does not generate Trello due reminders.
 const SUFFIX=/^(.*?)(?:\s*)【期日[:：]([^】]+)】$/u;
 function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(value||''))return false;
  const d=new Date(value+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
 }
 function parseName(name){
  const original=String(name||'');
  const m=original.match(SUFFIX);
  if(!m)return {title:original,date:null,invalid:false,hasDate:false};
  const date=m[2].trim();
  return {title:m[1].trim(),date:validDate(date)?date:null,
   invalid:!validDate(date)||!m[1].trim(),hasDate:true};
 }
 function withDate(name,date){
  if(!validDate(date))return null;
  const parsed=parseName(name);
  if(parsed.invalid||!parsed.title)return null;
  return parsed.title+'【期日：'+date+'】';
 }
 function items(checklists){
  if(!Array.isArray(checklists))return null; // unknown, never claim empty
  const all=[];
  for(const list of checklists){
   if(!list||!Array.isArray(list.checkItems))return null; // incomplete SDK read
   for(const item of list.checkItems){
    if(!item||typeof item.name!=='string')return null;
    const parsed=parseName(item.name);
    all.push({id:item.id||'',listName:String(list.name||'チェックリスト'),
     title:parsed.title,date:parsed.date,invalid:parsed.invalid,hasDate:parsed.hasDate,
     completed:String(item.state||'').toLowerCase()==='complete',
     rawName:item.name});
   }
  }
  return all;
 }
 function nextDue(checklists,today){
  const all=items(checklists);
  if(!all)return {status:'unavailable',item:null};
  const pending=all.filter(x=>!x.completed&&x.date&&!x.invalid)
   .sort((a,b)=>a.date.localeCompare(b.date));
  if(!pending.length)return {status:'none',item:null};
  const first=pending[0];
  return {status:validDate(today)&&first.date<today?'past':'scheduled',
   item:first};
 }
 // Fail closed: an empty SDK response is not proof that a native Trello
 // checklist is empty. A second supported card read may recover its items.
 function badgeCount(card){
  const n=card&&card.badges&&card.badges.checkItems;
  return Number.isInteger(n)&&n>=0?n:null;
 }
 function resolveChecklists(primary,fallback){
  const candidates=[primary,fallback].filter(Boolean);
  for(const card of candidates){
   if(!Array.isArray(card.checklists))continue;
   const all=items(card.checklists);
   if(all&&all.length)return {status:'ready',checklists:card.checklists};
  }
  const counts=candidates.map(badgeCount).filter(x=>x!==null);
  const confirmedZero=counts.length>0&&counts.every(x=>x===0);
  const verifiedEmpty=candidates.some(x=>Array.isArray(x.checklists)&&x.checklists.length===0);
  if(verifiedEmpty&&confirmedZero)return {status:'empty',checklists:[]};
  return {status:'unavailable',checklists:null};
 }
 function displayDate(date){return validDate(date)?Number(date.slice(5,7))+'/'+Number(date.slice(8,10)):'';}
 root.KoyoriChecklistDueCore=Object.freeze({validDate,parseName,withDate,items,nextDue,resolveChecklists,displayDate});
})(window);

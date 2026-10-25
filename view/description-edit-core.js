(function(root){
 'use strict';
 // Prepare only. Caller must retrieve live Trello desc, compare, save through
 // an authorized connector, then read back to verify. No API/SDK writes here.
 const FIELDS=Object.freeze({progress:'現在地',nextAction:'次の一手',reviewDate:'次回確認日',ball:'ボール'});
 const MAX=16384;
 function validDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
 }
 function keyFor(line){
  const match=String(line).match(/^(\s*(?:[-*]\s*)?(?:\*\*)?)(現在地|次の一手|次回確認日|ボール)([（(][^）)]*[）)])?((?:\*\*)?\s*[:：]\s*)(.*)$/u);
  if(!match)return null;
  const key=Object.keys(FIELDS).find(k=>FIELDS[k]===match[2]);
  return {key,label:match[2],annotated:!!match[3],prefix:match[1],qualifier:match[3]||'',
   separator:match[4],value:match[5]};
 }
 function prepare(description,change){
  if(typeof description!=='string'||!change||typeof change!=='object'||Array.isArray(change))
   return {status:'invalid-input'};
  const keys=Object.keys(change);
  if(!keys.length||keys.some(key=>!Object.prototype.hasOwnProperty.call(FIELDS,key)))
   return {status:'invalid-input'};
  for(const key of keys){
   if(typeof change[key]!=='string'||!change[key].trim()||/[\r\n]/u.test(change[key])||
      Array.from(change[key]).length>280)return {status:'invalid-input',field:key};
   if(key==='reviewDate'&&!validDate(change[key].trim()))return {status:'invalid-input',field:key};
  }
  const newline=description.includes('\r\n')?'\r\n':'\n';
  const lines=description.split(/\r?\n/u);
  const out=[...lines],appends=[];
  for(const key of keys){
   let canonical=[],annotated=[];
   for(let i=0;i<lines.length;i++){
    const x=keyFor(lines[i]);if(!x||x.key!==key)continue;
    (x.annotated?annotated:canonical).push({index:i,parsed:x});
   }
   // Do not silently choose which of multiple active entries to overwrite.
   if(canonical.length>1||annotated.length>1)return {status:'ambiguous',field:key};
   // Updating a single canonical line preserves Markdown prefix and other prose.
   if(canonical.length===1){
    const {index,parsed}=canonical[0];
    out[index]=parsed.prefix+parsed.label+parsed.separator+change[key].trim();
   }else{
    // A legacy draft remains history. New accepted value follows it and wins.
    appends.push('- '+FIELDS[key]+': '+change[key].trim());
   }
  }
  let result=out.join(newline);
  if(appends.length)result+=(result&&!result.endsWith(newline)?newline:'')+appends.join(newline);
  if(result===description)return {status:'unchanged',description};
  if(Array.from(result).length>MAX)return {status:'too-long'};
  return {status:'ready',description:result,changedKeys:keys};
 }
 function unchangedSince(expected,live){
  return typeof expected==='string'&&typeof live==='string'&&expected===live;
 }
 root.KoyoriDescriptionEditCore=Object.freeze({FIELDS,MAX,prepare,unchangedSince,keyFor});
})(window);

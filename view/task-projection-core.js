(function(root){
 'use strict';
 // Single source: Trello card description. No pluginData reads or writes.
 function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const d=new Date(value+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
 }
 function parse(description){
  const result={ball:'',progress:'',nextAction:'',reviewDate:'',draft:false,invalidReviewDate:false,
   duplicateFields:[]};
  const seen={ball:[],progress:[],nextAction:[],reviewDate:[]};
  for(const line of String(description||'').split(/\r?\n/)){
   let m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?ボール(?:\*\*)?\s*[:：]\s*(.*)$/u);
   if(m){result.ball=m[1].replace(/\*\*\s*$/u,'').trim();seen.ball.push(result.ball);continue;}
   m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?現在地(?:\*\*)?\s*[:：]\s*(.*)$/u);
   if(m){result.progress=m[1].replace(/\*\*\s*$/u,'').trim();seen.progress.push(result.progress);continue;}
   m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次の一手(?:([（(][^）)]*[）)]))?(?:\*\*)?\s*[:：]\s*(.*)$/u);
   if(m){
    result.nextAction=m[2].replace(/\*\*\s*$/u,'').trim();
    result.draft=!!m[1]&&m[1].includes('整理案');
    seen.nextAction.push({value:result.nextAction,annotated:!!m[1]});
    continue;
   }
   m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?次回確認日(?:\*\*)?\s*[:：]\s*(.*)$/u);
   if(m){
    result.reviewDate=m[1].replace(/\*\*\s*$/u,'').trim();
    result.invalidReviewDate=!!result.reviewDate&&!validDate(result.reviewDate);
    seen.reviewDate.push(result.reviewDate);
   }
  }
  for(const key of ['ball','progress','nextAction','reviewDate']){
   if(['未設定','未記載','-'].includes(result[key]))result[key]='';
   // A repeated field is ambiguous even when the last value is shown.
   if(key==='nextAction'){
    const active=seen.nextAction.filter(x=>!x.annotated);
    const old=seen.nextAction.filter(x=>x.annotated);
    // One old draft plus one current explicit action is intentional history.
    // Two current actions (or two competing drafts) need human review.
    if(active.length>1||old.length>1)result.duplicateFields.push(key);
   }else if(seen[key].length>1)result.duplicateFields.push(key);
  }
  return result;
 }
 root.KoyoriTaskProjectionCore=Object.freeze({parse,validDate});
})(window);

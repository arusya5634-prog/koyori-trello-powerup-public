(function(root){
 'use strict';
 // Free deterministic extractive summary. No external model, paid API or writes.
 const LIMIT=20;
 const chars=s=>Array.from(s||'').length;
 function clean(v){return String(v||'').replace(/\s+/gu,' ').replace(/[。．！？!?]+$/gu,'').trim();}
 function fit(v){const s=clean(v);return s&&chars(s)<=LIMIT?s:null;}
 function compressList(phrase,ending){
  let p=clean(phrase);
  if(fit(p+ending))return fit(p+ending);
  let items=p.split(/[・、，]/u).filter(Boolean);
  function simplify(item){
   // Keep the original object noun; remove only contextual modifiers.
   const m=item.match(/(?:^|の)([^の]{2,14}(?:状況|予定|事項|論点|課題|工程|内容|見通し|工数|費用))$/u);
   return m?m[1]:item;
  }
  if(items.length>=2){
   const i=items[0].lastIndexOf('の');
   if(i>=0&&i<items[0].length-1){
    items[0]=items[0].slice(i+1);
    if(fit(items.join('・')+ending))return fit(items.join('・')+ending);
   }
   if(items.length>=3){
    const a=items[0]+'・'+items.at(-1)+ending;
    if(fit(a))return fit(a);
   }
   const slim=items.map(simplify);
   if(fit(slim.join('・')+ending))return fit(slim.join('・')+ending);
   if(items.length>=3&&fit(slim[0]+'・'+slim.at(-1)+ending))
    return fit(slim[0]+'・'+slim.at(-1)+ending);
   if(fit(slim.slice(-2).join('・')+ending))return fit(slim.slice(-2).join('・')+ending);
   return fit(slim.at(-1)+ending);
  }
  return null;
 }
 function progressSummary(value){
  const source=clean(value);if(!source)return null;
  const clauses=source.split(/[。！？]/u).map(clean).filter(Boolean);
  const states=/(未確認|確認待ち|回答待ち|返答待ち|依頼済み|委任済み|進行中|対応中|作業中|検討中|調整中|保留|未着手|完了|必要|予定|課題)/u;
  const main=clauses.slice().reverse().find(x=>states.test(x))||clauses[0];
  const shorter=main.replace(/現在の|現時点の|現状の/gu,'').replace(/や(?=[^や]{1,12}(?:は|が|を))/gu,'・');
  if(fit(shorter))return fit(shorter);
  if(shorter.includes('、')){
   const tail=shorter.split(/[、，]/u).at(-1).trim();
   if(fit(tail)&&/(未確認|待ち|必要|予定|課題|調整中|対応中)/u.test(tail))
    return fit(tail);
  }
  const match=[...shorter.matchAll(/未確認|確認待ち|回答待ち|返答待ち|依頼済み|委任済み|進行中|対応中|作業中|検討中|調整中|保留|未着手/gu)].at(-1);
  if(match){
   const state=match[0],prefix=shorter.slice(0,match.index).replace(/[、，]+$/u,'');
   const result=compressList(prefix,state);
   if(result)return result;
   return fit(prefix.split(/[、，]/u).at(-1).trim()+state);
  }
  return null;
 }
 function actionSummary(value){
  const source=clean(value);if(!source)return null;
  const match=source.match(/^(.+?)を(確認|整理|検討|依頼|共有|調査|検証|把握|連絡|報告|作成|提出|相談|調整|更新|管理)(?:し|して|する)?(?=[、，。]|$)/u);
  if(match){
   const summary=compressList(match[1],'を'+match[2]);
   if(summary)return summary;
  }
  if(fit(source))return fit(source);
  const sentence=source.split(/[。！？]/u)[0];
  if(/を(?:確認|整理|検討|依頼|共有|調査|検証|把握|連絡|報告|作成|提出|相談|調整|更新|管理)/u.test(sentence))
   return fit(sentence);
  return null;
 }
 function summarize(kind,value){
  if(kind==='reviewDate')return clean(value)||null;
  if(kind==='progress')return progressSummary(value);
  if(kind==='nextAction')return actionSummary(value);
  return null;
 }
 // Prefer self-contained source sentences. When no safe short sentence exists,
 // show an honest visible excerpt rather than an opaque "details" placeholder.
 const DISPLAY_LIMIT=24;
 function explicitSummary(description,kind){
  const label=kind==='progress'?'表示用現在地':kind==='nextAction'?'表示用次の一手':null;
  if(!label)return null;
  const found=[];
  for(const line of String(description||'').split(/\r?\n/u)){
   const m=line.match(/^\s*(?:[-*]\s*)?(表示用現在地|表示用次の一手)\s*[:：]\s*(.*?)\s*$/u);
   if(m&&m[1]===label)found.push(clean(m[2]));
  }
  return found.length===1&&found[0]&&chars(found[0])<=DISPLAY_LIMIT?found[0]:null;
 }
 function readableSummary(kind,value){
  const source=clean(value);
  if(!source)return null;
  if(chars(source)<=DISPLAY_LIMIT)return source;
  const sentences=source.split(/[。！？]/u).map(clean).filter(Boolean);
  if(kind==='progress'){
   const eligible=sentences.map((sentence,index)=>({sentence,index})).filter(x=>chars(x.sentence)<=DISPLAY_LIMIT);
   if(eligible.length){
    const score=s=>{
     let value=0;
     if(/未確認|未決定|未確定|回答待ち|調整中|検討中|保留|見通し|報告ではない|まだ|済み/u.test(s))value+=4;
     if(/予定|状況|対応中|作業中|課題|必要|確保|依頼|準備|完了/u.test(s))value+=2;
     return value;
    };
    eligible.sort((a,b)=>score(b.sentence)-score(a.sentence)||a.index-b.index);
    return eligible[0].sentence;
   }
   // Preserve previously tested, extractive summaries when no whole sentence fits.
   const old=progressSummary(source);
   if(old)return old;
  }else if(kind==='nextAction'){
   const first=sentences[0]||source;
   if(chars(first)<=DISPLAY_LIMIT)return first;
   // Prefer the first concrete action clause, or a later independent
   // clause if the opener only says "at the meeting" / "after receiving".
   const clauses=first.split(/[、，]/u).map(clean).filter(Boolean);
   const action=/確認|依頼|共有|整理|調整|検討|進め|着手|受領|報告|作成|問い合わせ|決める|把握|行う|具体化|再開|相談|判断/u;
   const candidate=clauses.find(x=>chars(x)>=12&&chars(x)<DISPLAY_LIMIT&&action.test(x));
   if(candidate){
    const unfinished=/(?:し|して|ながら|つつ)$/u.test(candidate);
    return unfinished?candidate+'…':candidate;
   }
   const old=actionSummary(source);
   if(old&&!/で・|て・|から・/u.test(old))return old;
  }
  // Truncation is visible, never a fabricated completion or an absent badge.
  // The original description is still available from the badge callback.
  return Array.from(source).slice(0,DISPLAY_LIMIT-1).join('')+'…';
 }
 function ownerBadge(rawOwner,openDetails){
  const value=clean(rawOwner);
  if(!value||['未設定','未記載','-'].includes(value))return [];
  // An owner name is an identity, not prose to summarize. Never cut it midway.
  return [{
   title:'ボール',
   text:'👤 '+value,
   color:'light-gray',callback:openDetails
  }];
 }
 function badges(description,openDetails){
  const p=root.KoyoriTaskProjectionCore;
  if(!p||typeof p.parse!=='function'||typeof description!=='string')return [];
  const d=p.parse(description),result=[];
  function add(kind,title,value,attention){
   if(!value)return;
   const manual=kind==='reviewDate'?null:explicitSummary(description,kind);
   const text=kind==='reviewDate'?clean(value):(manual||readableSummary(kind,value));
   const needsReview=!manual&&kind!=='reviewDate'&&text.endsWith('…');
   result.push({title,text,
    color:attention||needsReview?'orange':'light-gray',callback:openDetails});
  }
  // The user's preferred reading order: review date before progress / next action.
  add('reviewDate','次回確認日',d.reviewDate,
      d.invalidReviewDate||d.duplicateFields.includes('reviewDate'));
  add('progress','現在地',d.progress,d.duplicateFields.includes('progress'));
  add('nextAction',d.draft?'次の一手（案）':'次の一手',d.nextAction,
      d.draft||d.duplicateFields.includes('nextAction'));
  return result;
 }
 root.KoyoriTopSummaryCore=Object.freeze({LIMIT,DISPLAY_LIMIT,clean,fit,progressSummary,actionSummary,summarize,readableSummary,explicitSummary,ownerBadge,badges});
})(window);

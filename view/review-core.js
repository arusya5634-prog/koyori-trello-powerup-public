(function(root){
  'use strict';
  // Read-only classification using explicit card metadata and literal wording.
  // An "unverified" status means missing evidence, never that work is overdue.
  const ACTIONS=Object.freeze(['自分が次に動く','次に確認する','検討・構想']);
  const META=Object.freeze(['日次・定常','保留']);
  const PRIORITIES=Object.freeze(['最優先','急ぎ','早め','通常']);
  // Later human checks supersede older provisional notes but not task completion.
  function confirmedAfterOldNote(description){
    const text=String(description||'');
    const reUnknown=/実施状況未確認|現況未確認|状態未確認/gu;
    let unknown=-1,m;while((m=reUnknown.exec(text))!==null)unknown=m.index;
    if(unknown<0)return false;
    const reConfirmed=/^##\s*(?:(?:第\d+バッチ|最新)\s*)?本人確認(?:[（(]\d{4}-\d{2}-\d{2}[）)])?\s*$/gmu;
    let last=-1;while((m=reConfirmed.exec(text))!==null)last=m.index;
    return last>unknown;
  }
  function hasUnverifiedStatus(description){
    return /実施状況未確認|現況未確認|状態未確認/u.test(String(description||''))&&!confirmedAfterOldNote(description);
  }
  function hasBall(description){
    return /^\s*(?:[-*]\s+)?(?:\*\*)?ボール(?:\*\*)?\s*[:：]\s*(?!未設定\s*$)(?!-\s*$)\S+/m.test(String(description||''));
  }
  // Canonical description metadata first; legacy labels remain a consistency
  // check during coexistence. Ambiguities are never treated as valid work.
  function metadata(description,key){
    const values=[];
    for(const line of description.split(/\r?\n/u)){
      const m=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(行動区分|継続区分)(?:\*\*)?\s*[:：]\s*(.*?)\s*$/u);
      if(m&&m[1]===key)values.push(m[2].trim());
    }
    return values.length>1||(values.length===1&&!values[0])?
      {invalid:true,value:null}:{invalid:false,value:values.length?values[0]:null};
  }
  function actionSource(card,labels){
    if(typeof card.desc!=='string'||card.descMissing===true||
       card.labelsMissing===true||card.labelsHasMore===true)return {invalid:true};
    if(new Set(labels).size!==labels.length||labels.some(x=>typeof x!=='string'||!x.trim()))
      return {invalid:true};
    const a=metadata(card.desc,'行動区分'),r=metadata(card.desc,'継続区分');
    if(a.invalid||r.invalid||
       (a.value!==null&&!['Act','確認'].includes(a.value))||
       (r.value!==null&&!['定常','非定常'].includes(r.value)))return {invalid:true};
    const old=labels.filter(x=>ACTIONS.includes(x));
    if(old.length>1)return {invalid:true,reason:'legacy-action-conflict'};
    const legacy=old[0]||null;
    if(a.value!==null&&legacy&&
       ((a.value==='Act'&&legacy!=='自分が次に動く')||
        (a.value==='確認'&&legacy!=='次に確認する')))return {invalid:true};
    if(r.value==='非定常'&&labels.includes('日次・定常'))return {invalid:true};
    const action=a.value?[a.value==='Act'?'自分が次に動く':'次に確認する']:
      legacy?[legacy]:[];
    const routine=r.value==='定常'||(r.value===null&&labels.includes('日次・定常'));
    return {invalid:false,action,routine};
  }
  function derive(card){
    const labels=Array.isArray(card.labels)?card.labels:[];
    const unreadable=!Array.isArray(card.labels)||typeof card.desc!=='string'||
      card.descMissing===true||card.labelsMissing===true||card.labelsHasMore===true;
    const resolved=actionSource(card,labels);
    const invalid=unreadable||resolved.invalid;
    // Preserve *observed* legacy labels solely for review diagnostics, even
    // when an unrelated source field is unreadable. They are NOT approved
    // execution candidates: Focus explicitly excludes invalid/multiple actions.
    const observedActions=labels.filter(x=>ACTIONS.includes(x));
    const action=invalid?observedActions:resolved.action;
    const project=labels.filter(x=>!ACTIONS.includes(x)&&!META.includes(x)&&!PRIORITIES.includes(x));
    const paused=labels.includes('保留')||/^90(?:$|[｜\s])/u.test(card.listName||'');
    const routine=!invalid&&resolved.routine;
    const dataMissing=unreadable||(resolved.invalid&&resolved.reason!=='legacy-action-conflict');
    const missingAction=!invalid&&!action.length&&!paused&&!routine;
    const manyActions=observedActions.length>1; // Distinct from invalid metadata/dataMissing
    const missingProject=!invalid&&!project.length&&!paused;
    const unverified=hasUnverifiedStatus(card.desc);
    const confirmedLater=confirmedAfterOldNote(card.desc);
    return {action,project,paused,routine,missingAction,manyActions,missingProject,unverified,confirmedLater,dataMissing,
      needs:!paused&&(missingAction||manyActions||missingProject||unverified||dataMissing)};
  }
  function alerts(card,priority,clock=Date.now()){
    const review=derive(card);
    if(review.paused)return [];
    const result=[];
    const due=card.due?Date.parse(card.due):NaN;
    if(Number.isFinite(due)&&!card.dueComplete){
      if(due<clock)result.push({name:'期限超過',severity:'high'});
      else if(due-clock<=3*86400000)result.push({name:'72時間以内',severity:'medium'});
    }
    if(review.action.includes('次に確認する')&&!hasBall(card.desc))
      result.push({name:'ボール未設定',severity:'high'});
    const last=card.lastActivity?Date.parse(card.lastActivity):NaN;
    if(!review.routine&&review.action.length&&Number.isFinite(last)&&last<=clock-14*86400000)
      result.push({name:'14日更新なし',severity:'medium'});
    if(!card.due&&['urgent','emergency'].includes(priority))
      result.push({name:'急ぎ・期限未設定',severity:'info'});
    return result;
  }
  root.KoyoriReviewCore=Object.freeze({ACTIONS,derive,alerts,hasUnverifiedStatus,confirmedAfterOldNote,hasBall});
})(window);

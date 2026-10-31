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
  function derive(card){
    const labels=Array.isArray(card.labels)?card.labels:[];
    const dataMissing=card.descMissing===true||card.labelsMissing===true;
    const action=labels.filter(x=>ACTIONS.includes(x));
    const project=labels.filter(x=>!ACTIONS.includes(x)&&!META.includes(x)&&!PRIORITIES.includes(x));
    const paused=labels.includes('保留')||/^90(?:$|[｜\s])/u.test(card.listName||'');
    const routine=labels.includes('日次・定常');
    const missingAction=!action.length&&!paused&&!routine&&!card.labelsMissing;
    const manyActions=action.length>1;
    const missingProject=!project.length&&!paused&&!card.labelsMissing;
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

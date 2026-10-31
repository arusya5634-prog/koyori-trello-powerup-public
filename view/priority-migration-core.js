(function(root){
  'use strict';
  // Stage one of the title-prefix migration. Copies only priority metadata;
  // card names are never modified here. Every read/write is verified.
  async function migrate(t,cards,prioritySave,onProgress){
    const legacy=cards.filter(c=>c.legacy&&c.legacy!=='normal');
    const report={total:legacy.length,created:0,existing:0,conflicts:0,failed:0,disagreements:0};
    for(const c of legacy){
      if(c.readPending||c.readError){
        report.failed++;
      }else{
        const expected=c.saved;
        const requested=expected===null?c.legacy:expected;
        const result=await prioritySave.save(t,c.id,expected,requested);
        if(Object.prototype.hasOwnProperty.call(result,'value'))c.saved=result.value;
        if(result.status==='saved')report.created++;
        else if(result.status==='unchanged')report.existing++;
        else if(result.status==='conflict')report.conflicts++;
        else{report.failed++;c.readError=true;}
      }
      if(typeof onProgress==='function')onProgress({...report});
    }
    report.ready=report.created+report.existing;
    report.canRename=report.ready===report.total&&report.failed===0&&report.conflicts===0;
    report.disagreements=legacy.filter(c=>c.saved!==null&&c.saved!==c.legacy).length;
    return report;
  }
  // Read-only preview of native priority-label migration.
  // Until a separately approved cutover, the canonical description line wins.
  const LABEL_PRIORITY=Object.freeze({
    '最優先':'emergency','急ぎ':'urgent','早め':'soon','通常':'normal'
  });
  function inspectPriorityLabels(desc,labels){
    if(typeof desc!=='string'||!Array.isArray(labels))
      return {status:'unreadable',value:null};
    const matches=[];
    for(const line of desc.split(/\r?\n/u)){
      const m=line.match(/^\s*(?:[-*]\s*)?現在の優先度\s*[:：]\s*(.*?)\s*$/u);
      if(m)matches.push(m[1]);
    }
    if(matches.length!==1||!Object.prototype.hasOwnProperty.call(LABEL_PRIORITY,matches[0]))
      return {status:'invalid-canonical',value:null};
    const seen=[];
    for(const label of labels){
      if(!label||typeof label.name!=='string')
        return {status:'unreadable',value:null};
      if(Object.prototype.hasOwnProperty.call(LABEL_PRIORITY,label.name)){
        // Trello colorless labels are absent from card fronts. Never hide
        // the old priority badge until the matching native label is visible.
        if(typeof label.color!=='string'||!label.color.trim()||
          label.color==='none'||label.color==='transparent')
          return {status:'invisible',value:null,expected:matches[0]};
        seen.push(label.name);
      }
    }
    if(!seen.length)return {status:'missing',value:null,expected:matches[0]};
    if(seen.length!==1)return {status:'multiple',value:null,expected:matches[0]};
    if(seen[0]!==matches[0])
      return {status:'conflict',value:null,expected:matches[0],observed:seen[0]};
    return {status:'ready',value:LABEL_PRIORITY[matches[0]],label:matches[0]};
  }
  root.KoyoriPriorityMigrationCore=Object.freeze({migrate,inspectPriorityLabels});
})(window);

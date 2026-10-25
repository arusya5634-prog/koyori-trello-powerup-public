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
  root.KoyoriPriorityMigrationCore=Object.freeze({migrate});
})(window);

(function(root){
 'use strict';
 const KEY='koyori_task_fields_v1';
 // Keep the three small fields well below the 4096-character card/shared limit.
 const LIMITS=Object.freeze({progress:280,nextAction:280,reviewDate:10});
 const empty=()=>({v:1,progress:'',nextAction:'',reviewDate:''});
 function validDate(value){
  if(value==='')return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const d=new Date(value+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
 }
 function normalize(model){
  if(!model||typeof model!=='object'||Array.isArray(model)||model.v!==1)return null;
  const output=empty();
  for(const key of Object.keys(LIMITS)){
   if(typeof model[key]!=='string')return null;
   const value=model[key].trim();
   if(Array.from(value).length>LIMITS[key])return null;
   output[key]=value;
  }
  if(!validDate(output.reviewDate))return null;
  return output;
 }
 function field(description,kind){
  const lines=String(description||'').split(/\r?\n/u);
  let value='';
  for(const line of lines){
   const re=kind==='progress'?/^\s*(?:[-*]\s*)?(?:\*\*)?現在地(?:\*\*)?\s*[:：]\s*(.*)$/u:
    kind==='nextAction'?/^\s*(?:[-*]\s*)?(?:\*\*)?次の一手(?:[（(][^）)]*[）)])?(?:\*\*)?\s*[:：]\s*(.*)$/u:
    /^\s*(?:[-*]\s*)?(?:\*\*)?次回確認日(?:\*\*)?\s*[:：]\s*(.*)$/u;
   const m=line.match(re);
   if(m)value=m[1].replace(/\*\*\s*$/u,'').trim();
  }
  return value;
 }
 function legacy(description){
  const values=empty();
  for(const key of Object.keys(LIMITS))values[key]=field(description,key);
  return values;
 }
 function equal(a,b){
  const one=normalize(a),two=normalize(b);
  return !!one&&!!two&&Object.keys(LIMITS).every(k=>one[k]===two[k]);
 }
 async function save(t,expected,input){
  const proposed=normalize(input);
  if(!proposed)return {status:'invalid'};
  try{
   const live=await t.get('card','shared',KEY,null);
   const original=expected===null?null:normalize(expected);
   if((expected!==null&&!original)||(live===null)!==(expected===null)||
      (live!==null&&!equal(live,original))){
    return {status:'conflict',value:live};
   }
   if(live!==null&&equal(live,proposed))return {status:'unchanged',value:live};
   // PluginData writes are not atomic. Re-check and never silently retry.
   await t.set('card','shared',KEY,proposed);
   const after=await t.get('card','shared',KEY,null);
   return equal(after,proposed)?{status:'saved',value:after}:
    {status:'unverified',value:after};
  }catch(e){
   return {status:'unverified'};
  }
 }
 root.KoyoriTaskFieldsCore=Object.freeze({KEY,LIMITS,empty,validDate,normalize,legacy,equal,save});
})(window);

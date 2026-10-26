(function(root){
 'use strict';
 // Consent may grant read+write at Trello OAuth2 level. This component only GETs.
 const SCOPES=Object.freeze(['read:board:trello','write:board:trello']);
 const CARD=/^[a-f0-9]{24}$/i;
 const TOKEN=/^[A-Za-z0-9._~+\/-]{8,8192}={0,4}$/;
 const BASE='https://api.trello.com';
 function safe(status){return {status,checklists:null};}
 function lists(payload){
  if(!Array.isArray(payload)||payload.length>100)return null;
  for(const list of payload){
   if(!list||typeof list.name!=='string'||!Array.isArray(list.checkItems)||list.checkItems.length>1000
    ||list.checkItems.some(x=>!x||typeof x.name!=='string'||!['complete','incomplete'].includes(String(x.state||'').toLowerCase())))return null;
  }
  return payload;
 }
 function endpoint(id){
  return CARD.test(String(id||''))?'/1/cards/'+id+'/checklists?checkItems=all&checkItem_fields=name,state,pos&fields=name,pos':null;
 }
 async function client(t){
  if(!t||typeof t.getOAuth2ApiClient!=='function')return null;
  try{return await t.getOAuth2ApiClient();}catch(_){return null;}
 }
 async function read(t,fetchImpl){
  if(!t||typeof t.card!=='function'||typeof fetchImpl!=='function')return safe('unavailable');
  let before;
  try{before=await t.card('id');}catch(_){return safe('unavailable');}
  const path=endpoint(before&&before.id);
  if(!path)return safe('invalid-card');
  const auth=await client(t);
  if(!auth||typeof auth.getAccessToken!=='function')return safe('not-authorized');
  let token;
  try{token=await auth.getAccessToken();}catch(_){return safe('not-authorized');}
  if(typeof token!=='string'||!TOKEN.test(token))return safe('not-authorized');
  let result;
  try{
   const response=await fetchImpl(BASE+path,{
    method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    cache:'no-store',credentials:'omit',redirect:'error'
   });
   if(response?.status===401||response?.status===403)result=safe('not-authorized');
   else if(!response||!response.ok)result=safe('unavailable');
   else {const rows=lists(await response.json());result=rows?{status:'ready',checklists:rows}:safe('invalid-response');}
  }catch(_){result=safe('unavailable');}
  try{const after=await t.card('id');if(after?.id!==before.id)return safe('card-changed');}
  catch(_){return safe('unavailable');}
  return result;
 }
 // Only from an actual visible DOM click in a persistent test iframe.
 async function authorizeFromClick(t){
  const auth=await client(t);
  if(!auth||typeof auth.authorize!=='function')return {status:'unavailable'};
  try{
   await auth.authorize({scopes:[...SCOPES],exchangeTrelloToken:false});
   return {status:'authorized'};
  }catch(_){return {status:'denied-or-unavailable'};}
 }
 // Only on an exact pre-registered OAuth2 callback page; SDK owns the code.
 async function completeCallback(t){
  const auth=await client(t);
  if(!auth||typeof auth.redirectUriCallback!=='function')return {status:'unavailable'};
  try{await auth.redirectUriCallback();return {status:'callback-complete'};}
  catch(_){return {status:'callback-failed'};}
 }
 root.KoyoriChecklistOAuth2Fallback=Object.freeze({SCOPES,endpoint,lists,read,authorizeFromClick,completeCallback});
})(typeof window!=='undefined'?window:globalThis);

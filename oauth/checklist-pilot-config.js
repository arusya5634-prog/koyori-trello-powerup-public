(function(root){
 'use strict';
 // PUBLIC IDs only; never include secrets/tokens or user content here.
 const clientId='SET_PUBLIC_CLIENT_ID';
 const redirectUri='https://example.invalid/oauth/checklist-oauth2-callback.html';
 const configured=/^[A-Za-z0-9_-]{12,80}$/.test(clientId)&&
   !clientId.startsWith('SET_')&&
   /^https:\/\//.test(redirectUri)&&!redirectUri.includes('.invalid/');
 root.KoyoriChecklistPilotConfig=Object.freeze({clientId,redirectUri,configured});
})(typeof window!=='undefined'?window:globalThis);

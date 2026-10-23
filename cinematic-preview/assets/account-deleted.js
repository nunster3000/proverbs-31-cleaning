(async()=>{
 try{await P31Live.init();await P31Live.client?.auth.signOut({scope:'local'});}catch{}
 async function check(){try{const r=await fetch('/api/app?route=account-closure-status',{cache:'no-store'});if(!r.ok)throw Error();const v=await r.json();document.getElementById('closure-title').textContent=v.state==='completed'?'Your account has been deleted.':'Your account is being removed.';document.getElementById('closure-result').textContent=v.state==='completed'?'Your account access and personal profile have been removed. No admin approval was needed.':'Your access is closed while private data removal finishes. This page will update automatically.';if(v.state==='purging')setTimeout(check,10000);}catch{document.getElementById('closure-result').textContent='This browser has no current deletion receipt. For help checking a request, contact Proverbs 31 Cleaning Co.';}}
 await check();
})();

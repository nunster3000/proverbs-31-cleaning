(()=>{
 const units=Object.fromEntries([...document.querySelectorAll('[data-unit]')].map(n=>[n.dataset.unit,n]));
 const status=document.querySelector('.launch-status');let anchor,deadline,lastSync=0,syncing=false,opening=false;
 function paint(seconds){const values={days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60};for(const[k,v]of Object.entries(values))units[k].textContent=String(v).padStart(2,'0');}
 async function sync(){if(syncing||opening)return;syncing=true;const start=performance.now();try{const r=await fetch('/api/app?route=launch-status',{cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();anchor=performance.now();deadline=anchor+Math.max(0,Date.parse(s.opensAt)-Date.parse(s.serverNow)-(anchor-start)/2);lastSync=anchor;if(!s.pending){opening=true;paint(0);status.textContent='Your welcome is ready. Opening the website…';location.replace('/');return;}status.textContent='We’ll welcome you automatically when the countdown ends.';}catch{status.textContent='Reconnecting to the opening clock…';}finally{syncing=false;}}
 function tick(){if(anchor!==undefined){const remaining=Math.max(0,Math.ceil((deadline-performance.now())/1000));paint(remaining);if(remaining===0){status.textContent='Checking our opening time…';if(performance.now()-lastSync>2000)sync();}}if(performance.now()-lastSync>30000)sync();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});window.addEventListener('online',sync);sync();setInterval(tick,250);
})();

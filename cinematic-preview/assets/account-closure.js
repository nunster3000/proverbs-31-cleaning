window.P31AccountClosure={render({api,email,signIn}){
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;},root=node('section'),status=node('p');root.className='review-card account-closure';status.setAttribute('role','status');
 const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.className='outline';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;};
 async function load(){
  root.replaceChildren(node('h2','Your account, your choice'),node('p','You can delete your account without waiting for admin approval. Bookings, balances, refunds and disputes must be resolved first.'),status);status.textContent='';
  let data;try{data=await api('account-closure');}catch(e){
   const receipt=await fetch('/api/app?route=account-closure-status',{cache:'no-store'});const value=receipt.ok?await receipt.json():null;
   if(value&&['purging','completed'].includes(value.state)){location.replace('account-deleted.html');return;}throw e;
  }
  root.append(node('p','Your login, profile, entry notes and cleaning uploads will be removed. Necessary service records, invoices, payment history and original signed agreements stay on file. Payment processors retain transaction records; this website does not store your card details. Encrypted backups are handled separately under the business retention process.'));
  if(data.request){
   root.append(node('h3','Deletion scheduled'),node('p',data.request.mode==='keep'?'Your account stays available for this visit. It will be deleted automatically after all visits and payments are resolved.':'Your future visits have been cancelled. Your account will be deleted after refunds and other payment issues are resolved.'),node('p','Please do not create another booking while deletion is scheduled.'));
   for(const h of data.holds)root.append(node('p',h));
   if(data.request.maintenance_notice)root.append(node('p',data.request.maintenance_notice));
   if(data.request.state==='waiting'&&data.request.mode==='keep')root.append(button('Keep my account instead',async()=>{await api('account-closure',{method:'POST',data:{action:'withdraw'}});await load();}));
   root.append(button('Check deletion status',load));
   const poll=setInterval(async()=>{if(!root.isConnected){clearInterval(poll);return;}try{const r=await fetch('/api/app?route=account-closure-status',{cache:'no-store'});if(r.ok&&['purging','completed'].includes((await r.json()).state)){clearInterval(poll);location.replace('account-deleted.html');}}catch{}},10000);return;
  }
  const upcoming=data.upcoming||[];
  for(const b of upcoming){const card=node('article');card.className='info-strip';card.append(node('h3',b.service+' · '+b.date),node('p','Appointment time: '+b.arrival+' · Eastern'),node('p','Paid: '+money(b.paid_cents)+' · Refund if cancelled now: '+money(b.refund_cents)+' · Deposit retained: '+money(b.retain_cents)));if(!b.can_cancel)card.append(node('p','This visit has started or its scheduled start has passed. Contact Gabrielle to resolve it before cancelling.'));root.append(card);}
  const choice=node('fieldset'),legend=node('legend',upcoming.length?'What would you like to do with your upcoming visits?':'Delete your account');choice.append(legend);
  const options=upcoming.length?[['keep','Keep my visits; delete after completion and payment resolution'],['cancel','Cancel my upcoming visits and delete after payment resolution']]:(data.holds.length?[['keep','Schedule deletion after all payment issues are resolved']]:[['cancel','Delete once all payment checks are complete']]);let mode=options[0][0];
  for(const [value,label] of options){const l=node('label'),r=node('input');r.type='radio';r.name='account-closure-mode';r.value=value;r.checked=value===mode;r.onchange=()=>mode=value;l.append(r,document.createTextNode(' '+label));choice.append(l);}root.append(choice);
  if(upcoming.length)root.append(node('p','Cancellation policy: at least 72 hours before the scheduled start, all payments are refunded. With less than 72 hours’ notice, the agreed deposit is retained and payments above the deposit are refunded. Refunds must complete before deletion. External payments may need Gabrielle to record the completed refund.'));
  for(const h of data.holds)root.append(node('p',h));
  const confirmed=node('input');confirmed.type='checkbox';const ack=node('label');ack.append(confirmed,document.createTextNode(' I understand what will be removed and retained, and the cancellation/refund summary above.'));root.append(ack);
  const typed=node('input');typed.type='text';typed.autocomplete='off';typed.placeholder='Type DELETE';typed.setAttribute('aria-label','Type DELETE to confirm');root.append(typed);
  root.append(button('Verify my email before deletion',async()=>{status.textContent='Open the new email sign-in link, then return to My Profile to confirm within 10 minutes.';await signIn(email);}));
  root.append(button('Confirm account deletion',async()=>{
   if(!confirmed.checked||typed.value!=='DELETE')throw Error('Acknowledge the summary and type DELETE to continue.');
   const result=await api('account-closure',{method:'POST',data:{action:'request',data:{mode,confirmation:typed.value,fingerprint:data.fingerprint}}});
   await load();status.textContent=result.request?.mode==='cancel'?'Deletion requested. Payment and privacy checks are running. No admin approval is required.':'Deletion scheduled. You can continue using your account for the remaining visit.';
  }));
 }
 load().catch(e=>status.textContent=e.message);return root;
}};

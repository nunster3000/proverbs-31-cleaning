window.P31Classes=(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
 const state=b=>b.status==='requested'?'Awaiting $30 deposit':({confirmed:'Class reserved',in_progress:'Class in progress',completed:'Class completed',cancelled:'Cancelled'})[b.status]||b.status;
 function card(b,open){const c=el('section',undefined,'panel booking-card');c.append(el('h3','Cleaning Skills & Business Foundations'),el('p',b.property.name+' · '+b.quote_snapshot.students+' student(s) · '+b.quote_snapshot.tier),el('p',b.visit_date+' · '+P31Windows.label(b.arrival)+' ET'),el('p',state(b),'badge'),el('p','Group tuition: '+money(b.final_cents)+' · Deposit: '+money(b.deposit_paid_cents)+' / $30'));const button=el('button','Open class booking','outline');button.onclick=open;c.append(button);return c;}
 function detail(b,root,{owner,api,act,action,refresh}){
  const q=b.quote_snapshot,paid=b.deposit_paid_cents+b.final_paid_cents,balance=Math.max(0,b.final_cents-paid);
  const section=title=>{const s=el('section',undefined,'panel');s.append(el('h3',title));root.append(s);return s;};
  const button=(parent,text,fn,disabled=false)=>{const n=el('button',text,'outline');n.type='button';n.disabled=disabled;n.onclick=async()=>{n.disabled=true;try{await fn();}finally{if(n.isConnected)n.disabled=disabled;}};parent.append(n);return n;};
  const input=(parent,title,type='text',value='')=>{const label=el('label',title),n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value;label.append(n);parent.append(label);return n;};
  const select=(parent,title,items)=>{const label=el('label',title),n=el('select');items.forEach(([value,text])=>n.add(new Option(text,value)));label.append(n);parent.append(label);return n;};
  const info=section('Your private class');info.append(el('p','Cleaning Skills & Business Foundations'),el('p',state(b),'badge'),el('p',b.visit_date+' · '+P31Windows.label(b.arrival)+' Eastern Time'),el('p','Two-hour program, starting at the beginning of the reserved time block.'),el('p',q.students+' student(s) × '+money(q.unit_cents)+' · '+q.tier),el('p','Group tuition: '+money(b.final_cents)),el('p','Deposit paid: '+money(b.deposit_paid_cents)+' of $30'),el('p','Remaining tuition: '+money(balance)),el('p',(b.property.class_location_preference?'Location / delivery preference (awaiting confirmation): ':'Confirmed location / joining instructions: ')+b.property.address),el('p',b.property.name+' · '+b.property.email+' · '+b.property.phone));if(b.care_notes)info.append(el('p','Learning goals: '+b.care_notes));info.append(P31Cal.controls([b],'America/New_York',true));
  const payment=section('Class payments');const overdue=Date.now()>=Date.parse(b.class_payment_due_at);payment.append(el('p','Full tuition due: '+new Date(b.class_payment_due_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' Eastern Time (48 hours before class).')); payment.append(el('p',b.invoice_issued?'Your admin has issued the remaining tuition balance.':'The $30 deposit is credited toward tuition. You may pay the full balance at any time, or use the final payment request issued by Gabrielle.'));
  for(const p of b.payment_records||[])payment.append(el('p',money(p.cents)+' · '+p.kind+' · '+p.method));
  if(!owner&&b.status!=='cancelled'&&balance>0){
   const choices=[];
   if(b.deposit_paid_cents<3000&&!overdue)choices.push(['deposit','Pay $30 class deposit · '+money(3000-b.deposit_paid_cents)]);
   choices.push(['full',b.deposit_paid_cents<3000?'Pay full tuition · '+money(balance):'Pay remaining tuition · '+money(balance)]);
   if(P31Live.config.paymentsEnabled){for(const [kind,text] of choices){
    const pay=button(payment,text,async()=>{try{await P31Payments.start({booking:b,loadPolicies:()=>api('public-policies'),loadBooking:()=>api('booking',{query:{id:b.id}}),request:policy=>api('checkout',{method:'POST',data:{id:b.id,kind,policy}})});await refresh();}catch(e){payment.append(el('p',e.message,'fine'));}});
    const params=new URLSearchParams(location.search);
    if(params.get('booking')===b.id&&params.get('class_payment')===kind){params.delete('class_payment');history.replaceState(null,'',location.pathname+'?'+params);setTimeout(()=>pay.click(),0);}
   }}else payment.append(el('p','Online payment is not currently available. Contact Gabrielle to arrange your payment.'));
  }
  const changes=section('Scheduling & requests');changes.append(el('p','A change request stays pending until Gabrielle reviews it. Recorded payments remain unchanged; refunds are reviewed separately.','fine'));
  for(const r of b.booking_requests||[])changes.append(el('p',r.kind+' · '+(r.resolved?r.decision:'Awaiting review')+' · '+r.notes+(r.review_notes?' · '+r.review_notes:'')));
  if(!owner&&!['cancelled','completed'].includes(b.status)){
   const kind=select(changes,'Request',[['reschedule','Reschedule'],['cancel','Cancel']]),notes=input(changes,'Preferred date / reason','textarea');notes.maxLength=1000;
   button(changes,'Send request',()=>{if(!notes.value.trim()){notes.focus();return;}return act(()=>action('request_change',{kind:kind.value,notes:notes.value}),'Class change requested.');});
  }
  if(owner){
   const manage=section('Manage class');
   button(manage,'Issue final tuition balance · '+money(balance),()=>act(()=>action('issue_invoice',{}),'Final class balance issued.'),b.invoice_issued||b.deposit_paid_cents<3000||!['confirmed','in_progress','completed'].includes(b.status));
   if(b.status==='confirmed'||b.status==='in_progress')button(manage,b.status==='confirmed'?'Start class':'Mark class completed',()=>act(()=>action('status',{status:b.status==='confirmed'?'in_progress':'completed'}),'Class progress saved.'));
   const location=input(manage,'Class location / joining instructions','text',b.property.address);location.maxLength=600;
   button(manage,'Confirm location / instructions',()=>act(()=>action('class_location',{location:location.value}),'Class location confirmed.'),['cancelled','completed'].includes(b.status));
   const reason=input(manage,'Cancellation reason');reason.maxLength=1000;
   button(manage,'Cancel class',()=>act(()=>action('status',{status:'cancelled',reason:reason.value}),'Class cancelled.'),b.invoice_issued||['cancelled','completed'].includes(b.status));
   const date=input(changes,'New date','date',b.visit_date),slot=select(changes,'Available time block',[['','Choose a new date']]),why=input(changes,'Schedule / request review notes');why.maxLength=1000;let generation=0;
   date.onchange=async()=>{const g=++generation;slot.disabled=true;try{const rows=await api('class-availability',{query:{start:date.value,days:1}});if(g!==generation)return;slot.replaceChildren(new Option('Choose a time block',''));for(const s of rows[0]?.slots||[])if(s.available)slot.add(new Option(P31Windows.label(s.id),s.id));if(date.value===b.visit_date)slot.add(new Option(P31Windows.label(b.arrival)+' (current)',b.arrival));slot.disabled=false;}catch(e){changes.append(el('p',e.message));}};
   button(changes,'Reschedule class',()=>act(()=>action('reschedule',{date:date.value,arrival:slot.value,reason:why.value}),'Class rescheduled.'),b.invoice_issued||['cancelled','completed'].includes(b.status));
   for(const r of (b.booking_requests||[]).filter(x=>!x.resolved)){
    button(changes,'Approve '+r.kind+' request',()=>act(()=>action('review_request',{request_id:r.id,decision:'approved',notes:why.value,date:date.value,arrival:slot.value}),'Request approved.'));
    button(changes,'Decline '+r.kind+' request',()=>act(()=>action('review_request',{request_id:r.id,decision:'declined',notes:why.value}),'Request declined.'));
   }
   const manual=section('Record externally received payment'),kind=select(manual,'Payment type',[['deposit','Class deposit'],['final','Final tuition']]),amount=input(manual,'Amount received ($)','number'),method=input(manual,'Payment method / reference');amount.min='0.01';amount.step='0.01';method.maxLength=200;let paymentRequest=crypto.randomUUID();
   button(manual,'Record payment',async()=>{if(!amount.reportValidity()||!method.value.trim())return;const ok=await act(()=>action('record_payment',{kind:kind.value,cents:Math.round(Number(amount.value)*100),method:method.value},paymentRequest),'Class payment recorded.');if(ok)paymentRequest=crypto.randomUUID();},b.status==='cancelled');
  }
 }
 return {card,detail,state};
})();

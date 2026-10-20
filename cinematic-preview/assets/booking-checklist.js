/* Booking requirements are derived from backend records; no local completion flags. */
window.P31Checklist = (() => {
  function items(b) {
    const totals=P31Workflow.totals(b),cancelled=b.status==='cancelled';
    const deposit=Number(b.deposit_paid_cents || 0)>=Number(b.quote_snapshot.deposit_cents);
    const files=(b.walkthrough_files || []).filter(f=>f.purpose!=='completion' && f.status==='ready');
    const uploaded=files.length>0 || !!b.reviewed || !!b.walkthrough_approved;
    const editable=['requested','awaiting_walkthrough'].includes(b.status) && !b.invoice_issued;
    const approved=b.quote_status==='accepted' && b.final_cents!==null;
    const paid=b.final_cents!==null && totals.balance===0 && (b.invoice_issued || b.status==='completed');
    const rows=[
      {id:'deposit',title:'Booking deposit',done:deposit,state:'action',text:'Arrange your starting-price deposit with Gabrielle. It is complete when she records payment.',action:'Arrange deposit',target:'payments'},
      {id:'walkthrough',title:'Virtual walkthrough',done:uploaded,state:editable?'action':'waiting',text:editable?'Upload room photos or videos so Gabrielle can review your space.':'Contact Gabrielle if walkthrough information is still needed.',action:editable?'Upload walkthrough':'View walkthrough',target:'walkthrough'},
      {id:'review',title:'Gabrielle’s review',done:!!b.walkthrough_approved,state:'waiting',text:uploaded?'Gabrielle will review your walkthrough and confirm the visit.':'Waiting for your walkthrough before Gabrielle can confirm the visit.',action:'View review',target:'quote'},
      {id:'price',title:'Final price approval',done:approved,state:b.quote_status==='awaiting_approval'?'action':'waiting',text:b.quote_status==='awaiting_approval'?'Review the current service details and total, then approve your price.':'Your starting estimate is not a final quote. Gabrielle will prepare it after review.',action:b.quote_status==='awaiting_approval'?'Review & approve':'View estimate',target:'quote'},
      {id:'access',title:'Home-access authorization',done:!!b.access_signed_at,state:b.status==='confirmed'?'action':'waiting',text:b.status==='confirmed'?'Read and sign the permission form before Gabrielle heads to your home.':'Available after your booking is confirmed. The business permission form must be published before signing.',action:b.access_signed_at?'View signed form':'Review access form',target:'access'},
      {id:'visit',title:'Your cleaning visit',done:b.status==='completed',state:'waiting',text:({on_the_way:'Gabrielle is on the way.',in_progress:'Your cleaning is in progress.'})[b.status] || 'Follow your visit’s progress here. Gabrielle updates each stage.',action:'View visit progress',target:'progress'},
      {id:'payment',title:'Final payment',done:paid,state:b.invoice_issued && totals.balance>0?'action':'waiting',text:b.invoice_issued && totals.balance>0?'Your final balance is due. Contact Gabrielle to arrange payment.':'Waiting for the final balance to be issued. No online payment is collected here.',action:b.invoice_issued && totals.balance>0?'View balance & payment':'View payment details',target:'payments'}
    ];
    const completed={deposit:'Deposit recorded.',walkthrough:'Walkthrough received or recorded by Gabrielle.',review:'Walkthrough approved and booking confirmed.',price:'Your approval is recorded for the current reviewed price.',access:'Your home-access authorization is signed.',visit:'Cleaning completed.',payment:'No remaining balance is due on the reviewed total.'};
    return rows.map(row=>({...row,state:row.done?'complete':cancelled?'cancelled':row.state,text:row.done?completed[row.id]:cancelled?'Booking cancelled. No further action is requested.':row.text,action:cancelled?null:row.done?({deposit:'View deposit',walkthrough:'View walkthrough',review:'View review',price:'View approved price',access:'View signed form',visit:'View visit progress',payment:'View payments'})[row.id]:row.action}));
  }
  function render(b,open) {
    const rows=items(b),root=document.createElement('section');root.className='booking-checklist';root.dataset.bookingChecklist=b.id;
    const heading=document.createElement('h3');heading.textContent='Your booking checklist';root.append(heading);
    const count=document.createElement('p');count.className='fine';count.textContent=b.status==='cancelled'?'Booking cancelled · recorded payments are unchanged.':rows.filter(r=>r.done).length+' of '+rows.length+' completed · '+(rows.some(r=>r.state==='action')?'There are steps for you to review.':'You’re up to date. We’ll show your next step here.');root.append(count);
    const list=document.createElement('ol');
    for(const row of rows){const li=document.createElement('li');li.dataset.state=row.state;li.dataset.checklistStep=row.id;const icon=document.createElement('span');icon.className='checklist-mark';icon.setAttribute('aria-hidden','true');icon.textContent=row.done?'✓':row.state==='action'?'!':'○';const body=document.createElement('div'),title=document.createElement('strong'),state=document.createElement('span'),text=document.createElement('p');title.textContent=row.title;state.className='checklist-state';state.textContent={complete:'Completed',action:'Action needed',waiting:'Waiting',cancelled:'Not required'}[row.state];text.textContent=row.text;body.append(title,state,text);li.append(icon,body);if(row.action){const button=document.createElement('button');button.type='button';button.className='outline';button.textContent=row.action;button.onclick=()=>open(row.target);li.append(button);}list.append(li);}
    root.append(list);return root;
  }
  return {items,render};
})();

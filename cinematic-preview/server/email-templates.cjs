// Pure rendering shared by owner previews and the server-only delivery worker.
const {escape,paragraph,emailLayout,detailTable}=require('./email-layout.cjs');
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function arrivalLabel(value) {
 const text=({morning:'09:00-12:00',afternoon:'12:00-15:00'})[value] || value;
 if(!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(text || ''))return String(text || 'To be arranged');
 return text.split('-').map(time=>{const [h,m]=time.split(':').map(Number);return (h%12 || 12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM')}).join(' – ');
}
const kinds = ['booking_requested','booking_updated','quote_ready','service_completed','final_balance_ready','booking_confirmed','booking_rescheduled','booking_cancelled','change_request_declined'];
function renderEmail(kind, booking, {accountEnabled=false,guestUrl,eventDetails={}}={}) {
  if(!kinds.includes(kind))throw Error('Unsupported notification');
  const q=booking.quote_snapshot;
  const paid=booking.deposit_paid_cents+booking.final_paid_cents;
  const total=booking.final_cents ?? q.total_cents;
  const [subject,intro]=({
    booking_confirmed:['Your cleaning visit is confirmed','Gabrielle has reviewed your walkthrough and confirmed your cleaning visit. Review the details and complete any remaining steps before your visit.'],
    booking_rescheduled:['Your cleaning visit has been rescheduled','Gabrielle has approved the updated schedule below. Please review your visit and sign a new home-access agreement for the updated date and time.'],
    booking_cancelled:['Your cleaning cancellation is confirmed','Gabrielle has approved your cancellation. The cleaning visit listed below has been cancelled. Contact Gabrielle with any questions about recorded payments.'],
    change_request_declined:['Your booking change request was reviewed','Gabrielle has reviewed your '+(eventDetails.request_kind==='cancel'?'cancellation':'rescheduling')+' request and could not approve it. Your existing booking remains unchanged. Contact Gabrielle to discuss the next step.'],
    booking_requested:['Your cleaning request was received','We received your cleaning request. Your starting estimate is subject to walkthrough review and final pricing approval. This request does not confirm payment.'],
    booking_updated:['Your cleaning booking was updated','Gabrielle updated your booking. Review the current visit details below.'],
    quote_ready:['Your cleaning quote is ready to review','Your walkthrough has been reviewed. Please review the total and any adjustments before approving your quote.'],
    service_completed:['Your cleaning visit is complete','Gabrielle has marked your cleaning visit complete. Any remaining balance is shown separately when issued.'],
    final_balance_ready:['Your cleaning balance is ready','Your final balance has been issued. Contact Gabrielle to arrange payment; online payment processing is not available yet.'],
  })[kind];
  const lines=[intro,'Booking reference: '+booking.id,'Service: '+q.service+' · '+q.space,'Visit: '+booking.visit_date+' · '+arrivalLabel(booking.arrival)+' Eastern Time','Starting estimate*: '+money(q.total_cents)];
  if(booking.final_cents!=null)lines.push('Reviewed total: '+money(total));
  if(kind==='quote_ready')for(const item of booking.quote_adjustments || [])lines.push('Adjustment: '+item.label+' · '+money(item.cents));
  lines.push('Payments recorded: '+money(paid));
  if(kind==='final_balance_ready')lines.push('Remaining balance: '+money(Math.max(0,total-paid)));
  if(guestUrl && !/^https:\/\/www\.proverbs31cleaningcoservices\.info\/guest\.html#access=[A-Za-z0-9_-]{43}$/.test(guestUrl))throw Error('Invalid guest destination');
  const url=kind==='booking_cancelled'?'https://www.proverbs31cleaningcoservices.info/contact.html':guestUrl || 'https://www.proverbs31cleaningcoservices.info/'+(accountEnabled?'workspace.html':'contact.html');
  const cta=kind==='booking_cancelled'?'Contact Gabrielle':guestUrl?'Open your private booking':accountEnabled?'Open your account':'Contact Gabrielle';
  if(guestUrl&&kind!=='booking_cancelled')lines.push('This private link is for your booking only. It expires in 30 minutes and can be used once. Please do not forward it.');
  lines.push(accountEnabled?'Sign in to your account to view current details.':'Contact Gabrielle with your booking reference for questions or changes.');
  const rows=[['Service',q.service+' · '+q.space],['Scheduled visit',booking.visit_date+' · '+arrivalLabel(booking.arrival)+' Eastern Time'],['Starting estimate*',money(q.total_cents)]];
  if(booking.final_cents!=null)rows.push(['Reviewed total',money(total)]);
  if(kind==='quote_ready')for(const item of booking.quote_adjustments || [])rows.push(['Adjustment · '+item.label,money(item.cents)]);
  rows.push(['Payments recorded',money(paid)]);
  if(kind==='final_balance_ready')rows.push(['Remaining balance',money(Math.max(0,total-paid))]);
  if(kind==='booking_rescheduled'&&eventDetails.previous_visit){const old=eventDetails.previous_visit;rows.splice(1,0,['Previous visit',old.date+' · '+arrivalLabel(old.arrival)+' Eastern Time']);lines.push('Previous visit: '+old.date+' · '+arrivalLabel(old.arrival)+' Eastern Time');}
  if(['booking_rescheduled','booking_cancelled','change_request_declined'].includes(kind)){const policy='No automatic fees, payment changes, or refunds are applied by this notice. Any payment arrangements are reviewed directly with Gabrielle.';lines.push(policy);rows.push(['Payment arrangements',policy]);}
  rows.push(['Booking reference',booking.id]);
  const note=kind==='booking_cancelled'?'Please include your booking reference when contacting Gabrielle.':guestUrl?'This private link is for your booking only. It expires in 30 minutes and can be used once. Please do not forward it.':accountEnabled?'Sign in securely to see the latest details and any actions needed for your visit.':'Please include your booking reference when contacting Gabrielle.';
  const headings={booking_confirmed:'Your visit is confirmed.',booking_rescheduled:'Your visit has a new date.',booking_cancelled:'Your cancellation is confirmed.',change_request_declined:'Your booking request, reviewed.',booking_requested:'A little care is on its way.',booking_updated:'Your visit, up to date.',quote_ready:'Your quote is ready.',service_completed:'Your home, cared for.',final_balance_ready:'Your final balance is ready.'};
  return {subject,text:lines.join('\n\n')+'\n\n'+cta+': '+url,
    html:emailLayout({preheader:subject,eyebrow:kind==='quote_ready'?'Review your quote':kind==='final_balance_ready'?'Your payment summary':'Your cleaning visit',title:headings[kind],content:paragraph(intro)+detailTable(rows)+paragraph('* Starting prices are estimates. Final pricing is subject to walkthrough review and your approval.'),cta,url,note})};
}
module.exports={renderEmail,kinds};

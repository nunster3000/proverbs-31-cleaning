// Pure rendering shared by owner previews and the server-only delivery worker.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function arrivalLabel(value) {
 const text=({morning:'09:00-12:00',afternoon:'12:00-15:00'})[value] || value;
 if(!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(text || ''))return String(text || 'To be arranged');
 return text.split('-').map(time=>{const [h,m]=time.split(':').map(Number);return (h%12 || 12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM')}).join(' – ');
}
const kinds = ['booking_requested','booking_updated','quote_ready','service_completed','final_balance_ready'];
function renderEmail(kind, booking, {accountEnabled=false,guestUrl}={}) {
  if(!kinds.includes(kind))throw Error('Unsupported notification');
  const q=booking.quote_snapshot;
  const paid=booking.deposit_paid_cents+booking.final_paid_cents;
  const total=booking.final_cents ?? q.total_cents;
  const [subject,intro]=({
    booking_requested:['Your cleaning request was received','We received your cleaning request. Your starting estimate is subject to walkthrough review and final pricing approval. This request does not confirm payment.'],
    booking_updated:['Your cleaning booking was updated','The company updated your booking. Review the current visit details below.'],
    quote_ready:['Your cleaning quote is ready to review','Your walkthrough has been reviewed. Please review the total and any adjustments before approving your quote.'],
    service_completed:['Your cleaning visit is complete','The company has marked your cleaning visit complete. Any remaining balance is shown separately when issued.'],
    final_balance_ready:['Your cleaning balance is ready','Your final balance has been issued. Contact the company to arrange payment; online payment processing is not available yet.'],
  })[kind];
  const lines=[intro,'Booking reference: '+booking.id,'Service: '+q.service+' · '+q.space,'Visit: '+booking.visit_date+' · '+arrivalLabel(booking.arrival)+' Eastern Time','Starting estimate*: '+money(q.total_cents)];
  if(booking.final_cents!==null)lines.push('Reviewed total: '+money(total));
  if(kind==='quote_ready')for(const item of booking.quote_adjustments || [])lines.push('Adjustment: '+item.label+' · '+money(item.cents));
  lines.push('Payments recorded: '+money(paid));
  if(kind==='final_balance_ready')lines.push('Remaining balance: '+money(Math.max(0,total-paid)));
  if(guestUrl && !/^https:\/\/www\.proverbs31cleaningcoservices\.info\/guest\.html#access=[A-Za-z0-9_-]{43}$/.test(guestUrl))throw Error('Invalid guest destination');
  const url=guestUrl || 'https://www.proverbs31cleaningcoservices.info/'+(accountEnabled?'workspace.html':'contact.html');
  const cta=guestUrl?'Open your private booking':accountEnabled?'Open your account':'Contact the company';
  if(guestUrl)lines.push('This private link is for your booking only. It expires in 30 minutes and can be used once. Please do not forward it.');
  lines.push(accountEnabled?'Sign in to your account to view current details.':'Contact the company with your booking reference for questions or changes.');
  return {subject,text:lines.join('\n\n')+'\n\n'+cta+': '+url,
    html:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f8f4eb;color:#392a1d;font:16px/1.7 Georgia,serif"><main style="max-width:600px;margin:auto;padding:32px 20px"><p style="color:#97703a;letter-spacing:2px;font:12px Arial">PROVERBS 31 CLEANING COMPANY</p><h1 style="font-size:28px;font-weight:400">'+escape(subject)+'</h1>'+lines.map(line=>'<p>'+escape(line)+'</p>').join('')+'<p><a style="display:inline-block;background:#392a1d;color:#fff;padding:12px 20px;text-decoration:none" href="'+url+'">'+cta+'</a></p></main></body></html>'};
}
module.exports={renderEmail,kinds};

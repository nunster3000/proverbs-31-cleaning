window.P31Payments={async start({booking,loadPolicies,request}){
 let policy={};
 if(!booking.payment_policy_accepted_at){
  const current=await loadPolicies();
  if(!current?.revision)throw Error('Online payment is awaiting business policy approval. Contact Gabrielle for assistance.');
  const accepted=await new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='live-auth';dialog.style.cssText='max-width:min(560px,92vw);max-height:85dvh;overflow:auto;padding:24px;border:1px solid #b99153;border-radius:16px;background:#fffaf1;color:#342719';
   const title=document.createElement('h2');title.textContent='Before your payment';dialog.append(title);
   for(const [key,label]of [['payment_due','Scheduling & payment'],['deposit_handling','Deposits & refunds'],['cancellation_notice','Cancellation & rescheduling'],['emergency_appointments','Same-day emergencies']]){if(!current.content[key])continue;const h=document.createElement('h3'),p=document.createElement('p');h.textContent=label;p.textContent=current.content[key];p.style.cssText='white-space:pre-wrap;line-height:1.6';dialog.append(h,p);}
   const consent=document.createElement('input');consent.type='checkbox';const label=document.createElement('label');label.append(consent,document.createTextNode(' I have read and acknowledge these booking, deposit, cancellation and emergency appointment policies.'));label.style.cssText='display:block;line-height:1.6;padding:12px 0';
   const go=document.createElement('button');go.className='primary';go.textContent='Continue to secure payment';go.disabled=true;consent.onchange=()=>go.disabled=!consent.checked;go.onclick=()=>dialog.close('accepted');
   const back=document.createElement('button');back.className='outline';back.textContent='Back';back.onclick=()=>dialog.close();dialog.append(label,go,back);dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='accepted');dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();
  });
  if(!accepted)return false;
  policy={accepted:true,revision:current.revision};
 }
 const result=await request(policy);const destination=new URL(result.url);
 if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw Error('Payment page unavailable.');
 location.assign(destination.href);return true;
}};

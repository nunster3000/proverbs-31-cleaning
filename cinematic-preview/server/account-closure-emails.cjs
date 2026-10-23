const {emailLayout,paragraph,detailTable}=require('./email-layout.cjs');
const {effectiveEnv}=require('./launch-clock.cjs');
const issues={
 billing_resolution:{title:'Final billing needs to be resolved',text:'The final cleaning price or invoice must be finalized, and any outstanding balance must be settled before your account can be deleted.',action:'Review Payments in your account, or contact Gabrielle if the final bill is not ready.'},
 payment_review:{title:'A payment needs verification',text:'A recorded payment or refund needs to be checked before account deletion can continue.',action:'Gabrielle or technical support will review the payment records. Contact Gabrielle if you have a receipt to help resolve this.'},
 payment_processing:{title:'A payment is still processing',text:'An active or processing payment needs to finish before account deletion can continue.',action:'Please allow the payment to finish. Do not submit a duplicate payment.'},
 refund_pending:{title:'A refund is awaiting completion',text:'A required refund has not yet been confirmed as completed. Your deletion request is waiting for that payment resolution.',action:'We will retry the checks automatically. Gabrielle will review any refund needing attention.'},
 external_refund:{title:'An external refund needs to be recorded',text:'A refund for a payment made outside the website needs to be completed and recorded by Gabrielle.',action:'You do not need to approve account deletion again. Contact Gabrielle with questions about the refund.'},
 technical_retry:{title:'Private data removal needs another attempt',text:'A technical step could not finish. Account deletion is not yet complete, and the system will retry safely.',action:'No new deletion request is needed. Gabrielle has a dashboard notification, and technical support can investigate.'},
 business_records:{title:'Business records need to be reassigned',text:'Records used by the business must be safely reassigned before this account can be removed.',action:'Gabrielle and technical support need to resolve this. No deletion approval is required from you.'}
};
function renderClosureIssueEmail(notice){
 const codes=notice.codes||[],resolved=codes.length===0;
 if([...codes,...(notice.previous_codes||[])].some(c=>!issues[c]))throw Error('Unsupported deletion issue');
 const title=resolved?'Your deletion request can continue.':'An update on your account deletion.';
 const intro=resolved?'The issues listed in your previous update have been resolved. Your request is continuing automatically; this email is not confirmation that the account has already been deleted.':'Your account deletion is not complete yet. The following items are holding it up. This update does not add a fee or require admin approval of deletion.';
 const rows=(resolved?notice.previous_codes:codes).map(c=>[issues[c].title,resolved?'Resolved':issues[c].text+' '+issues[c].action]);
 const billing=!resolved&&codes.some(c=>['billing_resolution','payment_processing'].includes(c));
 const url='https://www.proverbs31cleaningcoservices.info/'+(billing?'workspace.html':'contact.html');
 const cta=billing?'Review your account':'Contact Gabrielle';
 const subject=resolved?'Account deletion update · Previous issues resolved':'Account deletion update · Action or processing needed';
 const note='We will keep you informed when the issue changes. Automatic retries do not require another deletion request. Reference: '+notice.closure_id;
 return {subject,text:[title,intro,...rows.map(([a,b])=>a+': '+b),note,cta+': '+url].join('\n\n'),html:emailLayout({preheader:subject,eyebrow:'Your account & privacy',title,content:paragraph(intro)+detailTable(rows),cta,url,note})};
}
async function deliverClosureIssueEmails({db,env,send=fetch,clock=Date.now}){
 const effective=effectiveEnv(env,clock());
 if(effective.AUTH_ENABLED!=='true'||effective.NOTIFICATIONS_ENABLED!=='true')return {enabled:false,sent:0,failed:0};
 if(!env.RESEND_API_KEY)throw Error('Deletion email delivery is not configured');
 const jobs=await db.rpc('service_closure_mail',{p_action:'claim'});if(jobs.error)throw Error('Deletion email queue unavailable');
 let sent=0,failed=0;
 for(const job of jobs.data||[]){let provider=null;
  try{const message=renderClosureIssueEmail(job);const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-closure-issue-'+job.id+'-'+job.email_generation},body:JSON.stringify({from:'Proverbs 31 Cleaning Company <gabriellejackson@proverbs31cleaningcoservices.info>',reply_to:'gabriellejackson@proverbs31cleaningcoservices.info',to:[job.recipient],...message}),signal:AbortSignal.timeout(15000)});if(r.ok)provider=(await r.json()).id||null;}catch{}
  const saved=await db.rpc('service_closure_mail',{p_action:'finish',p_id:job.id,p_data:{lease:job.lease_id,generation:job.email_generation,provider}});if(saved.error)throw Error('Deletion email receipt unavailable');if(provider&&saved.data?.saved)sent++;else failed++;
 }
 return {enabled:true,sent,failed};
}
module.exports={issues,renderClosureIssueEmail,deliverClosureIssueEmails};

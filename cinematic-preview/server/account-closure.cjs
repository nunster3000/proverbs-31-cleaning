const {createClient}=require('@supabase/supabase-js');
const Stripe=require('stripe');
const {timingSafeEqual,randomBytes,createHash}=require('node:crypto');
const digest=v=>createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e;};
function recentAuthentication(token,now=Date.now()){
 try{const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());return Array.isArray(claims.amr)&&claims.amr.some(a=>a.method!=='anonymous'&&Number.isFinite(a.timestamp)&&a.timestamp*1000<=now+30000&&now-a.timestamp*1000<=10*60000);}catch{return false;}
}
// Must be called only after getUser() has verified the JWT. Never trust a body user ID.
async function handleClosure({route,req,body,user,owner,token,db,env,reply,clock=Date.now}){
 if(!['account-closure','account-closure-notices','account-refunds'].includes(route))return false;
 if(user.is_anonymous)fail(403,'Sign into your customer account first.');
 let name,args;
 if(route==='account-closure'){
  if(owner)fail(403,'The business owner account cannot be deleted here.');
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
  const action=req.method==='GET'?'preview':body.action;
  if(!['preview','request','withdraw'].includes(action))fail(400,'Choose an account action.');
  if(action==='request'&&!recentAuthentication(token,clock()))fail(409,'For your security, use a fresh email sign-in link, then return here within 10 minutes to confirm deletion.');
  name='api_account_closure';args={p_action:action,p_data:{...(body.data||{})}};
  if(action==='request'){const receipt=randomBytes(32).toString('base64url');args.p_data.receipt_hash=digest(receipt);req.closureReceipt=receipt;}
 }else{
  if(!owner)fail(403,'Owner access required');
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
  name=route==='account-refunds'?'api_account_refunds':'api_account_closure_notices';
  args=route==='account-refunds'?{p_id:body.id||null,p_reference:body.reference||null}:{p_read:body.id||null};
 }
 const r=await db.rpc(name,args);if(r.error)throw r.error;
 if(req.closureReceipt)reply.cookie='p31_closure='+req.closureReceipt+'; HttpOnly; SameSite=Strict; Path=/api/app; Max-Age=7776000'+(env.NODE_ENV==='production'||env.VERCEL==='1'?'; Secure':'');
 reply(req.method==='POST'?202:200,r.data);return true;
}
async function processClosure({db,env,id,stripeFactory=key=>new Stripe(key,{maxNetworkRetries:2,timeout:15000})}){
 let lease;
 const rpc=async(action,data={})=>{const r=await db.rpc('service_account_closure',{p_action:action,p_id:id,p_data:{...data,...(lease?{lease_token:lease}:{})}});if(r.error)throw r.error;return r.data;};
 const job=await rpc('claim');if(!job)return {skipped:true};lease=job.lease_token;
 try{
  if(job.state==='completed'){const files=await rpc('sweep');for(const f of files){const r=await db.storage.from(f.bucket).remove([f.path]);if(r.error)throw Error('storage_removal');}return {swept:true};}

  if(job.preview.upcoming.length&&job.mode==='keep')return {waiting:true};
  // Processor reconciliation precedes any deletion. This app does not save reusable cards.
  // Unexpected reusable profiles or subscriptions require technical reconciliation, never deletion by email.
  let stripe;
  const payments=job.payments||[],refunds=job.refunds||[];
  for(const attempt of job.checkouts||[]){
   if(Date.parse(attempt.expires_at)>Date.now())return {waiting:true};
   if(!env.STRIPE_SECRET_KEY||!attempt.session_id)throw Error('checkout_reconciliation');
   stripe ||= stripeFactory(env.STRIPE_SECRET_KEY);
   let session=await stripe.checkout.sessions.retrieve(attempt.session_id);
   if(session.metadata?.p31_attempt!==attempt.id||session.metadata?.p31_booking!==attempt.booking_id)throw Error('checkout_reconciliation');
   if(session.status==='open')session=await stripe.checkout.sessions.expire(attempt.session_id);
   if(session.status!=='expired'||session.payment_status!=='unpaid'||session.payment_intent)throw Error('payment_processing');
   await rpc('checkout_expired',{attempt:attempt.id});
  }

  for(const payment of payments){
   if(payment.provider!=='stripe')continue;
   if(!/^pi_[A-Za-z0-9]+$/.test(payment.provider_reference||'')||!env.STRIPE_SECRET_KEY)throw Error('processor_configuration');
   stripe ||= stripeFactory(env.STRIPE_SECRET_KEY);
   const pi=await stripe.paymentIntents.retrieve(payment.provider_reference,{expand:['latest_charge']});
   const charge=pi.latest_charge;
   if(pi.status!=='succeeded'||pi.metadata?.p31_booking!==payment.booking_id||!charge||typeof charge==='string'||charge.disputed||charge.amount!==payment.cents)throw Error('payment_reconciliation');
   // Checkout presently creates no Stripe Customer or stored payment method. Refuse to
   // erase an unexpected shared financial profile rather than touch another customer's card.
   if(pi.customer||charge.customer)throw Error('saved_payment_profile_review');
   const refund=refunds.find(r=>r.payment_id===payment.id);
   if(refund){
    // An idempotent refund can be resumed after a timeout without a second charge/refund.
    let result;
    if(refund.provider_reference)result=await stripe.refunds.retrieve(refund.provider_reference);
    else if(refund.state==='pending'){
     const prior=await stripe.refunds.list({payment_intent:pi.id,limit:100});
     if(prior.has_more||prior.data.some(r=>r.status!=='failed'&&r.status!=='canceled'&&r.metadata?.p31_refund!==refund.id))throw Error('refund_reconciliation');
     result=prior.data.find(r=>r.metadata?.p31_refund===refund.id);
     if(!result)result=await stripe.refunds.create({payment_intent:pi.id,amount:refund.cents,metadata:{p31_account_closure:id,p31_refund:refund.id}},{idempotencyKey:'p31-account-refund-'+refund.id});
    }
    if(result){
     if(result.amount!==refund.cents||result.payment_intent!==pi.id)throw Error('refund_reconciliation');
     await rpc('refund',{refund_id:refund.id,reference:result.id,succeeded:result.status==='succeeded'});
     if(result.status!=='succeeded')throw Error('refund_pending');
    }
    if(charge.amount_refunded>refund.cents)throw Error('refund_reconciliation');
   }else if(charge.amount_refunded)throw Error('refund_reconciliation');
  }
  if(job.preview.holds.some(h=>!h.startsWith('A refund is awaiting')))return {waiting:true};
  // Re-check refunds and all balances atomically in SQL before freezing customer access.
  await rpc('freeze');
  const files=await rpc('files');
  for(let offset=0;offset<files.length;offset+=100){
   const chunk=files.slice(offset,offset+100);
   for(const bucket of new Set(chunk.map(f=>f.bucket))){const r=await db.storage.from(bucket).remove(chunk.filter(f=>f.bucket===bucket).map(f=>f.path));if(r.error)throw Error('storage_removal');}
  }
  await rpc('scrub');
  // Auth hard-delete also removes refresh sessions. RLS's closure tombstone rejects old JWTs.
  const removed=await db.auth.admin.deleteUser(job.user_id,false);
  if(removed.error&&removed.error.status!==404&&removed.error.code!=='user_not_found')throw Error('auth_removal');
  await rpc('complete');return {completed:true};
 }catch(error){await rpc('release',{error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'maintenance_retry'});return {waiting:true};}
 finally{await rpc('release',{});}
}
function createAccountMaintenanceHandler({env=process.env,clientFactory=createClient,stripeFactory,send=fetch}={}){
 return async(req,res)=>{
  const reply=(s,b)=>{res.statusCode=s;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(b));};
  const supplied=String(req.headers.authorization||''),expected='Bearer '+env.CRON_SECRET;
  if(req.method!=='GET'||!env.CRON_SECRET||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return reply(401,{error:'Unauthorized'});
  if(env.ACCOUNT_DELETION_ENABLED!=='true')return reply(200,{enabled:false});
  try{
   const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const queue=await db.rpc('service_account_closure',{p_action:'queue'});if(queue.error)throw Error();
   let completed=0;for(const job of queue.data||[]){const r=await processClosure({db,env,id:job.id,stripeFactory});if(r.completed)completed++;}
   const notices=await db.rpc('service_account_closure',{p_action:'notices'});if(notices.error)throw Error();
   // Owner notification is a privacy receipt, independent of automatic customer emails.
   for(const notice of notices.data||[]){
    if(!env.RESEND_API_KEY)continue;
    const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-account-deleted-'+notice.id},body:JSON.stringify({from:'Proverbs 31 Cleaning Co. <gabriellejackson@proverbs31cleaningcoservices.info>',to:['gabriellejackson@proverbs31cleaningcoservices.info'],subject:'Customer account deleted · Proverbs 31',text:'A customer account was deleted automatically after its bookings and payments were resolved. Reference: '+notice.id+'. Required service, invoice and signed-agreement history remains available in Privacy & operations. The customer login, profile details and operational uploads were removed. No approval is needed.'}),signal:AbortSignal.timeout(15000)});
    if(!r.ok||!(await r.json()).id)throw Error();const saved=await db.rpc('service_account_closure',{p_action:'notified',p_id:notice.id});if(saved.error)throw Error();
   }
   return reply(200,{enabled:true,processed:queue.data.length,completed});
  }catch{return reply(503,{error:'Account maintenance needs another attempt'});}
 };
}
async function closureReceipt({req,env,clientFactory=createClient}){
 const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('p31_closure='))?.slice(12);
 if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))return null;
 const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const r=await db.rpc('service_account_closure',{p_action:'receipt',p_data:{hash:digest(token)}});if(r.error)throw r.error;return r.data;
}
module.exports={closureReceipt,recentAuthentication,handleClosure,processClosure,createAccountMaintenanceHandler};

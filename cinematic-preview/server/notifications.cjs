const {timingSafeEqual,createHmac,createHash}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {renderEmail}=require('./email-templates.cjs');
const {effectiveEnv}=require('./launch-clock.cjs');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&a.length>0&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function createNotificationHandler({env:suppliedEnv=process.env,clientFactory=createClient,send=fetch,clock=()=>Date.now()}={}){
 return async(req,res)=>{
  const env=effectiveEnv(suppliedEnv,clock());
  const reply=(status,value)=>{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
  if(!same(req.headers.authorization,'Bearer '+(env.CRON_SECRET||'')) || !env.CRON_SECRET)return reply(401,{error:'Unauthorized'});
  // A deliberate, cron-authenticated setup check; never draws from the customer queue.
  if(req.method==='POST' && new URL(req.url,'https://internal.local').searchParams.get('setup_test')==='true'){
   if(env.NOTIFICATION_SETUP_TEST_ENABLED!=='true'||!env.RESEND_API_KEY)return reply(403,{error:'Setup test is disabled'});
   try{
    const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-notification-setup-2026-10-21'},body:JSON.stringify({from:'Proverbs 31 Cleaning Company <gabriellejackson@proverbs31cleaningcoservices.info>',to:['khris.nun@proverbs31cleaningcoservices.info'],subject:'Proverbs 31 · Notification delivery setup test',text:'This is the authorized notification setup test from the Proverbs 31 website. No customer booking was created or changed. Public sign-in and automatic customer notifications remain disabled.'}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)return reply(502,{error:'Setup email was rejected by the provider',provider_status:r.status});
    const data=await r.json();if(!data.id)throw Error('Delivery unavailable');return reply(200,{accepted:true,provider_id:data.id});
   }catch{return reply(503,{error:'Setup email was not acknowledged'});}
  }
  if(env.AUTH_ENABLED!=='true'||env.NOTIFICATIONS_ENABLED!=='true')return reply(200,{enabled:false,sent:0});
  if(!env.RESEND_API_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)return reply(503,{error:'Notification delivery is not configured'});
  const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw Error('Notification queue unavailable');return r.data;};
  try{
   const jobs=await rpc('api_notification_claim',{p_limit:10});let sent=0,failed=0;
   for(const job of jobs){
    let provider=null,error=null;
    try{
     let guestUrl;
     if(job.snapshot.booking.status!=='cancelled'&&!job.snapshot.account_enabled&&env.GUEST_PORTAL_ENABLED==='true'&&env.GUEST_LINK_SECRET){
      const token=createHmac('sha256',env.GUEST_LINK_SECRET).update(job.id).digest('base64url');
      const linked=await rpc('api_notification_guest_link',{p_id:job.id,p_lease:job.lease_id,p_hash:createHash('sha256').update(token).digest('hex')});
      if(linked)guestUrl='https://www.proverbs31cleaningcoservices.info/guest.html#access='+token;
     }
     const message=renderEmail(job.kind,job.snapshot.booking,{accountEnabled:job.snapshot.account_enabled,guestUrl,eventDetails:job.event_details||{}});
     const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-notification-'+job.id},body:JSON.stringify({from:'Proverbs 31 Cleaning Company <gabriellejackson@proverbs31cleaningcoservices.info>',reply_to:'gabriellejackson@proverbs31cleaningcoservices.info',to:[job.recipient],...message}),signal:AbortSignal.timeout(15000)});
     if(!response.ok)throw Error('Email provider rejected delivery ('+response.status+')');
     provider=(await response.json()).id;if(!provider)throw Error('Email provider did not acknowledge delivery');
    }catch{error='Delivery not acknowledged; queued for retry or owner review';}
    const saved=await rpc('api_notification_finish',{p_id:job.id,p_lease:job.lease_id,p_provider:provider,p_error:error});
    if(saved&&provider)sent++;else failed++;
   }
   return reply(200,{enabled:true,sent,failed});
  }catch{return reply(503,{error:'Notification processing temporarily unavailable'});}
 };
}
module.exports={createNotificationHandler};

const {timingSafeEqual,createHmac,createHash}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {renderEmail}=require('./email-templates.cjs');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&a.length>0&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function createNotificationHandler({env=process.env,clientFactory=createClient,send=fetch}={}){
 return async(req,res)=>{
  const reply=(status,value)=>{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
  if(!same(req.headers.authorization,'Bearer '+(env.CRON_SECRET||'')) || !env.CRON_SECRET)return reply(401,{error:'Unauthorized'});
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
     if(!job.snapshot.account_enabled&&env.GUEST_PORTAL_ENABLED==='true'&&env.GUEST_LINK_SECRET){
      const token=createHmac('sha256',env.GUEST_LINK_SECRET).update(job.id).digest('base64url');
      const linked=await rpc('api_notification_guest_link',{p_id:job.id,p_lease:job.lease_id,p_hash:createHash('sha256').update(token).digest('hex')});
      if(linked)guestUrl='https://www.proverbs31cleaningcoservices.info/guest.html#access='+token;
     }
     const message=renderEmail(job.kind,job.snapshot.booking,{accountEnabled:job.snapshot.account_enabled,guestUrl});
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

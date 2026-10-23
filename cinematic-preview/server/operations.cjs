const {timingSafeEqual}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const equal=(a,b)=>!!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function assessHealth(data,now=Date.now()){
 const b=data.backup||{},last=Date.parse(b.succeeded_at||''),failed=Date.parse(b.failed_at||''),alerts=[];
 if(!Number.isFinite(last)||now-last>36*3600000)alerts.push('No successful backup recorded within 36 hours.');
 if(Number.isFinite(failed)&&(!Number.isFinite(last)||failed>last))alerts.push('The latest backup attempt failed.');
 if(Number(data.account_deletion_failures)>0)alerts.push('An account deletion needs technical or payment reconciliation.');
 if(Number(data.account_deletion_notification_failures)>0)alerts.push('An account deletion notice has not reached the owner.');
 if(Number(data.email_failures)>0)alerts.push('Customer email deliveries need review in the admin dashboard.');
 return {alerts,shouldNotify:alerts.length>0&&(!b.alerted_at||now-Date.parse(b.alerted_at)>24*3600000)};
}
function createOperationsHandler({env=process.env,clientFactory=createClient,send=fetch,clock=Date.now}={}){return async(req,res)=>{
 const reply=(s,b)=>{res.statusCode=s;res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(b));};
 if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
 if(!env.CRON_SECRET||!equal(req.headers.authorization,'Bearer '+env.CRON_SECRET))return reply(401,{error:'Unauthorized'});
 if(env.OPERATIONS_MONITOR_ENABLED!=='true')return reply(200,{enabled:false});
 try{const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),r=await db.rpc('service_operations_health');if(r.error)throw Error();
 const health=assessHealth(r.data,clock());
 if(health.shouldNotify){if(!env.RESEND_API_KEY)throw Error();const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-operations-'+new Date(clock()).toISOString().slice(0,10)},body:JSON.stringify({from:'Proverbs 31 Operations <gabriellejackson@proverbs31cleaningcoservices.info>',to:['khris.nun@proverbs31cleaningcoservices.info'],subject:'Proverbs 31 · Technical attention needed',text:health.alerts.join('\n')+'\nReview backups and delivery status securely. No customer data is included in this message.'}),signal:AbortSignal.timeout(15000)});if(!response.ok||!(await response.json()).id)throw Error();const saved=await db.rpc('service_operations_alerted');if(saved.error)throw Error();}
 return reply(200,{enabled:true,issues:health.alerts.length,notified:health.shouldNotify});
 }catch{return reply(503,{error:'Operations check could not complete'});}
};}
module.exports={assessHealth,createOperationsHandler};

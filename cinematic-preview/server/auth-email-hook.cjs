const {Webhook}=require('standardwebhooks');
const {renderAuthEmail}=require('./auth-email-templates.cjs');
const senders=require('./email-senders.cjs');
const origin='https://www.proverbs31cleaningcoservices.info';
function createAuthEmailHandler({env=process.env,send=fetch}={}){
 return async(req,res)=>{
  const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  if(!env.SEND_EMAIL_HOOK_SECRET||!env.RESEND_API_KEY)return reply(503,{error:'Authentication email delivery is not configured'});
  let payload;
  try{
   let raw;if(Buffer.isBuffer(req.rawBody))raw=req.rawBody;else if(Buffer.isBuffer(req.body))raw=req.body;else{let size=0;const chunks=[];for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>65536)throw Error();chunks.push(Buffer.from(chunk));}raw=Buffer.concat(chunks);}
   if(raw.length>65536)throw Error();
   const secret=env.SEND_EMAIL_HOOK_SECRET.replace(/^v1,/, '');
   payload=new Webhook(secret).verify(raw,req.headers);
  }catch{return reply(401,{error:'Invalid authentication email signature'});}
  const {user,email_data:data}=payload||{};
  // Only the app's existing passwordless signup and login flows are enabled.
  if(!['signup','magiclink'].includes(data?.email_action_type)||!user?.email||!/^\S+@\S+\.\S+$/.test(user.email)||!/^[a-zA-Z0-9_-]{20,256}$/.test(data.token_hash||''))return reply(422,{error:'Unsupported authentication email'});
  let callback=new URL('/sign-in.html',origin);
  try{const requested=new URL(data.redirect_to);if(requested.origin===origin&&['/sign-in.html','/owner-sign-in.html'].includes(requested.pathname))callback=new URL(requested.pathname,origin);}catch{}
  callback.searchParams.set('token_hash',data.token_hash);callback.searchParams.set('type','email');
  const signup=data.email_action_type==='signup',subject=signup?'Confirm your Proverbs 31 account':'Your Proverbs 31 sign-in link';
  try{
   const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'p31-auth-'+req.headers['webhook-id']},body:JSON.stringify({from:signup?senders.signup:senders.notifications,reply_to:senders.replyTo,to:[user.email],subject,html:renderAuthEmail(signup?'confirm-signup':'magic-link',callback.href.replaceAll('&','&amp;')),text:subject+'\n\n'+callback.href+'\n\nThis link can be used once and expires in one hour. If you did not request it, ignore this email.'}),signal:AbortSignal.timeout(4000)});
   if(!response.ok||!(await response.json()).id)throw Error();
   return reply(200,{});
  }catch{return reply(502,{error:'Authentication email delivery was not acknowledged'});}
 };
}
module.exports={createAuthEmailHandler};

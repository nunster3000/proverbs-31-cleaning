const Stripe=require('stripe');
const {createClient}=require('@supabase/supabase-js');
const {launchState}=require('./launch-clock.cjs');
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e;};
function paymentConfigured(env,now=Date.now()){return env.PAYMENTS_ENABLED==='true' && ['test','live'].includes(env.STRIPE_MODE) && new RegExp('^(sk|rk)_'+env.STRIPE_MODE+'_').test(env.STRIPE_SECRET_KEY||'') && new RegExp('^pk_'+env.STRIPE_MODE+'_').test(env.STRIPE_PUBLISHABLE_KEY||'') && !!env.STRIPE_WEBHOOK_SECRET && !(env.VERCEL_ENV==='production' && env.STRIPE_MODE==='test' && !launchState(env,now).pending);}
async function checkout({env,bookingId,kind,actor=null,guest=null,policy={},clientFactory=createClient,stripeFactory=key=>new Stripe(key,{maxNetworkRetries:2,timeout:20000})}){
 if(!paymentConfigured(env))fail(503,'Online payments are not available yet.');
 if(!/^[0-9a-f-]{36}$/i.test(bookingId||'') || !['deposit','final'].includes(kind))fail(400,'Choose a booking and payment type.');
 const db=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)fail(r.error.code==='42501'?403:409,r.error.message);return r.data;};
 const attempt=await rpc('api_payment_prepare',{p_id:bookingId,p_kind:kind,p_actor:actor,p_guest:guest,p_policy:policy});
 const origin=new URL(env.APP_ORIGIN).origin;
 const returnUrl=origin+(guest?'/guest.html':'/workspace.html')+'?payment=returned&booking='+encodeURIComponent(bookingId);
 const stripe=stripeFactory(env.STRIPE_SECRET_KEY);
 const result=session=>{
  if(session.ui_mode!=='elements' || !session.client_secret || session.status==='complete')fail(409,'This payment has changed or is processing. Refresh your booking before trying again.');
  return {clientSecret:session.client_secret,publishableKey:env.STRIPE_PUBLISHABLE_KEY,amountCents:attempt.cents,kind};
 };
 if(attempt.session_id)return result(await stripe.checkout.sessions.retrieve(attempt.session_id));
 const session=await stripe.checkout.sessions.create({mode:'payment',ui_mode:'elements',client_reference_id:bookingId,customer_email:attempt.email,
  line_items:[{price_data:{currency:'usd',unit_amount:attempt.cents,product_data:{name:'Proverbs 31 · '+(kind==='deposit'?'Booking deposit':'Final cleaning balance')}},quantity:1}],
  metadata:{p31_attempt:attempt.id,p31_booking:bookingId,p31_kind:kind},payment_intent_data:{metadata:{p31_attempt:attempt.id,p31_booking:bookingId,p31_kind:kind}},
  return_url:returnUrl,expires_at:Math.floor(new Date(attempt.created_at).getTime()/1000)+3600},{idempotencyKey:'p31-elements-'+attempt.id});
 if(!session.client_secret)fail(502,'Payment form is unavailable. Try again shortly.');
 await rpc('api_payment_attach',{p_attempt:attempt.id,p_session:session.id,p_url:null,p_expires:new Date(session.expires_at*1000).toISOString()});
 return result(session);
}
function createWebhookHandler({env=process.env,clientFactory=createClient,stripeFactory=key=>new Stripe(key)}={}){
 return async(req,res)=>{
  const reply=(status,body)=>{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  if(!paymentConfigured(env))return reply(503,{error:'Payments are not configured'});
  try{
   let bytes;
   if(Buffer.isBuffer(req.rawBody))bytes=req.rawBody;
   else if(Buffer.isBuffer(req.body))bytes=req.body;
   else {const chunks=[];let total=0;for await(const chunk of req){total+=Buffer.byteLength(chunk);if(total>262144)fail(413,'Event too large');chunks.push(Buffer.from(chunk));}bytes=Buffer.concat(chunks);}
   if(bytes.length>262144)fail(413,'Event too large');
   const stripe=stripeFactory(env.STRIPE_SECRET_KEY);
   let event;try{event=stripe.webhooks.constructEvent(bytes,req.headers['stripe-signature'],env.STRIPE_WEBHOOK_SECRET);}catch{fail(400,'Invalid event signature');}
   if(event.livemode!==(env.STRIPE_MODE==='live'))fail(400,'Payment mode mismatch');
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return reply(200,{received:true});
   const session=event.data.object;
   if(session.mode!=='payment' || session.payment_status!=='paid')return reply(200,{received:true});
   if(!/^[0-9a-f-]{36}$/i.test(session.metadata?.p31_attempt||''))fail(400,'Missing booking reference');
   const service=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const result=await service.rpc('api_payment_settle',{p_attempt:session.metadata.p31_attempt,p_session:session.id,p_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id,p_event:event.id,p_cents:session.amount_total,p_currency:session.currency});
   if(result.error)fail(500,'Payment reconciliation unavailable');
   return reply(200,{received:true});
  }catch(e){return reply(e.status||500,{error:e.status?e.message:'Payment event could not be processed'});}
 };
}
module.exports={checkout,createWebhookHandler,paymentConfigured};

const {test}=require('node:test'),assert=require('node:assert/strict'),Stripe=require('../cinematic-preview/node_modules/stripe');
const {checkout,createWebhookHandler,paymentConfigured}=require('../cinematic-preview/server/payments.cjs');
const env={PAYMENTS_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',APP_ORIGIN:'https://www.proverbs31cleaningcoservices.info'};
const id='11111111-1111-4111-8111-111111111111';
test('payment configuration rejects disabled and mixed-mode keys',()=>{assert.ok(paymentConfigured(env));assert.equal(paymentConfigured({...env,PAYMENTS_ENABLED:'false'}),false);assert.equal(paymentConfigured({...env,STRIPE_MODE:'live'}),false);});
test('sandbox payments cannot open to production customers when the countdown ends',()=>{
 const prod={...env,VERCEL_ENV:'production',LAUNCH_COUNTDOWN_ENABLED:'true'};
 assert.equal(paymentConfigured(prod,Date.parse('2026-10-26T12:59:59Z')),true);
 assert.equal(paymentConfigured(prod,Date.parse('2026-10-26T13:00:00Z')),false);
 assert.equal(paymentConfigured({...prod,LAUNCH_COUNTDOWN_ENABLED:'false'}),false);
});
test('checkout trusts locked server amount and reuses a stable Stripe idempotency key',async()=>{
 let parameters,key;const calls=[];
 const clientFactory=()=>({rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='api_payment_prepare'?{id,cents:5500,email:'fixture@example.com',created_at:new Date().toISOString()}: {},error:null};}});
 const stripeFactory=()=>({checkout:{sessions:{create:async(p,o)=>{parameters=p;key=o.idempotencyKey;return {id:'cs_test_fixture',ui_mode:'elements',status:'open',client_secret:'cs_test_fixture_secret_fixture',expires_at:Math.floor(Date.now()/1000)+3600};}}}});
 const result=await checkout({env,bookingId:id,kind:'deposit',actor:id,clientFactory,stripeFactory});
 assert.equal(parameters.line_items[0].price_data.unit_amount,5500);assert.equal(parameters.metadata.p31_attempt,id);assert.equal(key,'p31-elements-'+id);assert.equal(calls[1][0],'api_payment_attach');assert.equal(parameters.ui_mode,'elements');assert.equal(parameters.success_url,undefined);assert.equal(result.clientSecret,'cs_test_fixture_secret_fixture');assert.equal(result.amountCents,5500);assert.equal(result.publishableKey,'pk_test_fixture');assert.equal(result.url,undefined);
});
async function event(payload,signature=true){
 const bytes=Buffer.from(JSON.stringify(payload));let writes=0;const stripe=new Stripe('sk_test_fixture');
 const req={method:'POST',rawBody:bytes,headers:{'stripe-signature':signature?stripe.webhooks.generateTestHeaderString({payload:bytes.toString(),secret:env.STRIPE_WEBHOOK_SECRET}):'bad'}};
 let status,result;const res={setHeader(){},set statusCode(v){status=v;},end(v){result=JSON.parse(v);}};
 const handler=createWebhookHandler({env,clientFactory:()=>({rpc:async()=>{writes++;return {data:{state:'paid'}};}})});await handler(req,res);return {status,result,writes};
}
const paid={id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_fixture',mode:'payment',payment_status:'paid',payment_intent:'pi_fixture',amount_total:5500,currency:'usd',metadata:{p31_attempt:id}}}};
test('signed paid event reconciles through the server-only database function',async()=>assert.deepEqual(await event(paid),{status:200,result:{received:true},writes:1}));
test('forged, unpaid, and wrong-mode events cannot credit a booking',async()=>{
 assert.equal((await event(paid,false)).writes,0);assert.equal((await event(paid,false)).status,400);
 assert.equal((await event({...paid,livemode:true})).writes,0);
 const unpaid=structuredClone(paid);unpaid.data.object.payment_status='unpaid';assert.equal((await event(unpaid)).writes,0);
});
test('anonymous deposit redirects return to the limited guest receipt instead of account login',async()=>{let params;await checkout({env,bookingId:id,kind:'deposit',actor:id,anonymous:true,clientFactory:()=>({rpc:async name=>({data:name==='api_payment_prepare'?{id,cents:5500,email:'guest@example.com',created_at:new Date().toISOString()}:{}})}),stripeFactory:()=>({checkout:{sessions:{create:async p=>{params=p;return{id:'cs_test_guest',ui_mode:'elements',client_secret:'fixture',status:'open',expires_at:Math.floor(Date.now()/1000)+3600}}}}})});assert.match(params.return_url,/\/guest-receipt.html\?payment=returned&booking=/);assert.doesNotMatch(params.return_url,/workspace/);});

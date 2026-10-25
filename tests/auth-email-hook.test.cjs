const {test}=require('node:test'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),path=require('node:path');
const req=createRequire(path.resolve('cinematic-preview/package.json')),{Webhook}=req('standardwebhooks');
const {createAuthEmailHandler}=require('../cinematic-preview/server/auth-email-hook.cjs');
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
async function run({type='signup',signature=true,offset=0,sendOk=true,configured=true,redirect='https://evil.example/steal'}={}){
 const payload=JSON.stringify({user:{email:'sample@example.com'},email_data:{email_action_type:type,token_hash:'a'.repeat(56),redirect_to:redirect}}),id='test-email',time=new Date(Date.now()+offset),headers={'webhook-id':id,'webhook-timestamp':String(Math.floor(time.getTime()/1000)),'webhook-signature':signature?new Webhook(secret).sign(id,time,payload):'v1,invalid'};
 let outgoing,status,result;await createAuthEmailHandler({env:configured?{SEND_EMAIL_HOOK_SECRET:'v1,'+secret,RESEND_API_KEY:'test'}:{},send:async(url,options)=>{outgoing=JSON.parse(options.body);assert.equal(options.headers['Idempotency-Key'],'p31-auth-test-email');return{ok:sendOk,json:async()=>({id:'sent'})}}})({method:'POST',rawBody:Buffer.from(payload),headers},{setHeader(){},set statusCode(v){status=v},end(body){result=JSON.parse(body)}});return{outgoing,status,result};
}
test('signup uses signup sender; login uses noreply; callback cannot be redirected off-site',async()=>{
 for(const type of ['signup','magiclink']){const r=await run({type});assert.equal(r.status,200);assert.match(r.outgoing.from,type==='signup'?/<signup@/:/<noreply@/);assert.equal(r.outgoing.reply_to,'gabriellejackson@proverbs31cleaningcoservices.info');assert.match(r.outgoing.html,/sign-in.html\?token_hash=/);assert.doesNotMatch(r.outgoing.html,/evil.example|\{\{/);}
 const owner=await run({type:'magiclink',redirect:'https://www.proverbs31cleaningcoservices.info/owner-sign-in.html'});assert.match(owner.outgoing.html,/owner-sign-in.html\?token_hash=/);
});
test('forged, expired, unconfigured and unsupported auth hooks never send',async()=>{
 for(const options of [{signature:false},{offset:-600000},{configured:false},{type:'unknown'}]){const r=await run(options);assert.ok(r.status>=400);assert.equal(r.outgoing,undefined);}
 assert.equal((await run({sendOk:false})).status,502);
});

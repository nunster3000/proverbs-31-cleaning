const{test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const localRequire=require('module').createRequire(path.resolve('tests/backend-database.test.cjs')),source=fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0],box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};vm.runInNewContext(source+'\nmodule.exports={db,ready,login,rpc,ids};',box);const{db,ready,login:baseLogin,rpc,ids}=box.module.exports;after(()=>db.close());
async function login(who){await baseLogin(who);await db.query("select set_config('request.jwt.claims',(auth.jwt()||jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())))))::text,false)");}
async function admin(){await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");}
async function service(){await admin();await db.exec('set role service_role');}
const worker=(action,id,data={})=>rpc('service_account_closure',[action,id,JSON.stringify(data)]);
const mail=(action,id=null,data={})=>rpc('service_closure_mail',[action,id,JSON.stringify(data)]);
test('deletion issues: private, deduplicated, customer contact verified, delivery retries fenced, resolution tracked and contact erased',async()=>{
 await ready;await admin();for(const f of fs.readdirSync('cinematic-preview/supabase/migrations').filter(f=>Number(f.slice(0,3))>=11&&Number(f.slice(0,3))<=30).sort())await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/'+f,'utf8'));
 await login('alice');await assert.rejects(()=>rpc('api_closure_notifications',[]),/Owner/);await assert.rejects(()=>mail('claim'),/permission/);await assert.rejects(()=>db.query('select * from private.closure_issue_notices'),/permission/);
 const b=(await rpc('api_create_booking',[JSON.stringify({service:'standard',space_id:3,name:'Alice Fixture',email:'alice@example.com',address:'123 Example Lane',date:require('./helpers/booking-date.cjs').bookingDate(40),arrival:'morning'}),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']))[0];
 await admin();await db.query("update public.bookings set status='completed',invoice_issued=true,quote_status='accepted',final_cents=11000 where id=$1",[b.id]);
 await login('alice');const preview=await rpc('api_account_closure',[]);const request=await rpc('api_account_closure',['request',JSON.stringify({mode:'keep',confirmation:'DELETE',fingerprint:preview.fingerprint})]);const id=request.request.id;
 await service();const job=await worker('claim',id);const data={lease_token:job.lease_token};const observe=code=>rpc('service_closure_observe',[id,code??null,job.lease_token]);
 await assert.rejects(()=>rpc('service_closure_observe',[id,'technical_retry','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']),/lease/);
 let seen=await observe();assert.equal(seen.delivery_pending,true);assert.deepEqual(Array.from(seen.codes),['billing_resolution']);await observe();
 let queued=await mail('claim');assert.equal(queued.length,1);assert.equal(queued[0].recipient,'alice@example.com');const notice=queued[0];assert.equal((await mail('finish',notice.id,{lease:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',generation:0,provider:'fake'})).saved,false);
 await mail('finish',notice.id,{lease:notice.lease_id,generation:0,provider:null});
 await login('owner');let packet=await rpc('api_closure_notifications',[]);assert.equal(packet.unread,1);assert.equal(packet.open,1);assert.equal(packet.email_failures,1);assert.equal(packet.items[0].email_state,'failed');assert.doesNotMatch(JSON.stringify(packet),/alice@example.com|recipient/);
 await rpc('api_closure_notifications',[[notice.id]]);packet=await rpc('api_closure_notifications',[]);assert.equal(packet.unread,0);assert.equal(packet.open,1); // reading is not resolution
 await rpc('api_closure_notifications',[[],notice.id]);await service();queued=await mail('claim');assert.equal(queued.length,1);assert.equal(queued[0].email_generation,1);assert.equal((await mail('finish',notice.id,{lease:notice.lease_id,generation:0,provider:'stale'})).saved,false);
 await mail('finish',notice.id,{lease:queued[0].lease_id,generation:1,provider:'provider-fixture'});
 await admin();assert.equal((await db.query('select recipient from private.closure_issue_notices where id=$1',[notice.id])).rows[0].recipient,null);
 // Resolve billing without changing any real account or payment.
 await db.query("insert into public.payment_records(request_key,booking_id,kind,cents,method,recorded_by) values(gen_random_uuid(),$1,'deposit',5500,'cash',$2),(gen_random_uuid(),$1,'final',5500,'cash',$2)",[b.id,ids.owner]);await db.query('update public.bookings set deposit_paid_cents=5500,final_paid_cents=5500 where id=$1',[b.id]);
 seen=await observe();assert.equal(seen.delivery_pending,true);assert.equal(seen.codes.length,0);await assert.rejects(()=>worker('freeze',id,data),/awaiting email delivery/);
 queued=await mail('claim');assert.equal(queued.length,1);assert.equal(queued[0].codes.length,0);assert.deepEqual(Array.from(queued[0].previous_codes),['billing_resolution']);await mail('finish',queued[0].id,{lease:queued[0].lease_id,generation:0,provider:'resolved-fixture'});
 await worker('freeze',id,data);await worker('scrub',id,data);await db.query('delete from auth.users where id=$1',[ids.alice]);
 // A failure after Auth removal still uses the temporarily held verified contact.
 await observe('technical_retry');queued=await mail('claim');assert.equal(queued[0].recipient,'alice@example.com');await assert.rejects(()=>worker('complete',id,data),/awaiting email delivery/);await mail('finish',queued[0].id,{lease:queued[0].lease_id,generation:0,provider:'cleanup-fixture'});
 await observe();queued=await mail('claim');await mail('finish',queued[0].id,{lease:queued[0].lease_id,generation:0,provider:'cleanup-resolved-fixture'});await worker('complete',id,data);
 assert.equal((await db.query('select notification_email from private.account_closures where id=$1',[id])).rows[0].notification_email,null);
 assert.equal((await db.query('select count(*)::int n from private.closure_issue_notices where recipient is not null')).rows[0].n,0);
 await login('owner');packet=await rpc('api_closure_notifications',[]);assert.equal(packet.open,0);assert.equal(packet.email_failures,0);assert.ok(packet.items.length>=4);
 // A withdrawn request stops any remaining issue email, without approving deletion.
 await login('bob');let p=await rpc('api_account_closure',[]);const withdrawn=await rpc('api_account_closure',['request',JSON.stringify({mode:'keep',confirmation:'DELETE',fingerprint:p.fingerprint})]);await service();const j=await worker('claim',withdrawn.request.id);await rpc('service_closure_observe',[j.id,'technical_retry',j.lease_token]);await login('bob');await rpc('api_account_closure',['withdraw']);await service();assert.equal((await mail('claim')).length,0);
});
const {renderClosureIssueEmail,deliverClosureIssueEmails,issues}=require('../cinematic-preview/server/account-closure-emails.cjs');
test('professional deletion email templates explain issues safely, use the small logo, and never falsely claim completion',()=>{
 for(const code of Object.keys(issues)){const r=renderClosureIssueEmail({codes:[code],closure_id:'fixture'});assert.match(r.html,/proverbs31-email-logo.jpg/);assert.match(r.text,/not complete yet/);assert.doesNotMatch(r.html,/sk_live_|access_code|<script/);assert.match(r.html,/https:\/\/www.proverbs31cleaningcoservices.info\/(workspace|contact).html/);}
 const r=renderClosureIssueEmail({codes:[],previous_codes:['technical_retry'],closure_id:'fixture'});assert.match(r.text,/not confirmation that the account has already been deleted/);assert.throws(()=>renderClosureIssueEmail({codes:['raw_database_error']}),/Unsupported/);
});
test('customer issue delivery obeys launch flags, retries with stable idempotency keys and records rejected deliveries',async()=>{
 const env={AUTH_ENABLED:'true',NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'fixture',LAUNCH_COUNTDOWN_ENABLED:'true'},clock=()=>Date.parse('2026-10-26T13:00:01Z');let claimed=0,sends=0,receipt;
 const job={id:'notice',closure_id:'closure',codes:['refund_pending'],previous_codes:[],recipient:'verified@example.test',email_generation:0,lease_id:'lease'};
 const db={rpc:async(n,a)=>{if(a.p_action==='claim'){claimed++;return {data:[job]};}receipt=a.p_data;return {data:{saved:true}};}};
 const paused=await deliverClosureIssueEmails({db,env,clock:()=>Date.parse('2026-10-25T13:00:00Z'),send:async()=>{throw Error();}});assert.equal(paused.enabled,false);assert.equal(claimed,0);
 const keys=[];const send=async(_,o)=>{sends++;keys.push(o.headers['Idempotency-Key']);const b=JSON.parse(o.body);assert.deepEqual(b.to,['verified@example.test']);return {ok:sends>1,json:async()=>({id:'provider-fixture'})};};
 assert.equal((await deliverClosureIssueEmails({db,env,clock,send})).failed,1);assert.equal(receipt.provider,null);assert.equal((await deliverClosureIssueEmails({db,env,clock,send})).sent,1);assert.equal(receipt.provider,'provider-fixture');assert.equal(keys[0],keys[1]);
});
test('a persistent cleanup failure never emits a premature resolved update on each retry',async()=>{
 const {processClosure}=require('../cinematic-preview/server/account-closure.cjs');const observed=[];
 const job={id:'j',state:'purging',mode:'cancel',user_id:'fixture',last_error:'storage_removal',lease_token:'lease',auth_removed:false,preview:{upcoming:[],holds:[]},payments:[],refunds:[]};
 const db={rpc:async(name,a)=>{if(name==='service_closure_observe'){observed.push(a.p_code);return {data:{delivery_pending:false}};}return {data:a.p_action==='claim'?job:a.p_action==='files'?[{bucket:'walkthroughs',path:'private'}]:{}};},storage:{from:()=>({remove:async()=>({error:{message:'offline'}})})}};
 for(let i=0;i<2;i++)assert.equal((await processClosure({db,env:{},id:'j'})).waiting,true);
 assert.deepEqual(observed,['technical_retry','technical_retry','technical_retry','technical_retry']);
});

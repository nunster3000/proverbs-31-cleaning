const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const localRequire=require('module').createRequire(path.resolve('tests/backend-database.test.cjs')),source=fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0],box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};vm.runInNewContext(source+'\nmodule.exports={db,ready,login,rpc,ids};',box);const{db,ready,login:loginBase,rpc,ids}=box.module.exports;after(()=>db.close());
const login=async(who,anon=false)=>{await loginBase(who,anon);await db.query("select set_config('request.jwt.claims',(auth.jwt()||jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())))))::text,false)");};
const service=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await db.exec('set role service_role');};
const admin=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);};
const request=async(mode='cancel')=>{const p=await rpc('api_account_closure',[]);return rpc('api_account_closure',['request',JSON.stringify({mode,confirmation:'DELETE',fingerprint:p.fingerprint})]);};
const worker=async(action,id,data={})=>rpc('service_account_closure',[action,id,JSON.stringify(data)]);
test('account closure: isolated database, ownership, cancellation policy, refunds, stale JWTs, scrubbing, original evidence and no admin approval',async()=>{
 await ready;await db.exec('reset role');for(const file of fs.readdirSync('cinematic-preview/supabase/migrations').filter(n=>/^0(?:1[1-9]|2[0-8])_/.test(n)).sort())await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/'+file,'utf8'));
 await login('owner');await assert.rejects(()=>request(),/Customer sign-in/);
 await login('alice',true);await assert.rejects(()=>request(),/Customer sign-in/);
 await login('alice');await assert.rejects(()=>worker('queue',null),/permission/);
 const date=require('./helpers/booking-date.cjs').bookingDate(40);
 const b=(await rpc('api_create_booking',[JSON.stringify({service:'standard',space_id:3,name:'Alice Retention',email:'alice@example.com',phone:'123456',address:'123 Fictional Lane',access_notes:'secret code',date,arrival:'morning'}),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']))[0];
 await admin();await db.query("update public.bookings set deposit_paid_cents=5500,final_paid_cents=2000 where id=$1",[b.id]);
 await db.query("insert into public.payment_records(request_key,booking_id,kind,cents,method,recorded_by) values(gen_random_uuid(),$1,'deposit',5500,'cash',$2),(gen_random_uuid(),$1,'final',2000,'cash',$2)",[b.id,ids.owner]);
 await login('alice');let p=await rpc('api_account_closure',[]);assert.equal(p.upcoming[0].refund_cents,7500);assert.equal(p.upcoming[0].retain_cents,0);
 await assert.rejects(()=>rpc('api_account_closure',['request',JSON.stringify({mode:'cancel',confirmation:'DELETE',fingerprint:'stale'})]),/changed/);
 // Less than 72 hours: retain only agreed deposit, even when prepaid above it.
 await admin();await db.query("update public.bookings set visit_date=((now() at time zone 'America/New_York')::date+1) where id=$1",[b.id]);
 await login('alice');p=await rpc('api_account_closure',[]);assert.equal(p.upcoming[0].retain_cents,5500);assert.equal(p.upcoming[0].refund_cents,2000);
 let pending=await request('keep');assert.equal(pending.request.mode,'keep');assert.equal(pending.upcoming.length,1);
 await rpc('api_account_closure',['withdraw']);pending=await request();const job=pending.request.id;assert.equal(pending.upcoming.length,0);assert.match(pending.holds.join(' '),/refund/);
 await login('bob');assert.equal((await rpc('api_account_closure',[])).request,null);await assert.rejects(()=>rpc('api_account_refunds',[]),/Owner/);
 await service();await assert.rejects(()=>worker('freeze',job),/not resolved/);
 await admin();const edge=await db.query("select private.closure_retained('2026-10-29 13:00:00+00','2026-10-26 13:00:00+00',7500,5500) exact,private.closure_retained('2026-10-29 13:00:00+00','2026-10-26 13:00:01+00',7500,5500) inside");assert.equal(edge.rows[0].exact,0);assert.equal(edge.rows[0].inside,5500);
 await login('owner');let refunds=await rpc('api_account_refunds',[]);assert.equal(refunds.length,1);assert.equal(refunds[0].cents,2000);await assert.rejects(()=>rpc('api_account_refunds',[refunds[0].id,'x']),/reference/);await rpc('api_account_refunds',[refunds[0].id,'cash-return-fixture']);
 // Insert operational PII and immutable signed evidence. The evidence must not be rewritten.
 await admin();const form=(await db.query("insert into public.access_forms(title,body) values('Fixture agreement','Original signed wording that must remain unchanged for this isolated fixture.') returning id")).rows[0].id;
 await db.query("insert into public.access_signatures(booking_id,form_id,signer_id,signer_name,visit_snapshot,consent,answers) values($1,$2,$3,'Alice Original','{}','{}','{\"kept\":\"original signed answer\"}')",[b.id,form,ids.alice]);
 await db.query("insert into public.walkthrough_files(booking_id,uploader_id,path,filename,mime,bytes,room) values($1,$2,$3,'private.jpg','image/jpeg',10,'Bedroom')",[b.id,ids.alice,b.id+'/private.jpg']);
 await db.query("insert into storage.objects(bucket_id,name) values('walkthroughs',$1)",[b.id+'/private.jpg']);
 await service();await worker('freeze',job);let files=await worker('files',job);assert.equal(files.length,1);await assert.rejects(()=>worker('scrub',job),/uploads/);
 await login('alice');assert.equal((await db.query('select * from public.customers')).rows.length,0);assert.equal((await db.query('select * from public.bookings')).rows.length,0);await assert.rejects(()=>rpc('api_profile',[JSON.stringify({name:'resurrect'})]),/sign-in|deleted/i);
 await admin();await db.query("delete from storage.objects where name=$1",[b.id+'/private.jpg']);await worker('scrub',job);assert.equal((await db.query('select email,access_notes from public.customers where id=$1',[b.customer_id])).rows[0].email,'');assert.equal((await db.query('select * from public.walkthrough_files')).rows.length,0);assert.equal((await db.query('select answers from public.access_signatures')).rows[0].answers.kept,'original signed answer');
 await db.query('delete from auth.users where id=$1',[ids.alice]);await worker('complete',job);await login('owner');const notices=await rpc('api_account_closure_notices',[]);assert.equal(notices.length,1);assert.equal(notices[0].read,false);assert.equal((await rpc('api_account_closure_notices',[job]))[0].read,true);
 await login('bob');const kept=(await rpc('api_create_booking',[JSON.stringify({service:'standard',space_id:3,name:'Bob Keep',email:'bob@example.com',address:'456 Example Lane',date,arrival:'afternoon'}),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']))[0];
 await db.query("select set_config('request.jwt.claims',(auth.jwt()-'amr')::text,false)");await assert.rejects(()=>request('keep'),/fresh email/);await login('bob');const waiting=await request('keep');const keepJob=waiting.request.id;
 await assert.rejects(()=>rpc('api_create_booking',[JSON.stringify({service:'standard',space_id:3,name:'Bob Keep',email:'bob@example.com',address:'456 Example Lane',date,arrival:'morning'}),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc']),/Withdraw/);
 await service();await assert.rejects(()=>worker('freeze',keepJob),/not resolved/);
 await admin();await db.query("update public.bookings set status='completed',invoice_issued=true,quote_status='accepted',final_cents=11000 where id=$1",[kept.id]);await assert.rejects(()=>worker('freeze',keepJob),/not resolved/);
 await db.query("insert into public.payment_records(request_key,booking_id,kind,cents,method,recorded_by) values(gen_random_uuid(),$1,'deposit',5500,'cash',$2),(gen_random_uuid(),$1,'final',5500,'cash',$2)",[kept.id,ids.owner]);await db.query('update public.bookings set deposit_paid_cents=5500,final_paid_cents=5500 where id=$1',[kept.id]);await worker('freeze',keepJob);await worker('scrub',keepJob);await db.query('delete from auth.users where id=$1',[ids.bob]);await worker('complete',keepJob);
 assert.equal((await db.query('select count(*)::int n from public.access_signatures')).rows[0].n,1);

});
const {recentAuthentication,processClosure}=require('../cinematic-preview/server/account-closure.cjs');
test('destructive requests require fresh authenticated AMR, not a refreshed JWT iat',()=>{
 const now=Date.now(),token=c=>'x.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.x';
 assert.equal(recentAuthentication(token({iat:now/1000,amr:[{method:'otp',timestamp:now/1000-601}]}),now),false);
 assert.equal(recentAuthentication(token({amr:[{method:'otp',timestamp:now/1000-5}]}),now),true);
 assert.equal(recentAuthentication(token({amr:[{method:'anonymous',timestamp:now/1000}]}),now),false);
});
test('Stripe refund resumes same reference and never deletes disputed or shared payment profiles',async()=>{
 for(const scenario of ['ok','disputed','shared','pending']){
  const calls=[],job={user_id:'customer',mode:'cancel',preview:{upcoming:[],holds:[]},payments:[{id:'p',booking_id:'b',provider:'stripe',provider_reference:'pi_fixture',cents:7500}],refunds:[{id:'r',payment_id:'p',cents:2000,state:'pending',provider_reference:'re_existing'}]};
  const db={rpc:async(_,{p_action,p_data})=>{calls.push([p_action,p_data]);return {data:p_action==='claim'?job:p_action==='files'?[]:{}};},storage:{from(){throw Error('no files');}},auth:{admin:{deleteUser:async()=>{calls.push(['delete']);return {};}}}};
  let created=0;const stripeFactory=()=>({paymentIntents:{retrieve:async()=>({id:'pi_fixture',status:'succeeded',metadata:{p31_booking:'b'},customer:scenario==='shared'?'cus_shared':null,latest_charge:{amount:7500,amount_refunded:0,disputed:scenario==='disputed'}})},refunds:{create:async()=>{created++;},retrieve:async()=>({id:'re_existing',amount:2000,payment_intent:'pi_fixture',status:scenario==='pending'?'pending':'succeeded'})}});
  const result=await processClosure({db,env:{STRIPE_SECRET_KEY:'sk_test_fixture'},id:'job',stripeFactory});assert.equal(created,0);assert.equal(!!result.completed,scenario==='ok');assert.equal(calls.some(c=>c[0]==='delete'),scenario==='ok');
 }
});

test('removal failures retry without deleting Auth prematurely, and notifications require cron authorization',async()=>{
 let deleted=false;const calls=[];const db={rpc:async(_,{p_action})=>{calls.push(p_action);return {data:p_action==='claim'?{state:'purging',user_id:'user',mode:'cancel',preview:{upcoming:[],holds:[]},payments:[],refunds:[]}:p_action==='files'?[{bucket:'walkthroughs',path:'booking/private'}]:{}};},storage:{from:()=>({remove:async()=>({error:{message:'unavailable'}})})},auth:{admin:{deleteUser:async()=>{deleted=true;return {};}}}};
 const r=await processClosure({db,env:{},id:'job'});assert.equal(r.waiting,true);assert.equal(deleted,false);assert.ok(!calls.includes('scrub'));
 const {createAccountMaintenanceHandler}=require('../cinematic-preview/server/account-closure.cjs');let code;const res={setHeader(){},set statusCode(v){code=v;},end(){}};await createAccountMaintenanceHandler({env:{CRON_SECRET:'test'}})({method:'GET',headers:{authorization:'Bearer wrong'}},res);assert.equal(code,401);
});
test('a refund discovered after a lost response is reused even outside the idempotency window',async()=>{
 const job={state:'waiting',user_id:'customer',mode:'cancel',preview:{upcoming:[],holds:['A refund is awaiting completion.']},payments:[{id:'p',booking_id:'b',provider:'stripe',provider_reference:'pi_fixture',cents:5500}],refunds:[{id:'r',payment_id:'p',cents:5500,state:'pending'}]};let created=0,recorded=false,removed=false;
 const db={rpc:async(_,{p_action,p_data})=>{if(p_action==='refund'){recorded=p_data.reference==='re_found'&&p_data.succeeded;}return {data:p_action==='claim'?job:p_action==='files'?[]:{}};},auth:{admin:{deleteUser:async()=>{removed=true;return {};}}}};
 const stripeFactory=()=>({paymentIntents:{retrieve:async()=>({id:'pi_fixture',status:'succeeded',metadata:{p31_booking:'b'},latest_charge:{amount:5500,amount_refunded:5500,disputed:false}})},refunds:{list:async()=>({has_more:false,data:[{id:'re_found',payment_intent:'pi_fixture',amount:5500,status:'succeeded',metadata:{p31_refund:'r'}}]}),create:async()=>{created++;}}});
 assert.equal((await processClosure({db,env:{STRIPE_SECRET_KEY:'sk_test_fixture'},id:'job',stripeFactory})).completed,true);assert.equal(created,0);assert.equal(recorded,true);assert.equal(removed,true);
});

const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{randomUUID}=require('crypto');
const localRequire=require('module').createRequire(path.resolve('tests/backend-database.test.cjs')),box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};
vm.runInNewContext(fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0]+'\nmodule.exports={db,ready,login,rpc,ids};',box);
const {db,ready,login,rpc,ids}=box.module.exports;after(()=>db.close());
async function service(){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await db.exec('set role service_role');}
async function action(id,name,data={}){await login('owner');return rpc('api_booking_action',[id,name,JSON.stringify(data),null]);}
test('account and guest checkout collect only the starting-price deposit; final invoices require reviewed, approved, completed service and deduct payments once',async()=>{
 await ready;await db.exec('reset role');for(const f of fs.readdirSync('cinematic-preview/supabase/migrations').filter(n=>Number(n.slice(0,3))>10&&n.endsWith('.sql')).sort())await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/'+f,'utf8'));
 await db.exec("update public.business_settings set guest_checkout_enabled=true where id;update private.guest_checkout_launch set opens_at=now()-interval '1 second';update private.launch_preparation set published_revision=1,published='{\"deposit_handling\":\"Isolated test policy\"}' where id");
 for(const guest of [false,true]){
  const who=guest?'bob':'alice';await login(who,guest);
  const b=(await rpc('api_create_booking',[JSON.stringify({name:'Payment flow fixture',email:guest?'guest@example.com':'alice@example.com',address:'123 Test Lane',service:'standard',space_id:3,extras:{laundry:2,fridge:true},date:require('./helpers/booking-date.cjs').bookingDate(guest?51:41),arrival:'morning'}),randomUUID()]))[0];
  assert.equal(b.quote_snapshot.base_cents,11000);assert.equal(b.quote_snapshot.total_cents,22500);assert.equal(b.quote_snapshot.deposit_cents,5500,'Deposit excludes optional add-ons');
  await service();const prepare=kind=>rpc('api_payment_prepare',[b.id,kind,ids[who],null,JSON.stringify({accepted:true,revision:1})]);
  await assert.rejects(()=>prepare('full'),/unavailable/);await assert.rejects(()=>prepare('final'),/not ready/);
  const deposit=await prepare('deposit');assert.equal(deposit.cents,5500);await rpc('api_payment_attach',[deposit.id,'cs_test_'+deposit.id.replaceAll('-',''),null,new Date(Date.now()+3600000).toISOString()]);await rpc('api_payment_settle',[deposit.id,'cs_test_'+deposit.id.replaceAll('-',''),'pi_'+deposit.id.replaceAll('-',''),'evt_'+deposit.id.replaceAll('-',''),5500,'usd']);await assert.rejects(()=>prepare('deposit'),/No payable balance/);
  // Isolate each invoice guard without bypassing it through the UI. These are disposable database fixtures.
  for(const state of [{status:'awaiting_walkthrough',reviewed:false,quote:'not_reviewed'},{status:'confirmed',reviewed:true,quote:'accepted'},{status:'in_progress',reviewed:true,quote:'accepted'},{status:'completed',reviewed:false,quote:'accepted'},{status:'completed',reviewed:true,quote:'awaiting_approval'}]){
   await db.exec('reset role');await db.query('update public.bookings set status=$2,reviewed=$3,quote_status=$4,final_cents=25000 where id=$1',[b.id,state.status,state.reviewed,state.quote]);
   await assert.rejects(()=>action(b.id,'issue_invoice'),/Review, customer approval, and completion/);await service();await assert.rejects(()=>prepare('final'),/not ready/);
  }
  await db.exec('reset role');await db.query("update public.bookings set status='completed',reviewed=true,walkthrough_approved=true,quote_status='accepted',final_cents=25000 where id=$1",[b.id]);
  assert.equal((await db.query("select count(*)::int n from public.notification_outbox where booking_id=$1 and kind='final_balance_ready'",[b.id])).rows[0].n,0);
  await action(b.id,'issue_invoice');await action(b.id,'issue_invoice');await service();const final=await prepare('final');assert.equal(final.cents,19500,'$250 full total minus $55 recorded deposit');
  await login('owner');const jobs=(await db.query("select * from public.notification_outbox where booking_id=$1 and kind='final_balance_ready'",[b.id])).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].recipient,guest?'guest@example.com':'alice@example.com');assert.equal(jobs[0].snapshot.account_enabled,!guest);
  await service();await rpc('api_payment_attach',[final.id,'cs_test_'+final.id.replaceAll('-',''),null,new Date(Date.now()+3600000).toISOString()]);await rpc('api_payment_settle',[final.id,'cs_test_'+final.id.replaceAll('-',''),'pi_'+final.id.replaceAll('-',''),'evt_'+final.id.replaceAll('-',''),19500,'usd']);await assert.rejects(()=>prepare('final'),/No payable balance/);
 }
});

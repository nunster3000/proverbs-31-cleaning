const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const localRequire=require('node:module').createRequire(path.resolve('tests/backend-database.test.cjs'));
const source=fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0];
const box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};vm.runInNewContext(source+'\nmodule.exports={db,ready,login,rpc};',box);
const {db,ready,login,rpc}=box.module.exports;after(()=>db.close());
test('notification snapshots are private, claimed once, lease-fenced, and retryable without duplicate sends',async()=>{
 await ready;await db.exec('reset role');
 for(const file of fs.readdirSync('cinematic-preview/supabase/migrations').filter(n=>/^01[1-5]_/.test(n)).sort())await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/'+file,'utf8'));
 await login('alice');await assert.rejects(()=>db.query('select * from public.api_notification_claim(10)'),/permission denied/);
 const date=require('./helpers/booking-date.cjs').bookingDate(20);
 const claim=async()=> (await db.query('select * from public.api_notification_claim(10)')).rows;
 const b=(await rpc('api_create_booking',[JSON.stringify({name:'Notification QA',email:'alice@example.com',address:'Isolated test address',service:'standard',space_id:3,date,arrival:'morning'}),'77777777-7777-4777-8777-777777777777']))[0];
 await login('bob');assert.equal((await db.query('select * from public.notification_outbox')).rows.length,0);
 await db.exec('reset role;set role service_role');const [job]=await claim();assert.equal(job.booking_id,b.id);assert.equal(job.snapshot.booking.quote_snapshot.total_cents,11000);assert.equal(job.recipient,'alice@example.com');assert.equal((await claim()).length,0);
 assert.equal(await rpc('api_notification_finish',[job.id,'88888888-8888-4888-8888-888888888888','wrong',null]),false);
 assert.equal(await rpc('api_notification_finish',[job.id,job.lease_id,null,'Provider unavailable']),true);
 await db.exec('reset role');await db.query("update public.notification_outbox set next_attempt_at=now()-interval '1 second' where id=$1",[job.id]);await db.exec('set role service_role');const [retry]=await claim();assert.equal(retry.id,job.id);assert.notEqual(retry.lease_id,job.lease_id);
 assert.equal(await rpc('api_notification_finish',[retry.id,retry.lease_id,'provider-test-id',null]),true);assert.equal((await claim()).length,0);
});

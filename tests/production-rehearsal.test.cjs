const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const localRequire=require('node:module').createRequire(path.resolve('tests/backend-database.test.cjs'));
const source=fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0];
const box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};vm.runInNewContext(source+'\nmodule.exports={db,ready};',box);
const {db,ready}=box.module.exports;after(()=>db.close());
test('hosted rehearsal SQL exercises real role checks and leaves no records or approvals behind',async()=>{
 await ready;await db.exec('reset role');
 for(const f of fs.readdirSync('cinematic-preview/supabase/migrations').filter(n=>/^(01[1-9]|020)/.test(n)).sort())await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/'+f,'utf8'));
 let sql=fs.readFileSync('ops/production-rehearsal.sql','utf8').replaceAll('khris.nun@proverbs31cleaningcoservices.info','alice@example.com').replaceAll('khris.nunnally@outlook.com','bob@example.com').replaceAll('gabriellejackson@proverbs31cleaningcoservices.info','owner@example.com');
 const before=(await db.query('select count(*)::int n from public.audit_events')).rows[0].n;
 const results=await db.exec(sql);const passed=results.flatMap(r=>r.rows||[]).find(r=>r.passed_database_rehearsal_checks);
 assert.equal(passed.passed_database_rehearsal_checks.length,11);
 for(const table of ['bookings','customers','notification_outbox','calendar_days','access_forms','access_signatures'])assert.equal((await db.query('select count(*)::int n from public.'+table)).rows[0].n,0,table);
 assert.equal((await db.query('select count(*)::int n from public.audit_events')).rows[0].n,before);
});

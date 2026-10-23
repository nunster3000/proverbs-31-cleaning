const{test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const localRequire=require('node:module').createRequire(path.resolve('tests/backend-database.test.cjs'));
const source=fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0],box={require:n=>n==='node:test'?{test(){},after(){}}:localRequire(n),module:{exports:{}},Blob,WebAssembly,console};vm.runInNewContext(source+'\nmodule.exports={db,ready,ids};',box);
const{db,ready,ids}=box.module.exports;after(()=>db.close());
test('database denies customer, missing session, revoked owner role and logged-out owner preview grants',async()=>{
 await ready;await db.exec('reset role');await db.exec('create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));');await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/033_owner_site_preview.sql','utf8'));
 const sid='99999999-9999-4999-8999-999999999999';await db.query('insert into auth.sessions values($1,$2)',[sid,ids.owner]);
 async function check(who,session=sid){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[who],email:who+'@example.com',is_anonymous:false,session_id:session})]);await db.exec('set role authenticated');return(await db.query('select public.api_owner_preview_session() as allowed')).rows[0].allowed;}
 assert.equal(await check('owner'),true);assert.equal(await check('alice'),false);assert.equal(await check('owner',''),false);assert.equal(await check('owner','------------------------------------'),false);
 await db.exec('reset role');await db.exec('delete from auth.sessions');assert.equal(await check('owner'),false);
 await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2)',[sid,ids.owner]);await db.query('delete from private.owner_accounts where user_id=$1',[ids.owner]);assert.equal(await check('owner'),false);
});

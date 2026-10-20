// Optional integration checks against a fresh, disposable local PostgreSQL database.
// P31_TEST_DATABASE_URL=postgres://...@127.0.0.1:port/p31_qa_name node --test tests/postgres-concurrency.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const connectionString=process.env.P31_TEST_DATABASE_URL;
test('separate PostgreSQL sessions enforce customer privacy and serialize competing calendar writes',{skip:!connectionString},async t=>{
 const url=new URL(connectionString);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&/^\/p31_qa_[a-z0-9_]+$/.test(url.pathname),'Only disposable local p31_qa_* databases are allowed');
 const {Client}=require('../cinematic-preview/node_modules/pg');
 const clients=[];const connect=async()=>{const c=new Client({connectionString});await c.connect();clients.push(c);return c};
 const root=await connect();
 const ids={alice:'11111111-1111-4111-8111-111111111111',bob:'22222222-2222-4222-8222-222222222222',owner:'33333333-3333-4333-8333-333333333333'};
 try{
 assert.equal((await root.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0,'Database must be empty');
 await root.query(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth,storage to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 for(const [who,id]of Object.entries(ids))await root.query('insert into auth.users values($1,$2,now())',[id,who+'@example.com']);
 for(const file of fs.readdirSync('cinematic-preview/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await root.query(fs.readFileSync('cinematic-preview/supabase/migrations/'+file,'utf8'));
 await root.query('insert into private.owner_accounts values($1)',[ids.owner]);
 const as=async who=>{const c=await connect();await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[who],email:who+'@example.com',is_anonymous:false})]);await c.query('set role authenticated');return c};
 const alice=await as('alice'),bob=await as('bob'),owner=await as('owner');
 const rpc=async(c,name,args)=>(await c.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const date=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const open=async(d,windows)=>rpc(owner,'api_owner_schedule',['day_windows',JSON.stringify({date:d,windows})]);
 const payload=(d,arrival='morning',extra={})=>JSON.stringify({name:'Test Customer',address:'Local QA address',service:'standard',space_id:3,date:d,arrival,...extra});
 const book=(c,d,arrival='morning',extra={})=>rpc(c,'api_create_booking',[payload(d,arrival,extra),crypto.randomUUID()]);
 // Hold the common scheduling lock until both independent sessions are actually waiting.
 const race=async(left,right)=>{
  await root.query('begin');await root.query('select id from public.business_settings where id=true for update');
  const result=Promise.allSettled([left(),right()]);
  try{const until=Date.now()+5000;let waiting=0;do{waiting=(await root.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()" )).rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<until);assert.ok(waiting>=2,'Both database sessions must contend for the lock');}
  finally{await root.query('commit')}
  return result;
 };
 let first;
 await t.test('two customers racing for the same block produce exactly one reservation',async()=>{
  const d=date(200);await open(d,['morning','afternoon']);const results=await race(()=>book(alice,d),()=>book(bob,d));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/unavailable/);
  first=results.find(r=>r.status==='fulfilled').value[0];assert.equal((await root.query('select count(*)::int n from public.bookings where visit_date=$1',[d])).rows[0].n,1);
 });
 await t.test('different blocks remain bookable while a stale availability choice is rejected',async()=>{
  const d=date(200);const [next]=await book(bob,d,'afternoon');assert.ok(next.id);await assert.rejects(()=>book(alice,d),/unavailable/);
 });
 await t.test('overlapping 2-hour and 3-hour blocks cannot bypass occupancy after a pattern change',async()=>{
  const d=date(201);await open(d,['09:00-12:00']);await book(alice,d,'09:00-12:00');await open(d,['09:00-11:00','11:00-13:00','13:00-15:00']);
  await assert.rejects(()=>book(bob,d,'11:00-13:00'),/unavailable/);await book(bob,d,'13:00-15:00');
 });
 await t.test('manual booking and customer booking share the same capacity lock',async()=>{
  const d=date(202);await open(d,['morning']);const extra={email:'manual@example.com',first_name:'Manual',last_name:'Customer',manual_price_cents:11000,pricing_status:'starting'};
  // Use a separate owner session: the barrier session holds the lock.
  const manual=await as('owner');const results=await race(()=>book(manual,d,'morning',extra),()=>book(alice,d));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await root.query('select count(*)::int n from public.bookings where visit_date=$1',[d])).rows[0].n,1);
 });
 await t.test('admin blocking a day and customer booking it cannot both succeed',async()=>{
  const d=date(203);await open(d,['morning']);const admin=await as('owner');const results=await race(()=>rpc(admin,'api_owner_schedule',['block',JSON.stringify({date:d,reason:'QA unavailable'})]),()=>book(alice,d));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rows=(await root.query('select (select count(*) from public.bookings where visit_date=$1)::int bookings,(select count(*) from public.time_blocks where visit_date=$1)::int blocks',[d])).rows[0];assert.equal(rows.bookings+rows.blocks,1);
 });
 await t.test('rescheduling and new customer booking cannot claim the same destination',async()=>{
  const from=date(204),to=date(205);await open(from,['morning']);await open(to,['morning']);const [b]=await book(alice,from);const admin=await as('owner');const results=await race(()=>rpc(admin,'api_booking_action',[b.id,'reschedule',JSON.stringify({date:to,arrival:'morning',reason:'QA move'}),null]),()=>book(bob,to));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await root.query('select count(*)::int n from public.bookings where visit_date=$1',[to])).rows[0].n,1);
 });
 await t.test('approving a reschedule request cannot race past a new booking',async()=>{
  const from=date(206),to=date(207);await open(from,['morning']);await open(to,['morning']);const [b]=await book(alice,from);
  await rpc(alice,'api_booking_action',[b.id,'request_change',JSON.stringify({kind:'reschedule',notes:'Please move my visit'}),null]);
  const req=(await root.query('select id from public.booking_requests where booking_id=$1 and not resolved',[b.id])).rows[0];
  const admin=await as('owner');const results=await race(()=>rpc(admin,'api_booking_action',[b.id,'review_request',JSON.stringify({request_id:req.id,decision:'approved',date:to,arrival:'morning',notes:'New date approved'}),null]),()=>book(bob,to));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await root.query('select count(*)::int n from public.bookings where visit_date=$1',[to])).rows[0].n,1);
  const moved=(await root.query('select visit_date::text from public.bookings where id=$1',[b.id])).rows[0].visit_date===to;
  assert.equal((await root.query('select resolved from public.booking_requests where id=$1',[req.id])).rows[0].resolved,moved);
 });
 await t.test('simultaneous retries with the same request key return one booking',async()=>{
  const d=date(208);await open(d,['morning']);const retry=await as('alice'),key=crypto.randomUUID();const create=c=>rpc(c,'api_create_booking',[payload(d),key]);
  const results=await race(()=>create(alice),()=>create(retry));assert.ok(results.every(r=>r.status==='fulfilled'));assert.equal(results[0].value[0].id,results[1].value[0].id);
  assert.equal((await root.query('select count(*)::int n from public.bookings where request_key=$1',[key])).rows[0].n,1);
 });
 await t.test('recurring booking is fully rolled back when a later occurrence conflicts',async()=>{
  const d=date(210);for(let n=210;n<=231;n+=7)await open(date(n),['morning']);await book(bob,date(224));const key=crypto.randomUUID();await assert.rejects(()=>rpc(alice,'api_create_booking',[payload(d,'morning',{recurrence:{kind:'weekly'}}),key]),/unavailable/);assert.equal((await root.query('select count(*)::int n from public.bookings where request_key=$1',[key])).rows[0].n,0);
 });
 await t.test('a separate customer session cannot read a known foreign booking ID or use its actions',async()=>{
  const other=first.creator_id===ids.alice?bob:alice;assert.equal((await other.query('select * from public.bookings where id=$1',[first.id])).rows.length,0);await assert.rejects(()=>rpc(other,'api_booking_action',[first.id,'request_change',JSON.stringify({kind:'cancel',notes:'Forged'}),null]),/unavailable/);assert.equal((await other.query('select * from public.owner_notes')).rows.length,0);
 });
 }finally{await Promise.allSettled(clients.map(c=>c.end()))}
});

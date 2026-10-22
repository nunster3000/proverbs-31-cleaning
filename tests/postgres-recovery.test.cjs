// Run after postgres-concurrency.test.cjs against its disposable loopback database.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const source=process.env.P31_RECOVERY_TEST_DATABASE_URL;
test('encrypted QA database/media archive restores with access rules intact and rejects tampering',{skip:!source},async()=>{
 const url=new URL(source);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&/^\/p31_qa_[a-z0-9_]+$/.test(url.pathname),'Recovery rehearsal accepts only disposable loopback QA databases');
 const bin=process.env.P31_PG_BIN||'/opt/homebrew/opt/postgresql@17/bin',dir=fs.mkdtempSync(path.join(os.tmpdir(),'p31-recovery-'));fs.chmodSync(dir,0o700);
 const targetName='p31_qa_restore_'+crypto.randomBytes(6).toString('hex'),target=new URL(url);target.pathname='/'+targetName;
 const {Client}=require('../cinematic-preview/node_modules/pg'),clients=[];let created=false;
 const connect=async connectionString=>{const c=new Client({connectionString});await c.connect();clients.push(c);return c;};
 const command=(name,args)=>{const r=spawnSync(name,args,{encoding:'utf8',timeout:120000});assert.equal(r.status,0,name+' failed (provider/credential output withheld)');return r.stdout;};
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 try{
  const original=await connect(source);
  const inventory=async c=>(await c.query(`select (select count(*)::int from public.bookings) bookings,(select count(*)::int from public.customers) customers,(select count(*)::int from public.notification_outbox) notifications,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) rls_tables`)).rows[0];
  const before=await inventory(original);assert.ok(before.bookings>0,'Run native booking concurrency fixtures first');
  const stage=path.join(dir,'stage');fs.mkdirSync(stage,{mode:0o700});
  command(path.join(bin,'pg_dump'),['--format=custom','--file='+path.join(stage,'database.dump'),'--dbname='+source]);
  fs.mkdirSync(path.join(stage,'media'),{mode:0o700});
  for(const [name,file]of [['photo.jpg','tmp/upload-room-test.jpg'],['video.mp4','cinematic-preview/assets/hero.mp4']])fs.copyFileSync(file,path.join(stage,'media',name));
  const names=['database.dump','media/photo.jpg','media/video.mp4'];const manifest=Object.fromEntries(names.map(n=>[n,sha(fs.readFileSync(path.join(stage,n)))]));
  fs.writeFileSync(path.join(stage,'checksums.json'),JSON.stringify(manifest));
  const archive=path.join(dir,'backup.tar'),encrypted=archive+'.age',identity=path.join(dir,'qa-identity.txt');
  command('/usr/bin/tar',['-cf',archive,'-C',stage,'.']);command('/opt/homebrew/bin/age-keygen',['-o',identity]);fs.chmodSync(identity,0o600);
  const recipient=command('/opt/homebrew/bin/age-keygen',['-y',identity]).trim();assert.match(recipient,/^age1[a-z0-9]+$/);
  command('/opt/homebrew/bin/age',['-r',recipient,'-o',encrypted,archive]);
  const corrupt=fs.readFileSync(encrypted);corrupt[corrupt.length-1]^=1;const bad=path.join(dir,'damaged.age');fs.writeFileSync(bad,corrupt);
  const rejected=spawnSync('/opt/homebrew/bin/age',['-d','-i',identity,'-o',path.join(dir,'rejected.tar'),bad],{encoding:'utf8'});assert.notEqual(rejected.status,0,'Modified encrypted backup must fail authentication before restoration');
  const recovered=path.join(dir,'recovered.tar'),unpacked=path.join(dir,'unpacked');fs.mkdirSync(unpacked,{mode:0o700});
  command('/opt/homebrew/bin/age',['-d','-i',identity,'-o',recovered,encrypted]);command('/usr/bin/tar',['-xf',recovered,'-C',unpacked]);
  for(const name of names)assert.equal(sha(fs.readFileSync(path.join(unpacked,name))),manifest[name],name+' restored exactly');
  command(path.join(bin,'createdb'),['--maintenance-db='+source,targetName]);created=true;
  command(path.join(bin,'pg_restore'),['--exit-on-error','--no-owner','--dbname='+target.href,path.join(unpacked,'database.dump')]);
  const restored=await connect(target.href);assert.deepEqual(await inventory(restored),before);
  const booking=(await restored.query('select id,creator_id from public.bookings where creator_id is not null limit 1')).rows[0];assert.ok(booking);
  const other=booking.creator_id==='11111111-1111-4111-8111-111111111111'?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111';
  await restored.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:other,email:'other@example.com',is_anonymous:false})]);await restored.query('set role authenticated');
  assert.equal((await restored.query('select id from public.bookings where id=$1',[booking.id])).rows.length,0,'Restored RLS must still deny foreign booking access');
  assert.equal((await restored.query('select public.is_owner() owner')).rows[0].owner,false);
  assert.equal((await restored.query("select has_table_privilege('authenticated','public.bookings','UPDATE') allowed")).rows[0].allowed,false);
 }finally{
  await Promise.allSettled(clients.map(c=>c.end()));
  if(created)command(path.join(bin,'dropdb'),['--maintenance-db='+source,targetName]);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

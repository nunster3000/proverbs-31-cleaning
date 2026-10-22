// Operator-only loopback harness. Never included in the deployment build.
// Existing business key is read from a 0600 temporary file, never logged or sent to browsers.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createClient}=require('../cinematic-preview/node_modules/@supabase/supabase-js');
const {createHandler}=require('../cinematic-preview/server/api.cjs');
const root=path.resolve('cinematic-preview/dist'),origin='http://127.0.0.1:8799';
const ownerEmail='khris.nun@proverbs31cleaningcoservices.info',customerEmail='khris.nunnally@outlook.com';
const url='https://mokhzraxcbrmzpvedhxz.supabase.co',key='sb_publishable_QiDkIIHlNQ3fz6B_QaiCDw_8ED1IvPZ';
const serverKey=fs.readFileSync('/tmp/p31-rehearsal-server-key','utf8').trim();
if(!serverKey.startsWith('sb_secret_')||serverKey.length<30)throw Error('Existing server key not available');
const env={BACKEND_ENABLED:'true',AUTH_ENABLED:'true',LAUNCH_COUNTDOWN_ENABLED:'false',GUEST_CHECKOUT_ENABLED:'false',GUEST_PORTAL_ENABLED:'true',NOTIFICATIONS_ENABLED:'false',SUPABASE_URL:url,SUPABASE_ANON_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serverKey,APP_ORIGIN:origin,NODE_ENV:'test'};
const options={auth:{persistSession:false,autoRefreshToken:false}},auth=createClient(url,key,options),service=createClient(url,serverKey,options),handler=createHandler({env});
const sessions=new Map(),ledger={tag:'P31 REHEARSAL '+randomUUID(),bookings:[],files:[],customers:[],beforeCustomers:[],calendar:null,checks:[],phase:'Waiting for both test accounts'};
const save=()=>fs.writeFileSync('/tmp/p31-rehearsal-ledger.json',JSON.stringify(ledger,null,2),{mode:0o600});save();
const check=(name)=>{ledger.checks.push(name);save();};
async function call(email,route,body,query={},cookie){
 let status,bodyResult,headers={};
 await handler({url:'/api/app?'+new URLSearchParams({route,...query}),method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(email?{authorization:'Bearer '+sessions.get(email).token}:{}),...(cookie?{cookie}:{})},body:body||{}},{setHeader(k,v){headers[k.toLowerCase()]=v},set statusCode(v){status=v},end(v){bodyResult=JSON.parse(v)}});
 return {status,data:bodyResult,headers};
}
const ok=(result,status=200)=>{assert.equal(result.status,status,result.data?.error||'Unexpected API result');return result.data;};
const ownerAction=(id,action,data={})=>call(ownerEmail,'action',{id,action,data}).then(ok);
async function upload(email,booking,mime,filePath){
 const bytes=fs.readFileSync(filePath),name=mime.startsWith('video')?'rehearsal.mp4':'rehearsal.jpg';
 const reserved=ok(await call(email,'upload',{booking_id:booking.id,file:{filename:name,mime,bytes:bytes.length,room:'Living room',notes:ledger.tag}}),201);
 ledger.files.push({id:reserved.file.id,path:reserved.path});save();
 const pending=await call(email,'upload-finish',{id:reserved.file.id});assert.notEqual(pending.status,200);check(name+' cannot finalize before real bytes arrive');
 const result=await service.storage.from('walkthroughs').uploadToSignedUrl(reserved.path,reserved.token,bytes,{contentType:mime});if(result.error)throw Error('Storage transfer failed: '+result.error.message);
 ok(await call(email,'upload-finish',{id:reserved.file.id}));ok(await call(email,'upload-finish',{id:reserved.file.id}));
 const signed=ok(await call(ownerEmail,'file',undefined,{id:reserved.file.id}));assert.equal(signed.expiresIn,60);
 const response=await fetch(signed.url);assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,bytes.length);
 const publicResult=await fetch(url+'/storage/v1/object/public/walkthroughs/'+reserved.path);assert.notEqual(publicResult.status,200);
 check(name+' transferred to private hosted storage, finalized idempotently and reviewed through an expiring owner URL');
 return reserved.file;
}
async function run(){
 if(ledger.phase!=='Waiting for both test accounts')return;
 assert.ok(sessions.has(ownerEmail)&&sessions.has(customerEmail),'Sign into both test accounts first');
 assert.equal(ok(await call(ownerEmail,'me')).role,'owner');assert.equal(ok(await call(customerEmail,'me')).role,'customer');
 ledger.phase='Running real hosted transfers';save();
 const before=await service.from('customers').select('id');if(before.error)throw before.error;ledger.beforeCustomers=before.data.map(r=>r.id);
 const date=require('../tests/helpers/booking-date.cjs').bookingDate(60);ledger.date=date;
 const existing=await service.from('bookings').select('id').eq('visit_date',date);assert.equal(existing.data?.length,0,'Rehearsal date has live bookings');
 const old=await service.from('calendar_days').select('*').eq('visit_date',date);if(old.error)throw old.error;ledger.calendar=old.data[0]||null;save();
 ok(await call(ownerEmail,'schedule',{action:'day_windows',data:{date,windows:['09:00-12:00','12:00-15:00']}}));
 const booking={name:ledger.tag,address:'Fictional test property — no cleaning requested',service:'standard',space_id:3,date,arrival:'09:00-12:00',care_notes:ledger.tag};
 const request_id=randomUUID(),created=ok(await call(customerEmail,'bookings',{booking,request_id}),201)[0];ledger.bookings.push(created.id);ledger.customers.push(created.customer_id);save();
 assert.equal(ok(await call(customerEmail,'bookings',{booking,request_id}),201)[0].id,created.id);check('Hosted customer booking retry returns the original booking');
 const collision=await call(customerEmail,'bookings',{booking,request_id:randomUUID()});assert.notEqual(collision.status,201);check('Hosted API rejects an occupied cleaning block');
 const oversized=await call(customerEmail,'upload',{booking_id:created.id,file:{filename:'too-large.jpg',mime:'image/jpeg',bytes:20971521,room:'Kitchen'}});assert.notEqual(oversized.status,201);check('Hosted API rejects a photo above the 20 MiB limit');
 await upload(customerEmail,created,'image/jpeg','tmp/upload-room-test.jpg');
 await upload(customerEmail,created,'video/mp4','cinematic-preview/assets/hero.mp4');
 await ownerAction(created.id,'review',{notes:ledger.tag+' — reviewed real hosted media'});await ownerAction(created.id,'prepare_quote');
 const view=ok(await call(customerEmail,'booking',undefined,{id:created.id}));
 const row=view.booking||view;ok(await call(customerEmail,'action',{id:created.id,action:'accept_quote',data:{revision:row.revision}}));check('Owner review and customer price approval persist through real API sessions');
 const guest=ok(await call(ownerEmail,'bookings',{booking:{...booking,email:'launch-rehearsal@example.invalid',arrival:'12:00-15:00'},request_id:randomUUID()}),201)[0];ledger.bookings.push(guest.id);ledger.customers.push(guest.customer_id);save();
 const denied=await call(customerEmail,'booking',undefined,{id:guest.id});assert.notEqual(denied.status,200);check('Customer session cannot read the owner-created guest booking');
 const grant=ok(await call(ownerEmail,'guest-invite',{id:guest.id}),201);const token=new URL(grant.url).hash.slice('#access='.length);
 const exchange=await call(null,'guest-exchange',{token});ok(exchange);const cookie=exchange.headers['set-cookie'].split(';')[0];
 assert.notEqual((await call(null,'guest-exchange',{token})).status,200);check('Real guest HTTP exchange sets a session and rejects link replay');
 const guestView=ok(await call(null,'guest-view',undefined,{},cookie));assert.equal(guestView.booking.id,guest.id);
 const bytes=fs.readFileSync('tmp/upload-room-test.jpg'),reserve=ok(await call(null,'guest-reserve',{file:{filename:'guest-rehearsal.jpg',mime:'image/jpeg',bytes:bytes.length,room:'Kitchen',notes:ledger.tag}},{},cookie),201);
 const dest=new URL(reserve.signed_url);const uploadPath=decodeURIComponent(dest.pathname.split('/walkthroughs/')[1]);ledger.files.push({id:reserve.file.id,path:uploadPath});save();
 const uploaded=await fetch(reserve.signed_url,{method:'PUT',headers:{'content-type':'image/jpeg'},body:bytes});assert.ok(uploaded.ok,'Guest storage upload failed');ok(await call(null,'guest-finish',{id:reserve.file.id},{},cookie));
 await ownerAction(guest.id,'review',{notes:ledger.tag+' — guest hosted photo reviewed'});await ownerAction(guest.id,'prepare_quote');const current=ok(await call(null,'guest-view',undefined,{},cookie));ok(await call(null,'guest-approve',{revision:current.booking.revision,consent:true},{},cookie));check('Guest real photo transfer, owner review and current-price approval succeed');
 ok(await call(ownerEmail,'guest-revoke',{id:guest.id}));assert.notEqual((await call(null,'guest-view',undefined,{},cookie)).status,200);check('Revoking a real guest session immediately denies its next HTTP request');
 const forms=await service.from('access_forms').select('id').eq('active',true);assert.equal(forms.data.length,0);check('No unapproved agreement was published or signed');
 const emails=await service.from('notification_outbox').select('id,kind,status').in('booking_id',ledger.bookings);if(emails.error)throw emails.error;assert.ok(emails.data.length>=4);assert.ok(emails.data.every(r=>r.status!=='sent'));check('Correct booking events queued with automatic delivery disabled');
 ledger.phase='Passed — ready for dashboard review and cleanup';save();
}
async function identity(req){const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)return null;const r=await auth.auth.getUser(token);const user=r.data?.user,email=user?.email?.toLowerCase();if(r.error||!user?.email_confirmed_at||![ownerEmail,customerEmail].includes(email))return null;sessions.set(email,{token,id:user.id});return email;}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const page=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private hosted rehearsal</title><style>body{background:#f8f4eb;color:#36291e;max-width:760px;margin:60px auto;padding:24px;font:18px Georgia}button,a{padding:14px;color:inherit}button{background:#e5d6b5;border:1px solid #aa8552}li{margin:14px 0}</style><h1>Private hosted rehearsal</h1><p>Only your two approved test accounts. No automatic emails, payments, policy publication or business signatures.</p><a href="/sign-in.html">Sign in</a> <a href="/workspace.html">Open dashboard</a><p id="status">Checking your session…</p><button id="run" disabled>Run hosted checks</button><ul id="checks"></ul><script src="/assets/backend-sdk.js"></script><script src="/assets/backend-client.js"></script><script>(async()=>{const s=document.querySelector('#status'),b=document.querySelector('#run');try{await P31Live.init();const me=await P31Live.api('me');s.textContent='Signed in: '+me.user.email+' ('+me.role+')';b.disabled=me.role!=='owner';b.onclick=async()=>{b.disabled=true;try{await P31Live.api('rehearsal-run',{method:'POST',data:{}})}catch(e){s.textContent=e.message}b.disabled=false;};setInterval(async()=>{try{const d=await P31Live.api('rehearsal-status');s.textContent=d.phase+' · '+d.sessions.join(', ');document.querySelector('#checks').replaceChildren(...d.checks.map(t=>{const li=document.createElement('li');li.textContent=t;return li}));}catch(e){s.textContent=e.message}},2000);}catch(e){s.textContent=e.message}})();</script>`;
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/api/app'){
  const route=u.searchParams.get('route')||'config';
  if(req.method==='POST'&&req.headers.origin!==origin)return json(res,403,{error:'Origin rejected'});
  const email=route==='config'?null:await identity(req);if(route!=='config'&&!email)return json(res,403,{error:'Only the approved test accounts can use this loopback rehearsal'});
  if(route==='rehearsal-status')return json(res,200,{phase:ledger.phase,checks:ledger.checks,sessions:[...sessions.keys()]});
  if(route==='rehearsal-run'&&req.method==='POST'){
   if(email!==ownerEmail)return json(res,403,{error:'Temporary verified test owner required'});
   const owner=await createClient(url,key,{...options,global:{headers:{Authorization:'Bearer '+sessions.get(email).token}}}).rpc('is_owner');if(owner.error||!owner.data)return json(res,403,{error:'Owner role required'});
   if(ledger.phase==='Waiting for both test accounts')run().catch(e=>{ledger.phase='Stopped: '+String(e.message).replace(/https?:\/\/\S+/g,'[URL withheld]');save();});return json(res,202,{started:true});
  }
  // Browser sessions may only inspect the dashboards. All rehearsal writes are fixed above.
  if(req.method!=='GET')return json(res,403,{error:'Rehearsal browser writes are disabled'});
  return handler(req,res);
 }
 if(u.pathname==='/rehearsal.html'){res.setHeader('Content-Type','text/html');return res.end(page);}
 const file=path.resolve(root,'.'+(u.pathname==='/'?'/rehearsal.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 }catch{json(res,500,{error:'Private rehearsal unavailable; inspect the local report'});}
}).listen(8799,'127.0.0.1',()=>console.log('Loopback rehearsal ready on 8799. Credentials and tokens are withheld.'));

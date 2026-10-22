const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const{createHandler}=require('../cinematic-preview/server/api.cjs'),{OPENS_AT}=require('../cinematic-preview/server/launch-clock.cjs'),{countdownPage}=require('../cinematic-preview/server/countdown-page.cjs');
const env={BACKEND_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private',LAUNCH_COUNTDOWN_ENABLED:'true',LAUNCH_LOGIN_ENABLED:'true',OWNER_PRELAUNCH_ENABLED:'true',AUTH_ENABLED:'false',APP_ORIGIN:'https://example.com'};
async function request(h,route,{token,ownerHeader=false,method='GET',origin='https://example.com'}={}){let status,value;await h({url:'/api/app?route='+route,method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(ownerHeader?{'x-p31-owner-preview':'1'}:{}),'content-type':'application/json',origin},body:{}},{setHeader(){},set statusCode(v){status=v},end(v){value=JSON.parse(v)}});return{status,value};}
let reads=0;const factory=(url,key,options)=>{const token=options.global.headers.Authorization?.slice(7);return {auth:{getUser:async()=>token==='invalid'?{error:{message:'invalid'}}:{data:{user:{id:token,email_confirmed_at:token==='unverified'?null:'2026-10-22',is_anonymous:token==='anonymous'}}}},rpc:async name=>({data:name==='is_owner'?token==='owner':{},error:null}),from:()=>{reads++;return{select:()=>({single:async()=>({data:{contact_email:'business@example.com'}})})}}};};
test('prelaunch owner entrance checks verified server-side ownership before exposing data; public/customer requests stay blocked',async()=>{
 reads=0;const h=createHandler({env,clock:()=>Date.parse(OPENS_AT)-1000,clientFactory:factory});
 assert.equal((await request(h,'site-content')).status,503);
 assert.equal((await request(h,'site-content',{token:'owner'})).status,503);
 assert.equal((await request(h,'site-content',{ownerHeader:true})).status,401);
 for(const token of ['invalid','unverified','anonymous'])assert.equal((await request(h,'site-content',{token,ownerHeader:true})).status,401);
 assert.equal((await request(h,'site-content',{token:'customer',ownerHeader:true})).status,403);assert.equal(reads,0);
 assert.equal((await request(h,'site-content',{token:'owner',ownerHeader:true})).status,200);assert.equal(reads,1);
 assert.equal((await request(h,'site-content',{token:'customer',ownerHeader:true})).status,403); // revoked/non-owner sessions cannot reuse the entrance
 assert.equal((await request(h,'config')).value.authEnabled,false);
 const bootstrap=(await request(h,'owner-config')).value;assert.equal(bootstrap.ownerPreview,true);assert.equal(bootstrap.authEnabled,true);assert.ok(!JSON.stringify(bootstrap).includes('private'));
 assert.equal((await request(h,'site-content',{token:'owner',ownerHeader:true,method:'POST',origin:'https://attacker.example'})).status,403);
});
test('owner bootstrap is absent after launch or when disabled/held, and the temporary page redirects to normal login after release',async()=>{
 for(const overrides of [{OWNER_PRELAUNCH_ENABLED:'false'},{LAUNCH_HOLD:'true'}]){const h=createHandler({env:{...env,...overrides},clock:()=>Date.parse(OPENS_AT)-1,clientFactory:factory});assert.equal((await request(h,'owner-config')).status,404);assert.equal((await request(h,'site-content',{token:'owner',ownerHeader:true})).status,503);}
 const h=createHandler({env,clock:()=>Date.parse(OPENS_AT),clientFactory:factory});assert.equal((await request(h,'owner-config')).status,404);assert.equal((await request(h,'config')).value.authEnabled,true);
 assert.ok(!countdownPage().includes('Owner sign-in'));assert.ok(countdownPage({ownerEntrance:true}).includes('href="/owner-sign-in.html"'));
 const proxy=fs.readFileSync('cinematic-preview/proxy.ts','utf8');assert.ok(proxy.includes('status:302'));assert.ok(proxy.includes('OWNER_PRELAUNCH_ENABLED'));
});
test('routing serves countdown despite forged query parameters, permits only temporary shells, and redirects them at launch',async()=>{
 const vm=require('node:vm'),esbuild=require('../cinematic-preview/node_modules/esbuild');let now=Date.parse(OPENS_AT)-1;
 const launch=require('../cinematic-preview/server/launch-clock.cjs');const out=esbuild.transformSync(fs.readFileSync('cinematic-preview/proxy.ts','utf8'),{loader:'ts',format:'cjs'}).code;
 const mod={exports:{}},runtimeEnv={...env};const box={module:mod,exports:mod.exports,Response,URL,process:{env:runtimeEnv},require:name=>name==='@vercel/functions'?{next:()=>new Response('next',{headers:{'x-test-next':'1'}})}:name.includes('launch-clock')?{launchState:e=>launch.launchState(e,now)}:name.includes('countdown-page')?{countdownPage}:require(name)};
 vm.runInNewContext(out,box);const proxy=mod.exports.default;
 for(const p of ['/','/care.html','/admin.html','/workspace.html','/sign-in.html','/services.html?owner=1']){const r=proxy({url:'https://example.com'+p,method:'GET'});assert.match(await r.text(),/Website and booking available:/);assert.match(r.headers.get('cache-control'),/no-store/);}
 assert.equal(proxy({url:'https://example.com/owner-sign-in.html',method:'GET'}).headers.get('x-test-next'),'1');
 runtimeEnv.OWNER_PRELAUNCH_ENABLED='false';assert.match(await proxy({url:'https://example.com/owner-sign-in.html',method:'GET'}).text(),/Website and booking available:/);
 now=Date.parse(OPENS_AT);const r=proxy({url:'https://example.com/owner-sign-in.html?token_hash=test-only',method:'GET'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/sign-in.html?token_hash=test-only');
 assert.equal(proxy({url:'https://example.com/',method:'GET'}).headers.get('x-test-next'),'1');
});

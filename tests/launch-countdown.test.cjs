const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const{OPENS_AT,launchState,effectiveEnv}=require('../cinematic-preview/server/launch-clock.cjs');
const{countdownPage}=require('../cinematic-preview/server/countdown-page.cjs');
const{createHandler}=require('../cinematic-preview/server/api.cjs');
const open=Date.parse(OPENS_AT),env={LAUNCH_COUNTDOWN_ENABLED:'true',LAUNCH_LOGIN_ENABLED:'true',AUTH_ENABLED:'false',BACKEND_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'};
async function call(h,route){let status,body;await h({url:'/api/app?route='+route,method:'GET',headers:{}},{setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}});return{status,body};}
test('launch is exactly 9 AM Atlanta Eastern, blocks before opening and releases at zero without redeployment',()=>{
 assert.equal(new Date(open).toISOString(),'2026-10-26T13:00:00.000Z');
 assert.equal(launchState(env,open-1).pending,true);assert.equal(launchState(env,open-1).remainingSeconds,1);
 assert.equal(launchState(env,open).pending,false);assert.equal(launchState(env,open+10000).remainingSeconds,0);
 assert.equal(effectiveEnv(env,open-1).AUTH_ENABLED,'false');assert.equal(effectiveEnv(env,open).AUTH_ENABLED,'true');
 assert.equal(effectiveEnv({...env,LAUNCH_HOLD:'true'},open).AUTH_ENABLED,'false');
 assert.equal(effectiveEnv({...env,LAUNCH_LOGIN_ENABLED:'false'},open).AUTH_ENABLED,'false');
});
test('pending countdown blocks all website APIs except clock/config, hides provider identifiers, and releases auth only at server deadline',async()=>{
 let now=open-1000,calls=0;const h=createHandler({env,clock:()=>now,clientFactory:()=>{calls++;throw Error('should require session first')}});
 const config=await call(h,'config');assert.equal(config.body.authEnabled,false);assert.equal(config.body.key,null);assert.equal(config.body.url,null);
 for(const route of ['catalog','site-content','bookings','customers','launch-preparation','public-policies'])assert.equal((await call(h,route)).status,503);
 assert.equal(calls,0);assert.equal((await call(h,'launch-status')).body.pending,true);
 now=open;assert.equal((await call(h,'config')).body.authEnabled,true);assert.equal((await call(h,'launch-status')).body.pending,false);
});
test('countdown page has no booking/customer content and no query-string bypass; routing covers direct page links',()=>{
 const html=countdownPage();assert.match(html,/Website and booking available:/);for(const x of ['days','hours','minutes','seconds'])assert.ok(html.includes('data-unit="'+x+'"'));
 assert.ok(!html.includes('hero.mp4'));assert.ok(!html.includes('service_spaces'));
 const proxy=fs.readFileSync('cinematic-preview/proxy.ts','utf8');assert.match(proxy,/launchState\(process.env\)/);assert.ok(!proxy.includes('searchParams'));assert.match(proxy,/no-store/);
});
test('browser clock follows server time despite wrong device clock and opens only after server confirms release',async()=>{
 let elapsed=0,interval,fetches=0,replaced;
 const nodes=Object.fromEntries(['days','hours','minutes','seconds'].map(k=>[k,{dataset:{unit:k}}])),status={};
 const box={document:{querySelectorAll:()=>Object.values(nodes),querySelector:()=>status,addEventListener(){}},performance:{now:()=>elapsed},window:{addEventListener(){}},location:{replace:u=>replaced=u},setInterval:f=>interval=f,fetch:async()=>({ok:true,json:async()=>({opensAt:OPENS_AT,serverNow:new Date(++fetches===1?open-2000:open).toISOString(),pending:fetches===1})})};
 vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/launch-countdown.js','utf8'),box);await new Promise(setImmediate);interval();assert.equal(nodes.seconds.textContent,'02');assert.equal(replaced,undefined);elapsed=3100;interval();await new Promise(setImmediate);assert.equal(replaced,'/');assert.equal(nodes.seconds.textContent,'00');
});

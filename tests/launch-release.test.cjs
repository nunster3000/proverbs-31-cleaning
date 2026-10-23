const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const launch=require('../cinematic-preview/server/launch-clock.cjs');
const {countdownPage}=require('../cinematic-preview/server/countdown-page.cjs');
const {createHandler}=require('../cinematic-preview/server/api.cjs');
const opening=Date.parse(launch.OPENS_AT);
const env={LAUNCH_COUNTDOWN_ENABLED:'true',LAUNCH_LOGIN_ENABLED:'true',OWNER_PRELAUNCH_ENABLED:'true',AUTH_ENABLED:'false',BACKEND_ENABLED:'true',SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-private'};
async function configAt(now){let result;await createHandler({env,clock:()=>now})({url:'/api/app?route=config',method:'GET',headers:{}},{setHeader(){},end(v){result=JSON.parse(v)}});return result;}
test('all public pages and email authentication release together at the exact Eastern launch boundary',async()=>{
 const esbuild=require('../cinematic-preview/node_modules/esbuild');
 let now=opening-1;const module={exports:{}};
 const source=esbuild.transformSync(fs.readFileSync('cinematic-preview/proxy.ts','utf8'),{loader:'ts',format:'cjs'}).code;
 vm.runInNewContext(source,{module,exports:module.exports,Response,URL,process:{env},require:name=>name==='@vercel/functions'?{next:()=>new Response('released',{headers:{'x-test-released':'yes'}})}:name.includes('owner-site-preview')?require('../cinematic-preview/server/owner-site-preview.cjs'):name.includes('launch-clock')?{launchState:e=>launch.launchState(e,now)}:name.includes('search-visibility')?{searchPolicy:(url,e)=>require('../cinematic-preview/server/search-visibility.cjs').searchPolicy(url,e,now)}:{countdownPage}});
 const pages=['/','/index.html','/services.html','/care.html','/sign-in.html','/workspace.html','/account.html','/admin.html','/contact.html'];
 for(const instant of [opening-1000,opening-1,opening,opening+1,opening+86400000]){
  now=instant;const released=now>=opening,config=await configAt(now);
  assert.equal(config.authEnabled,released);assert.equal(config.key,released?'test-public':null);
  for(const page of pages){const r=module.exports.default({url:'https://example.com'+page,method:'GET'});assert.equal(r.headers.get('x-test-released')==='yes',released,page+' at '+new Date(now).toISOString());if(!released){assert.match(await r.text(),/Website and booking available:/);assert.match(r.headers.get('cache-control'),/no-store/);}}
 }
 assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(opening),'5:00 AM');
});
test('released public login supports existing users and new registration without a password or code',async()=>{
 const config=await configAt(opening);let dialog,otp;
 function element(){return {append(...children){this.children=children},setAttribute(){},showModal(){dialog=this},addEventListener(){},remove(){},close(){}};}
 const location={origin:'https://example.com',pathname:'/sign-in.html'};
 const box={window:{location,createSupabaseClient:()=>({auth:{signInWithOtp:async request=>{otp=request;return {}},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},location,fetch:async()=>({ok:true,json:async()=>config}),document:{createElement:element,body:{append(){} }},Map,URLSearchParams};
 vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/backend-client.js','utf8'),box);
 box.window.P31Live.signIn('launch-customer@example.com');await new Promise(setImmediate);
 const send=dialog.children.find(n=>n.textContent==='Send sign-in email');assert.ok(send);await send.onclick();
 assert.equal(otp.email,'launch-customer@example.com');assert.equal(otp.options.shouldCreateUser,true);assert.equal(otp.options.emailRedirectTo,'https://example.com/sign-in.html');assert.equal(otp.password,undefined);
});

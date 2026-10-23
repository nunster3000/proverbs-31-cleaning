const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const preview=require('../cinematic-preview/server/owner-site-preview.cjs');
const env={OWNER_PRELAUNCH_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public'};
const token='eyJ'+'a'.repeat(90);
test('website preview requires a live verified-owner session; rejected, revoked and unavailable sessions fail closed',async()=>{
 let calls=0;const send=async(url,options)=>{calls++;assert.match(url,/rpc\/api_owner_preview_session$/);assert.equal(options.headers.Authorization,'Bearer '+token);return {ok:true,json:async()=>true};};
 assert.equal(await preview.verifyOwnerSession(env,token,send),true);
 for(const value of ['', 'forged', 'admin=true'])assert.equal(await preview.verifyOwnerSession(env,value,send),false);
 for(const flags of [{OWNER_PRELAUNCH_ENABLED:'false'},{LAUNCH_HOLD:'true'}])assert.equal(await preview.verifyOwnerSession({...env,...flags},token,send),false);
 assert.equal(calls,1);
 for(const send of [async()=>({ok:false}),async()=>({ok:true,json:async()=>false}),async()=>{throw Error('offline')}])assert.equal(await preview.verifyOwnerSession(env,token,send),false);
});
test('preview cookie is host-only, secure, HTTP-only and expires after 15 minutes; logout revokes the server auth session',async()=>{
 const cookie=preview.previewCookie(token);assert.match(cookie,/^__Host-/);for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Strict','Max-Age=900'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('Domain='));assert.equal(preview.tokenFromCookie('other=x; '+cookie),token);assert.match(preview.previewCookie(''),/Max-Age=0/);
 let called=false;await preview.closeOwnerSession(env,token,async(url,o)=>{called=true;assert.match(url,/auth\/v1\/logout\?scope=local$/);assert.equal(o.headers.Authorization,'Bearer '+token);return{ok:true}});assert.equal(called,true);
 await assert.rejects(preview.closeOwnerSession(env,token,async()=>({ok:false,status:500})),/retry/);
});
test('page gate allows only verified owner cookies before launch and marks the response private',async()=>{
 const esbuild=require('../cinematic-preview/node_modules/esbuild'),launch=require('../cinematic-preview/server/launch-clock.cjs');
 let active=false,now=Date.parse(launch.OPENS_AT)-1;const mod={exports:{}},runtimeEnv={...env,LAUNCH_COUNTDOWN_ENABLED:'true'};
 const code=esbuild.transformSync(fs.readFileSync('cinematic-preview/proxy.ts','utf8'),{loader:'ts',format:'cjs'}).code;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,URL,Response,process:{env:runtimeEnv},require:n=>n==='@vercel/functions'?{next:o=>new Response('website',o)}:n.includes('owner-site-preview')?{...preview,verifyOwnerSession:async()=>active}:n.includes('launch-clock')?{launchState:e=>launch.launchState(e,now)}:n.includes('countdown-page')?require('../cinematic-preview/server/countdown-page.cjs'):n.includes('search-visibility')?{searchPolicy:()=>({headers:{}})}:require(n)});
 const request=new Request('https://example.com/services.html',{headers:{cookie:preview.COOKIE+'='+token}});
 assert.match(await(await mod.exports.default(request)).text(),/Website and booking available:/);
 active=true;const r=await mod.exports.default(request);assert.equal(await r.text(),'website');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');
 active=false;assert.match(await(await mod.exports.default(request)).text(),/Website and booking available:/);
 now=Date.parse(launch.OPENS_AT);assert.equal(await(await mod.exports.default(request)).text(),'website');
});
test('both dashboards share a named logout button, with mobile touch targets and cleanup before redirect',()=>{
 const html=fs.readFileSync('cinematic-preview/workspace.html','utf8'),js=fs.readFileSync('cinematic-preview/assets/workspace.js','utf8');assert.match(html,/id="sign-out"[^>]*>Log out<\/button>/);assert.match(js,/owner-site-exit/);assert.match(js,/auth.signOut\(\)/);assert.match(fs.readFileSync('cinematic-preview/assets/admin.css','utf8'),/#sign-out[^}]*min-height:44px/);
});
test('preview API rejects cross-origin changes and customer sessions, and clears the cookie on logout',async()=>{
 const {createHandler}=require('../cinematic-preview/server/api.cjs'),launch=require('../cinematic-preview/server/launch-clock.cjs');
 const original=global.fetch;let active=true,revoked=false;
 global.fetch=async url=>url.includes('/logout?')?(revoked=true,{ok:true}):({ok:true,json:async()=>active});
 const h=createHandler({env:{...env,APP_ORIGIN:'https://example.com',LAUNCH_COUNTDOWN_ENABLED:'true'},clock:()=>Date.parse(launch.OPENS_AT)-1000});
 async function req(route,{origin='https://example.com',cookie='',bearer=token,method='POST'}={}){let status,body,headers={};await h({url:'/api/app?route='+route,method,headers:{origin,cookie,authorization:'Bearer '+bearer},body:{}},{setHeader:(k,v)=>headers[k]=v,set statusCode(v){status=v},end:v=>body=JSON.parse(v)});return{status,body,headers};}
 try{
  assert.equal((await req('owner-site-session',{origin:'https://attacker.example'})).status,403);
  active=false;assert.equal((await req('owner-site-session')).status,403);
  active=true;const r=await req('owner-site-session');assert.equal(r.status,200);assert.match(r.headers['Set-Cookie'],/HttpOnly/);
  const end=await req('owner-site-exit',{cookie:preview.COOKIE+'='+token});assert.equal(end.status,200);assert.equal(revoked,true);assert.match(end.headers['Set-Cookie'],/Max-Age=0/);
 }finally{global.fetch=original;}
});

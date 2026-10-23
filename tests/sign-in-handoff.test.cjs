const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('cinematic-preview/assets/sign-in.js','utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function page({ownerPreview=true,role='owner',callbackReceived=false,callbackError,session=null}={}){
 const button={},email={},status={},events={},redirects=[];let listener,reads=0,calls=0,current=session;
 const form={querySelector:()=>button,reportValidity:()=>true};
 const P31Live={init:async()=>({enabled:true,authEnabled:true,ownerPreview,callbackReceived,callbackError}),api:async()=>{calls++;return{role}},client:{auth:{getSession:async()=>{reads++;return{data:{session:current}}},onAuthStateChange:f=>{listener=f}}}};
 const context={document:{querySelector:s=>({'#email-form':form,'#sign-in-email':email,'#sign-in-status':status}[s])},P31Live,window:{addEventListener:(e,f)=>events[e]=f},location:{search:'',hash:'',replace:p=>redirects.push(p)},history:{replaceState(){}},URLSearchParams,setTimeout};
 return{run:()=>vm.runInNewContext(source,context),emit:(event,s)=>{current=s;listener?.(event,s)},events,status,redirects,counts:()=>({reads,calls}),P31Live};
}
const session={user:{is_anonymous:false}};
test('a late INITIAL_SESSION opens the admin dashboard without reloading',async()=>{
 const p=page();await p.run();assert.deepEqual(p.redirects,[]);p.emit('INITIAL_SESSION',session);await new Promise(r=>setTimeout(r,10));assert.deepEqual(p.redirects,['owner-preview.html']);assert.equal(p.status.textContent,'Opening your dashboard…');
});
test('session hydration after a callback is retried without another email request',async()=>{
 const p=page({callbackReceived:true});const running=p.run();await settle();p.emit('INITIAL_SESSION',session);await running;assert.deepEqual(p.redirects,['owner-preview.html']);
});
test('overlapping auth events produce one verified redirect; customer and anonymous sessions cannot enter the owner dashboard',async()=>{
 const p=page();await p.run();for(const event of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'])p.emit(event,session);await new Promise(r=>setTimeout(r,10));assert.deepEqual(p.redirects,['owner-preview.html']);assert.equal(p.counts().calls,1);
 const customer=page({role:'customer',session});await customer.run();assert.deepEqual(customer.redirects,[]);
 const anonymous=page({session:{user:{is_anonymous:true}}});await anonymous.run();assert.deepEqual(anonymous.redirects,[]);assert.equal(anonymous.counts().calls,0);
 const regular=page({ownerPreview:false,role:'customer',session});await regular.run();assert.deepEqual(regular.redirects,['workspace.html']);
});
test('returning to the sign-in tab resumes its newly established session automatically',async()=>{
 const p=page();await p.run();p.emit('IGNORED',session);p.events.focus();await new Promise(r=>setTimeout(r,10));assert.deepEqual(p.redirects,['owner-preview.html']);
});
test('backend initialization cannot return partially initialized configuration to concurrent callers',async()=>{
 const code=fs.readFileSync('cinematic-preview/assets/backend-client.js','utf8');let release,created=0;const config={enabled:true,authEnabled:true};
 const context={window:{location:{pathname:'/sign-in.html'},createSupabaseClient:()=>{created++;return{auth:{}}}},location:{search:''},URLSearchParams,fetch:async()=>({ok:true,json:()=>new Promise(r=>release=()=>r(config))}),Map,WeakMap,Set,console,setTimeout,clearTimeout};
 vm.runInNewContext(code,context);const a=context.window.P31Live.init();await settle();const b=context.window.P31Live.init();assert.equal(a,b);assert.equal(created,0);release();await a;assert.equal(created,1);assert.equal(context.window.P31Live.client.auth!==undefined,true);
});

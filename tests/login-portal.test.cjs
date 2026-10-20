const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../cinematic-preview');
const code=fs.readFileSync(path.join(root,'assets/sign-in.js'),'utf8');
async function portal({enabled=true,session=null,role='customer',verification=true,authError=false}={}) {
  const button={disabled:true},email={disabled:true,value:'customer@example.com'},status={};
  const form={querySelector:()=>button,reportValidity:()=>true};
  const nodes={'#email-form':form,'#sign-in-email':email,'#sign-in-status':status};
  const redirects=[],calls=[];
  const context={
    document:{querySelector:s=>nodes[s]},
    location:{search:'',hash:'',replace:v=>redirects.push(v)},history:{replaceState(){}},
    URLSearchParams,setTimeout,
    P31Live:{init:async()=>({enabled,authEnabled:enabled}),api:async route=>{calls.push(route);return {role}},
      signIn:async()=>verification,
      client:{auth:{getSession:async()=>({data:{session},error:authError?new Error('unavailable'):null}),onAuthStateChange(){}}}}
  };
  await vm.runInNewContext(code,context);
  return {button,email,status,form,redirects,calls};
}
test('unconfigured login is disabled and never fabricates an account',async()=>{
 const p=await portal({enabled:false});
 assert.equal(p.button.disabled,true);assert.equal(p.email.disabled,true);
 assert.match(p.status.textContent,/being prepared/);assert.deepEqual(p.redirects,[]);
});
test('customers and owners use the same verified session and server role lookup',async()=>{
 for(const role of ['customer','owner']){
  const p=await portal({role,session:{user:{is_anonymous:false}}});
  assert.deepEqual(p.calls,['me']);assert.deepEqual(p.redirects,['workspace.html']);
 }
});
test('anonymous visitors cannot enter a workspace and cancelled verification never signs in',async()=>{
 const p=await portal({session:{user:{is_anonymous:true}},verification:false});
 assert.equal(p.button.disabled,false);assert.deepEqual(p.redirects,[]);
 await p.form.onsubmit({preventDefault(){}});
 assert.deepEqual(p.calls,[]);assert.deepEqual(p.redirects,[]);assert.equal(p.button.disabled,false);
});
test('successful email verification checks the server role before entering the account',async()=>{
 const p=await portal();await p.form.onsubmit({preventDefault(){}});
 assert.deepEqual(p.calls,['me']);assert.deepEqual(p.redirects,['workspace.html']);
});
test('authentication failure keeps the portal closed',async()=>{
 const p=await portal({authError:true});assert.equal(p.button.disabled,true);
 assert.match(p.status.textContent,/temporarily unavailable/);assert.deepEqual(p.redirects,[]);
});
test('retired destinations contain no demo records and planner scripts remain syntactically valid',()=>{
 for(const name of ['admin','account','final-payment']){
  const html=fs.readFileSync(path.join(root,name+'.html'),'utf8');
  assert.match(html,/workspace.html/);assert.doesNotMatch(html,/admin-store|Jordan Taylor|localStorage/);
 }
 const care=fs.readFileSync(path.join(root,'care.html'),'utf8');
 assert.doesNotMatch(care,/demoCustomer|saveDemoJourney|showDemoLink|admin-store.js|P31Admin/);
 for(const match of care.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});

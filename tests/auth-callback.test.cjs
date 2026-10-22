const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function helper(){const c={window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/auth-callback.js','utf8'),c);return c.window.P31AuthCallback;}
test('direct email callbacks establish a session without a PKCE verifier and remove credentials from the URL',async()=>{
 const h=helper(),scrub=[];const c=h.take({search:'',hash:'#access_token=fake-access&refresh_token=fake-refresh',pathname:'/sign-in.html'},{replaceState:(a,b,url)=>scrub.push(url)});
 let seen;await h.finish({setSession:async args=>{seen=args;return {error:null}}},c);assert.equal(seen.access_token,'fake-access');assert.deepEqual(scrub,['/sign-in.html']);
});
test('token-hash callbacks verify email and expired links fail without a fake session',async()=>{
 const h=helper();let seen;await h.finish({verifyOtp:async args=>{seen=args;return {error:null}}},{tokenHash:'test-only-hash'});assert.equal(seen.type,'email');
 await assert.rejects(()=>h.finish({}, {error:true}),/expired/);await assert.rejects(()=>h.finish({}, {accessToken:'incomplete'}),/incomplete/);
 await assert.rejects(()=>h.finish({verifyOtp:async()=>({error:Error('secret diagnostic')})},{tokenHash:'bad'}),/could not be verified/);
});
test('ordinary PKCE callback codes are left to the SDK, and error URLs are scrubbed',()=>{
 const h=helper();let cleaned;h.take({search:'?code=fake-pkce-code',hash:'',pathname:'/sign-in.html'},{replaceState(){throw Error('PKCE callback must remain')}});
 const r=h.take({search:'?error=expired&error_description=private',hash:'',pathname:'/sign-in.html'},{replaceState:(a,b,u)=>cleaned=u});assert.equal(r.error,true);assert.equal(cleaned,'/sign-in.html');
});

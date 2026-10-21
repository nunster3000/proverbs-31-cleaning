const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const config=JSON.parse(fs.readFileSync('cinematic-preview/vercel.json','utf8'));
test('deployment prevents foreign framing and unsafe document embedding',()=>{
 const headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key.toLowerCase(),h.value]));
 assert.equal(headers['x-frame-options'],'SAMEORIGIN');
 for(const directive of ["base-uri 'self'","object-src 'none'","frame-ancestors 'self'","form-action 'self'"])assert.ok(headers['content-security-policy'].includes(directive));
 assert.equal(headers['x-content-type-options'],'nosniff');
 assert.equal(headers['x-robots-tag'],'noindex, nofollow');
});
test('private page shells prohibit storage in caches and suppress referrers',()=>{
 const rule=config.headers.find(r=>r.source.includes('(guest|workspace|account|admin|sign-in|auth-callback)'));
 assert.ok(rule);const pattern=new RegExp('^'+rule.source+'$');
 for(const page of ['guest','workspace','account','admin','sign-in'])assert.match('/'+page+'.html',pattern);
 assert.ok(rule.headers.some(h=>h.key==='Cache-Control' && h.value==='no-store'));
 assert.ok(rule.headers.some(h=>h.key==='Referrer-Policy' && h.value==='no-referrer'));
});

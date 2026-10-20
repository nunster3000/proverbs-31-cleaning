const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('cinematic-preview');
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
const visible=html=>html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
test('published page copy contains no fictional customer or demonstration messaging',()=>{
 for(const page of pages){const text=visible(fs.readFileSync(path.join(root,page),'utf8'));assert.doesNotMatch(text,/\bdemo(?:nstration)?\b|Alice Example|Jamie Taylor|555-0100|example\.com|mock payment|sample booking/i,page)}
});
test('contact page uses the confirmed owner name and email and no unpublished phone number',()=>{
 const html=fs.readFileSync(path.join(root,'contact.html'),'utf8');assert.match(visible(html),/Gabrielle Jackson/);assert.match(html,/mailto:gabriellejackson@proverbs31cleaningcoservices\.info/);assert.doesNotMatch(html,/346|869-2479|tel:/);assert.match(visible(html),/based on distance/);
});
test('service information explains review and deposit rules without invented fees or refund guarantees',()=>{
 const text=visible(fs.readFileSync(path.join(root,'service-information.html'),'utf8'));assert.match(text,/50% of the starting service price, before optional add-ons/);assert.match(text,/appointment remains unchanged until the company approves/);assert.match(text,/does not automatically apply cancellation fees or issue refunds/);assert.match(text,/not yet enabled/);assert.doesNotMatch(text,/non.?refundable|24.hour|48.hour|guaranteed refund/i);
});
test('public page navigation does not point to missing local pages',()=>{
 for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8');for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)){const href=match[1];if(/^(?:https?:|mailto:|tel:|#)/i.test(href))continue;const target=href.split(/[?#]/)[0];if(!target)continue;assert.ok(fs.existsSync(path.resolve(root,target.replace(/^\//,''))),page+' → '+href)}}
});

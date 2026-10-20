const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/workflow-tools.js','utf8'),context);const W=context.window.P31Workflow;
test('walkthrough validation enforces supported formats, individual size, count, and total quota',()=>{
 assert.equal(W.validateFile({type:'image/jpeg',size:100}),true);
 assert.throws(()=>W.validateFile({type:'image/heic',size:100}),/HEIC/);
 assert.throws(()=>W.validateFile({type:'video/mp4',size:21*1024*1024}),/20 MB/);
 assert.throws(()=>W.validateFile({type:'image/png',size:100},Array.from({length:6},()=>({bytes:100,status:'ready'}))),/6 files/);
 assert.throws(()=>W.validateFile({type:'video/mp4',size:20*1024*1024},[{bytes:70*1024*1024,status:'pending'}]),/80 MB/);
 assert.equal(W.validateFile({type:'image/png',size:100},Array.from({length:6},()=>({bytes:100,status:'deleted'}))),true);
});
test('pricing comparison includes adjustments before review and never confuses a deposit due with paid money',()=>{
 const b={quote_snapshot:{total_cents:11000},quote_adjustments:[{cents:2500},{cents:-500}],final_cents:null,deposit_paid_cents:0,final_paid_cents:0};
 assert.equal(W.totals(b).total,13000);assert.equal(W.totals(b).balance,13000);assert.equal(W.totals(b).paid,0);
 b.final_cents=13000;b.deposit_paid_cents=5500;
 assert.equal(W.totals(b).balance,7500);assert.equal(W.totals(b).difference,2000);
});
const {renderEmail,kinds}=require('../cinematic-preview/server/email-templates.cjs');
const booking={id:'ref-123',visit_date:'2026-11-01',arrival:'09:00-12:00',quote_snapshot:{service:'Deep Cleaning',space:'1 Bedroom',total_cents:21000},final_cents:23000,deposit_paid_cents:10500,final_paid_cents:0,quote_adjustments:[{label:'Extra care <script>alert(1)</script>',cents:2000}]};
test('all queued notification kinds render without sending and guest emails do not promise portal access',()=>{
 for(const kind of kinds){const email=renderEmail(kind,booking);assert.ok(email.subject);assert.match(email.text,/ref-123/);assert.match(email.html,/contact.html/);assert.doesNotMatch(email.html,/workspace.html/);}
 const quote=renderEmail('quote_ready',booking,{accountEnabled:true});assert.match(quote.html,/&lt;script&gt;/);assert.doesNotMatch(quote.html,/<script>/);assert.match(quote.html,/workspace.html/);
 const balance=renderEmail('final_balance_ready',booking);assert.match(balance.text,/\$125.00/);assert.match(balance.text,/online payment processing is not available/i);
});
test('upload retries reuse their pending reservation instead of consuming another file slot',async()=>{
 let reservations=0,transfers=0,finishes=0;
 const file={name:'room.jpg',type:'image/jpeg',size:100};
 const client={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},storage:{from:()=>({uploadToSignedUrl:async()=>({error:++transfers===1?Error('network interruption'):null})})}};
 const ctx={URLSearchParams,window:{createSupabaseClient:()=>client},fetch:async(url,options)=>{
  if(url.includes('route=config'))return{ok:true,json:async()=>({enabled:true,authEnabled:true,url:'https://project.supabase.co',key:'public'})};
  if(url.includes('route=upload-finish')){finishes++;return{ok:finishes>1,status:400,json:async()=>finishes>1?{saved:true}:{error:'file not present'}};}
  reservations++;return{ok:true,json:async()=>({file:{id:'file-id'},path:'path',token:'scoped'})};
 }};
 vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/backend-client.js','utf8'),ctx);
 const L=ctx.window.P31Live;
 await assert.rejects(()=>L.upload('booking',file,'Bedroom'),/network interruption/);
 await L.upload('booking',file,'Bedroom');
 assert.equal(reservations,1);assert.equal(transfers,2);assert.equal(finishes,2);
});

test('customer progress starts only after the required deposit and confirmation requires owner approval',()=>{
 const b={status:'requested',quote_snapshot:{deposit_cents:5500},deposit_paid_cents:0,walkthrough_approved:false};assert.equal(W.milestone(b),-1);b.deposit_paid_cents=5500;assert.equal(W.milestone(b),0);b.status='confirmed';assert.equal(W.milestone(b),0);b.walkthrough_approved=true;assert.equal(W.milestone(b),1);b.status='in_progress';assert.equal(W.milestone(b),3);
});

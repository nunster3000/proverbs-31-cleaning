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

test('admin sync detects new bookings, uploaded files, and customer approval without treating unchanged snapshots as changes',()=>{
 const before={records:[{id:'one',quote_status:'awaiting_approval',walkthrough_files:[]}],state:{activity:[]},customers:[],pricing:null};
 const packet={rows:JSON.parse(JSON.stringify(before.records)),ownerState:{activity:[]},people:[],catalog:null};
 assert.equal(W.syncChanges(before,packet).any,false);
 packet.rows.push({id:'two'});assert.equal(W.syncChanges(before,packet).newBookings,true);
 packet.rows=JSON.parse(JSON.stringify(before.records));packet.rows[0].walkthrough_files=[{id:'photo',status:'ready'}];assert.equal(W.syncChanges(before,packet).uploads,true);
 packet.rows=JSON.parse(JSON.stringify(before.records));packet.rows[0].quote_status='accepted';assert.equal(W.syncChanges(before,packet).approvals,true);
 packet.rows=JSON.parse(JSON.stringify(before.records));packet.ownerState.activity=[{id:'outside-page',action:'booking_created'}];assert.equal(W.syncChanges(before,packet).newBookings,true);
 packet.ownerState={activity:[],days:[{visit_date:'2026-10-23',windows:[]}]};assert.equal(W.syncChanges(before,packet).any,true);
});

test('mobile upload validation accepts every supported format at the exact limits and rejects empty/oversized files',()=>{
 const MB=1024*1024;
 for(const type of W.types)assert.equal(W.validateFile({type,size:20*MB}),true,type);
 for(const size of [0,20*MB+1])assert.throws(()=>W.validateFile({type:'video/quicktime',size}),/20 MB/);
 assert.equal(W.validateFile({type:'video/mp4',size:20*MB},Array.from({length:3},()=>({status:'ready',bytes:20*MB}))),true);
 assert.throws(()=>W.validateFile({type:'image/jpeg',size:1},Array.from({length:4},()=>({status:'pending',bytes:20*MB}))),/80 MB/);
 assert.equal(W.validateFile({type:'image/jpeg',size:1},Array.from({length:5},()=>({status:'ready',bytes:1}))),true);
});

function uploadHarness({outcomes=['success'],finishFailures=0,url='https://project.supabase.co/storage/v1/object/upload/sign/walkthroughs/test?token=scoped'}={}){
 const calls={reserve:0,transfer:0,finish:0,remove:0,events:[]};
 class XHR{
  upload={};open(method,target){assert.equal(method,'PUT');calls.target=target}setRequestHeader(k,v){calls[k]=v}
  send(body){calls.transfer++;assert.equal(this.timeout,180000);assert.equal(body.parts[1][1].name,'room.mov');this.upload.onprogress?.({lengthComputable:true,loaded:50,total:100});const outcome=outcomes.shift() || 'success';queueMicrotask(()=>{if(outcome==='network')this.onerror();else if(outcome==='timeout')this.ontimeout();else{this.status=outcome==='http'?500:200;this.onload()}})}
 }
 class Form{parts=[];append(...a){this.parts.push(a)}}
 const client={auth:{getSession:async()=>({data:{session:{access_token:'private-session'}}})}};
 const ctx={URL,URLSearchParams,XMLHttpRequest:XHR,FormData:Form,window:{createSupabaseClient:()=>client},fetch:async(target,options)=>{
  if(target.includes('route=config'))return{ok:true,json:async()=>({enabled:true,authEnabled:true,url:'https://project.supabase.co',key:'public'})};
  if(target.includes('route=upload-delete')){calls.remove++;return{ok:true,json:async()=>({removed:true})}}
  if(target.includes('route=upload-finish')){calls.finish++;const fail=calls.finish<=finishFailures;return{ok:!fail,status:422,json:async()=>fail?{error:'Verification failed'}:{status:'ready'}}}
  calls.reserve++;return{ok:true,json:async()=>({file:{id:'reservation'},signed_url:url})};
 }};
 vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/backend-client.js','utf8'),ctx);
 return{L:ctx.window.P31Live,calls,file:{name:'room.mov',type:'video/quicktime',size:100},progress:e=>calls.events.push(e)};
}
test('mobile XHR upload reports progress and verifies before success',async()=>{
 const h=uploadHarness();assert.equal((await h.L.upload('booking',h.file,'Bedroom','Keep these notes',h.progress)).status,'ready');assert.equal(h.calls.reserve,1);assert.equal(h.calls.transfer,1);assert.equal(h.calls.finish,1);assert.equal(h.calls['x-upsert'],'false');assert.ok(h.calls.events.some(e=>e.percent===50));assert.equal(h.calls.events.at(-1).stage,'complete');
});
for(const failure of ['network','timeout','http'])test('upload survives '+failure+' failure without duplicate reservations',async()=>{
 const h=uploadHarness({outcomes:[failure,'success'],finishFailures:1});await assert.rejects(()=>h.L.upload('booking',h.file,'Kitchen','Saved notes',h.progress),/interrupted/);assert.ok(!h.calls.events.some(e=>e.stage==='complete'));await h.L.upload('booking',h.file,'Kitchen','Saved notes',h.progress);assert.equal(h.calls.reserve,1);assert.equal(h.calls.transfer,2);assert.equal(h.calls.finish,2);
});
test('a lost transfer response succeeds only if server verification finds the uploaded file',async()=>{
 const h=uploadHarness({outcomes:['network']});await h.L.upload('booking',h.file,'Kitchen');assert.equal(h.calls.reserve,1);assert.equal(h.calls.finish,1);
});
test('verification retry reuses the transferred object and preserves its reservation',async()=>{
 const h=uploadHarness({finishFailures:1});await assert.rejects(()=>h.L.upload('booking',h.file,'Kitchen'),/Verification/);await h.L.upload('booking',h.file,'Kitchen');assert.equal(h.calls.reserve,1);assert.equal(h.calls.transfer,1);assert.equal(h.calls.finish,2);
});
test('upload rejects a signed destination outside its own storage project',async()=>{
 const h=uploadHarness({url:'https://attacker.example/storage/v1/object/upload/sign/stolen',finishFailures:10});await assert.rejects(()=>h.L.upload('booking',h.file,'Kitchen'),/Invalid upload destination/);assert.equal(h.calls.transfer,0);
});

function heicWorkflow(convert){const ctx={window:{P31ConvertHEIC:convert},File};vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/workflow-tools.js','utf8'),ctx);return ctx.window.P31Workflow}
test('HEIC selection becomes a named JPEG before upload, preserving the original file',async()=>{
 const source=new File(['heic-source'],'Kitchen.HEIC',{type:'image/heic',lastModified:1234}),events=[];let received;
 const w=heicWorkflow(async f=>{received=f;return new Blob(['jpg'],{type:'image/jpeg'})});const out=await w.prepareFile(source,[],s=>events.push(s));
 assert.equal(received,source);assert.equal(out.name,'Kitchen.jpg');assert.equal(out.type,'image/jpeg');assert.equal(out.lastModified,1234);assert.equal(source.name,'Kitchen.HEIC');assert.match(events[0],/Converting/);assert.match(events.at(-1),/Ready/);assert.equal(w.validateFile(out),true);
});
test('HEIF extensions and iPhone MIME variants convert; ordinary photos/videos bypass the decoder',async()=>{
 let conversions=0;const w=heicWorkflow(async()=>{conversions++;return new Blob(['jpg'],{type:'image/jpeg'})});
 for(const [name,type]of [['room.heif',''],['room.heic','application/octet-stream'],['photo','image/heif'],['photo','image/heic-sequence']])assert.equal((await w.prepareFile(new File(['source'],name,{type}))).type,'image/jpeg');
 assert.equal(conversions,4);const jpg=new File(['jpg'],'photo.jpg',{type:'image/jpeg'}),video=new File(['mp4'],'clip.mp4',{type:'video/mp4'});assert.equal(await w.prepareFile(jpg),jpg);assert.equal(await w.prepareFile(video),video);assert.equal(conversions,4);
});
test('HEIC conversion enforces source and converted quotas and reports decoder failures safely',async()=>{
 let calls=0;const w=heicWorkflow(async()=>{calls++;return new Blob([new Uint8Array(20*1024*1024+1)],{type:'image/jpeg'})});
 await assert.rejects(()=>w.prepareFile({name:'large.heic',size:20*1024*1024+1}),/20 MB/);assert.equal(calls,0);
 await assert.rejects(()=>w.prepareFile({name:'room.heic',size:100},Array.from({length:6},()=>({bytes:1,status:'ready'}))),/6 files/);assert.equal(calls,0);
 await assert.rejects(()=>w.prepareFile({name:'room.heic',size:100}),/20 MB/);assert.equal(calls,1);
 const broken=heicWorkflow(async()=>{throw Error('internal decoder details')});await assert.rejects(()=>broken.prepareFile({name:'broken.heic',size:100}),/couldn’t convert/);
 const invalid=heicWorkflow(async()=>new Blob(['invalid'],{type:'image/png'}));await assert.rejects(()=>invalid.prepareFile({name:'broken.heic',size:100}),/couldn’t convert/);
});
test('converter downloads only on HEIC selection and a failed download can be retried',async()=>{
 let loads=0;const ctx={File,window:{},document:{createElement:()=>({remove(){}}),head:{append(script){loads++;assert.equal(script.src,'/assets/heic-converter.js');queueMicrotask(()=>{if(loads===1)script.onerror();else{ctx.window.P31ConvertHEIC=async()=>new Blob(['jpg'],{type:'image/jpeg'});script.onload()}})}}}};
 vm.runInNewContext(fs.readFileSync('cinematic-preview/assets/workflow-tools.js','utf8'),ctx);const w=ctx.window.P31Workflow;
 await w.prepareFile(new File(['jpg'],'plain.jpg',{type:'image/jpeg'}));assert.equal(loads,0);
 const file=new File(['heic'],'room.heic',{type:'image/heic'});await assert.rejects(()=>w.prepareFile(file),/couldn’t convert/);assert.equal((await w.prepareFile(file)).type,'image/jpeg');assert.equal(loads,2);
});

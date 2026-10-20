const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box={window:{}};vm.createContext(box);vm.runInContext(fs.readFileSync('cinematic-preview/assets/workflow-tools.js','utf8'),box);box.P31Workflow=box.window.P31Workflow;vm.runInContext(fs.readFileSync('cinematic-preview/assets/booking-checklist.js','utf8'),box);const items=box.window.P31Checklist.items;
const booking=()=>({id:'test',status:'requested',quote_snapshot:{deposit_cents:5500,total_cents:11000},deposit_paid_cents:0,final_paid_cents:0,final_cents:null,quote_status:'not_reviewed',walkthrough_files:[],quote_adjustments:[],reviewed:false,walkthrough_approved:false,invoice_issued:false});
const find=(b,id)=>items(b).find(r=>r.id===id);
test('checklist follows deposit, verified walkthrough, review, price, access, visit and payment evidence',()=>{
 const b=booking();assert.equal(items(b).length,7);assert.equal(find(b,'deposit').state,'action');assert.equal(find(b,'review').state,'waiting');assert.equal(find(b,'payment').done,false);
 b.deposit_paid_cents=5499;assert.equal(find(b,'deposit').done,false);b.deposit_paid_cents=5500;assert.equal(find(b,'deposit').done,true);assert.equal(find(b,'deposit').action,'View deposit');
 b.walkthrough_files=[{status:'pending',purpose:'walkthrough'},{status:'ready',purpose:'completion'},{status:'deleted',purpose:'walkthrough'}];assert.equal(find(b,'walkthrough').done,false);
 b.walkthrough_files.push({status:'ready',purpose:'walkthrough'});assert.equal(find(b,'walkthrough').done,true);assert.equal(find(b,'review').done,false);
 b.reviewed=true;b.walkthrough_approved=true;b.status='confirmed';b.final_cents=14000;b.quote_status='awaiting_approval';assert.equal(find(b,'review').done,true);assert.equal(find(b,'price').state,'action');assert.equal(find(b,'access').state,'action');
 b.quote_status='accepted';b.access_signed_at='2026-10-20T12:00:00Z';assert.equal(find(b,'price').done,true);assert.equal(find(b,'access').done,true);
 b.status='completed';assert.equal(find(b,'visit').done,true);assert.equal(find(b,'payment').done,false);b.invoice_issued=true;assert.equal(find(b,'payment').state,'action');b.final_paid_cents=8500;assert.equal(find(b,'payment').done,true);
 b.quote_status='awaiting_approval';b.final_cents=15000;assert.equal(find(b,'price').done,false);assert.equal(find(b,'payment').state,'action');b.access_signed_at=null;assert.equal(find(b,'access').done,false);
});
test('external walkthrough review counts as received, cancellation removes calls to action, and zero balance waits for a reviewed total',()=>{
 const b=booking();b.reviewed=true;assert.equal(find(b,'walkthrough').done,true);b.status='cancelled';assert.ok(items(b).every(r=>r.action===null));assert.ok(items(b).filter(r=>!r.done).every(r=>r.state==='cancelled'));
 const full=booking();full.deposit_paid_cents=11000;assert.equal(find(full,'payment').done,false);full.final_cents=11000;full.status='completed';assert.equal(find(full,'payment').done,true);
});

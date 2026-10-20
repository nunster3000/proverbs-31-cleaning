const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('cinematic-preview/assets/service-catalog.js', 'utf8'),context);
const P = context.window.P31;
test('every whole-home deep cleaning adds exactly $100 to its standard starting price', () => {
  for (let space=2;space<8;space++) {
    const standard=P.quote({space,service:'Standard Cleaning'});
    const deep=P.quote({space,service:'Deep Cleaning'});
    assert.equal(deep.base-standard.base,100);
    assert.equal(deep.deposit,deep.base/2);
  }
});
test('deep kitchen focus includes appliances and baseboards without double billing', () => {
  const q=P.quote({space:3,service:'Deep Cleaning',focus:['Kitchen'],extras:{fridge:true,oven:true,baseboards:true,laundry:2}});
  assert.equal(q.total,250); assert.equal(q.deposit,105); assert.equal(q.remaining,145);
  assert.equal(q.addonsTotal,40); assert.equal(q.included.length,3);
});
test('removing deep kitchen focus restores selected appliance add-on charges', () => {
  const q=P.quote({space:3,service:'Deep Cleaning',extras:{fridge:true,oven:true,baseboards:true}});
  assert.equal(q.total,370);assert.equal(q.addonsTotal,160);
});
test('standard extras are itemized and do not inflate the starting-price deposit', () => {
  const q=P.quote({space:3,service:'Standard Cleaning',extras:{fridge:true,oven:true,baseboards:true,laundry:2}});
  assert.equal(q.total,355);assert.equal(q.deposit,55);assert.equal(q.remaining,300);
});
test('guest suites belong to Airbnb turnover and retain approved size-based starting prices', () => {
  assert.equal(P.quote({space:0,service:'Airbnb Turnover'}).base,65);
  assert.equal(P.quote({space:1,service:'Airbnb Turnover',extras:{laundry:1}}).total,70);
  assert.throws(()=>P.quote({space:0,service:'Standard Cleaning'}));
  assert.throws(()=>P.quote({space:3,service:'Airbnb Turnover'}));
});
test('apartment move cleaning uses standard size-based starting prices', () => {
  assert.equal(P.quote({space:2,service:'Apartment Cleaning'}).base,85);
  assert.equal(P.quote({space:3,service:'Apartment Cleaning'}).base,110);
});

test('backend catalog updates all displayed prices atomically without changing inclusion rules', async () => {
  const ctx={window:{}};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('cinematic-preview/assets/service-catalog.js','utf8'),ctx);
  const p=ctx.window.P31;
  const catalog={
    spaces:p.spaces.map((s,id)=>({id,label:s.label,base_cents:(s.price+10)*100,suite:!!s.suite})),
    services:['standard','deep','apartment','airbnb'].map((id,i)=>({id,label:p.services[i],upgrade_cents:id==='deep'?12000:0})),
    addons:p.addons.map(a=>({id:a.id,label:a.label,cents:(a.price+5)*100,per_load:a.id==='laundry'}))
  };
  p.applyCatalog(catalog);
  const q=p.quote({space:3,service:'Deep Cleaning',focus:['Kitchen'],extras:{laundry:2,oven:true}});
  assert.equal(q.base,240);assert.equal(q.total,290);assert.equal(q.deposit,120);
  const invalid=JSON.parse(JSON.stringify(catalog));invalid.addons[0].cents=-1;invalid.spaces[3].base_cents=99900;
  assert.throws(()=>p.applyCatalog(invalid),/invalid/);assert.equal(p.spaces[3].price,120);
  assert.throws(()=>p.applyCatalog({...catalog,spaces:catalog.spaces.slice(1)}),/unavailable/);
  ctx.window.P31Live={init:async()=>({enabled:true}),api:async()=>{throw new Error('Connection unavailable')}};
  await assert.rejects(()=>p.loadCatalog(),/Connection unavailable/);
});

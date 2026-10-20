const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('cinematic-preview/assets/backend-mode.js','utf8');
for(const enabled of [false,true])test(`booking ${enabled?'connected':'unavailable'} keeps website navigation interactive`,async()=>{
 const classes=new Set(),header={tagName:'HEADER'},main={tagName:'MAIN'},menu={tagName:'DIALOG',id:'mobile-site-menu'};
 const elements=[];
 const document={body:{children:[header,main,menu],classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},append:e=>elements.push(e)},createElement:tag=>({tagName:tag.toUpperCase(),setAttribute(){},replaceChildren(){},append(...children){this.children=children},remove(){this.removed=true}})};
 document.body.append=e=>{elements.push(e);if(e.tagName==='SCRIPT')queueMicrotask(()=>e.onload())};
 const live={init:async()=>({enabled,authEnabled:enabled})};
 await vm.runInNewContext(source,{document,location:{pathname:'/care.html'},window:{P31Live:live,P31LiveCareReady:Promise.resolve()},P31Live:live});
 assert.notEqual(header.inert,true);assert.notEqual(menu.inert,true);
 assert.equal(main.inert,!enabled);
 assert.equal(classes.has('booking-connection-pending'),!enabled);
 const cover=elements.find(e=>e.className==='backend-cover');
 if(enabled)assert.equal(cover.removed,true);else assert.ok(cover.children.some(e=>e.href==='contact.html'));
});

const{test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const req=require('node:module').createRequire(path.resolve('tests/backend-database.test.cjs')),box={require:n=>n==='node:test'?{test(){},after(){}}:req(n),module:{exports:{}},Blob,WebAssembly,console};
vm.runInNewContext(fs.readFileSync('tests/backend-database.test.cjs','utf8').split('let booking;')[0]+'\nmodule.exports={db,ready,login,rpc};',box);const{db,ready,login,rpc}=box.module.exports;after(()=>db.close());
const call=(action,data={})=>rpc('api_work_gallery',[action,JSON.stringify(data)]);
test('owner-only gallery drafts, verified storage, explicit publication, ordering, removal and ten-slot limit',async()=>{
 await ready;await db.exec('reset role');await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/034_public_work_gallery.sql','utf8'));await db.exec(fs.readFileSync('cinematic-preview/supabase/migrations/036_gallery_album_slots.sql','utf8'));
 assert.equal((await db.query("select public from storage.buckets where id='work-gallery'")).rows[0].public,false);
 await login('alice');await assert.rejects(()=>call('reserve',{}),/Owner/);await assert.rejects(()=>call('list'),/Owner/);assert.deepEqual(await call('public'),[]);await assert.rejects(()=>db.query('select * from private.work_gallery'),/permission denied/);
 await login('owner');await assert.rejects(()=>call('reserve',{title:'Bad',alt:'Bad',mime:'image/svg+xml',bytes:2}),/supported/);await assert.rejects(()=>call('reserve',{title:'Big',alt:'Big',mime:'video/mp4',bytes:52428801}),/supported/);
 const items=[];for(let i=0;i<10;i++)items.push(await call('reserve',{title:'QA work '+i,caption:'Private draft',alt:'Clean room',mime:'image/jpeg',bytes:64}));
 await assert.rejects(()=>call('reserve',{title:'Eleven',alt:'Extra',mime:'image/jpeg',bytes:64}),/10 items/);assert.deepEqual(await call('public'),[]);
 await assert.rejects(()=>call('update',{id:items[0].id,title:'Not ready',alt:'Test',published:true,permission:true}),/Unsupported/);
 await assert.rejects(()=>rpc('api_work_gallery_ready',[items[0].id]),/permission denied/);
 await db.exec('reset role');await assert.rejects(()=>rpc('api_work_gallery_ready',[items[0].id]),/missing or incomplete/);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('work-gallery',$1,$2)",[items[0].object_path,JSON.stringify({size:64,mimetype:'image/jpeg'})]);await rpc('api_work_gallery_ready',[items[0].id]);
 await login('owner');await assert.rejects(()=>call('update',{id:items[0].id,title:'Completed room',alt:'Clean room',published:true}),/permission/);
 await call('update',{id:items[0].id,title:'Completed room',alt:'Clean room',caption:'Carefully finished',published:true,permission:true});
 await login('alice');const visible=await call('public');assert.equal(visible.length,1);assert.equal(visible[0].caption,'Carefully finished');assert.equal(visible[0].bytes,undefined);await assert.rejects(()=>call('remove',{id:items[0].id}),/Owner/);
 await login('owner');await call('reorder',{ids:items.map(x=>x.id).reverse()});assert.equal((await call('list'))[0].id,items[9].id);await assert.rejects(()=>call('reorder',{ids:[items[0].id]}),/changed/);
 await call('remove',{id:items[0].id});assert.deepEqual(await call('public'),[]);
 for(const slot of [-1,10,null,1.2])await assert.rejects(()=>call('reserve',{slot,title:'Invalid',alt:'Room',mime:'image/png',bytes:100}),/slot/);
 await assert.rejects(()=>call('reserve',{slot:0,title:'Occupied',alt:'Room',mime:'image/png',bytes:100}),/just filled/);
 const replacement=await call('reserve',{slot:9,title:'Replacement',alt:'New room',mime:'image/png',bytes:100});assert.equal(replacement.position,9);assert.equal((await call('list')).length,10);
 await call('remove',{id:items[5].id});assert.equal((await call('list')).find(x=>x.id===replacement.id).position,9);
 const auto=await call('reserve',{title:'Legacy upload',alt:'Room',mime:'image/png',bytes:100});assert.equal(auto.position,4);
});
test('file signatures reject renamed unsupported files and accept supported gallery headers',()=>{
 const{validSignature}=require('../cinematic-preview/server/gallery.cjs');assert.equal(validSignature('image/jpeg',Buffer.from([255,216,255])),true);assert.equal(validSignature('image/png',Buffer.from([137,80,78,71,13,10,26,10])),true);assert.equal(validSignature('video/mp4',Buffer.from('0000ftypisom')),true);assert.equal(validSignature('video/webm',Buffer.from([26,69,223,163])),true);for(const type of ['image/jpeg','image/png','image/webp','video/mp4','video/webm'])assert.equal(validSignature(type,Buffer.from('<script>alert(1)</script>')),false);
});
test('gallery verification rejects incomplete and incorrect byte content; removal deletes only its own bucket object',async()=>{
 const{gallery}=require('../cinematic-preview/server/gallery.cjs');const row={id:'test',object_path:'gallery/test.jpg',state:'uploading',mime:'image/jpeg'};let finalized=0,removed=false,replyValue;
 const bucket={createSignedUrl:async()=>({data:{signedUrl:'https://storage.example/test'}}),remove:async paths=>{assert.deepEqual(paths,['gallery/test.jpg']);removed=true;return{}}};const privileged={storage:{from:name=>{assert.equal(name,'work-gallery');return bucket}},rpc:async()=>{finalized++;return{data:{...row,state:'ready'}}}};
 const options={route:'gallery-finish',req:{method:'POST'},body:{id:'test'},owner:true,rpc:async(n,args)=>args.p_action==='remove'?{removed:true}:row,privileged,reply:(s,d)=>replyValue={s,d}};
 await assert.rejects(()=>gallery({...options,fetchFile:async()=>({ok:true,status:200,body:{cancel:async()=>{}}})}),/verify/);assert.equal(finalized,0);
 await assert.rejects(()=>gallery({...options,fetchFile:async()=>({ok:true,status:206,arrayBuffer:async()=>Buffer.from('wrong')})}),/format/);assert.equal(finalized,0);
 await gallery({...options,fetchFile:async()=>({ok:true,status:206,arrayBuffer:async()=>Buffer.from([255,216,255])})});assert.equal(finalized,1);assert.equal(replyValue.s,200);
 await gallery({...options,route:'gallery-remove'});assert.equal(removed,true);assert.equal(replyValue.d.removed,true);
 await assert.rejects(()=>gallery({...options,owner:false}),/Owner/);
});

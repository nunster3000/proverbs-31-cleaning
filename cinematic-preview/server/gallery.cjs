const MIME=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
function validSignature(mime,b){return mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':mime==='video/webm'?b.subarray(0,4).equals(Buffer.from([26,69,223,163])):['video/mp4','video/quicktime'].includes(mime)&&b.toString('ascii',4,8)==='ftyp';}
async function gallery({route,req,body,owner,rpc,privileged,fetchFile,reply}){
 const call=async(action,data={})=>rpc('api_work_gallery',{p_action:action,p_data:data});
 const bucket=privileged.storage.from('work-gallery');
 const signed=async row=>{if(row.state==='uploading')return {...row,url:null};const r=await bucket.createSignedUrl(row.object_path,300);if(r.error)throw r.error;const {object_path,...safe}=row;return{...safe,url:r.data.signedUrl};};
 if(route==='gallery'&&req.method==='GET'){const rows=await call(owner?'list':'public');return reply(200,{items:await Promise.all(rows.map(signed)),limit:10});}
 if(!owner)throw Object.assign(Error('Owner access required'),{status:403});
 if(req.method!=='POST')throw Object.assign(Error('Method not allowed'),{status:405});
 if(route==='gallery-reserve'){
  if(!MIME.has(body.mime)||!Number.isSafeInteger(body.bytes))throw Object.assign(Error('Choose a supported photo or video.'),{status:422});
  const row=await call('reserve',body),upload=await bucket.createSignedUploadUrl(row.object_path);
  if(upload.error)throw upload.error;return reply(201,{item:row,signed_url:upload.data.signedUrl});
 }
 if(route==='gallery-finish'){
  const row=await call('get',{id:body.id}),link=await bucket.createSignedUrl(row.object_path,60);if(link.error)throw link.error;
  const r=await fetchFile(link.data.signedUrl,{headers:{Range:'bytes=0-63'},signal:AbortSignal.timeout(10000)});
  if(!r.ok||r.status!==206){await r.body?.cancel();throw Object.assign(Error('Unable to verify this upload. Try again.'),{status:422});}
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>64||!validSignature(row.mime,bytes))throw Object.assign(Error('This file does not match its photo or video format.'),{status:422});
  const result=await privileged.rpc('api_work_gallery_ready',{p_id:row.id});if(result.error)throw result.error;return reply(200,await signed(result.data));
 }
 if(route==='gallery-remove'){
  const row=await call('get',{id:body.id}),r=await bucket.remove([row.object_path]);if(r.error)throw r.error;return reply(200,await call('remove',{id:row.id}));
 }
 if(route==='gallery-update')return reply(200,await call('update',body));
 if(route==='gallery-reorder')return reply(200,await call('reorder',body));
 throw Object.assign(Error('Gallery route not found'),{status:404});
}
module.exports={gallery,validSignature};

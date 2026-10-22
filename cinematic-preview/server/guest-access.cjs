const {randomBytes,createHash}=require('node:crypto');
const secret=()=>randomBytes(32).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest('hex');
const valid=value=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieName='p31_guest';
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e};
async function handleGuest({req,res,route,body,url,env,clientFactory,reply,fetchFile,signatureMatches}){
  if(!route.startsWith('guest-') || ['guest-invite','guest-revoke'].includes(route))return false;
  const secure=!(env.NODE_ENV==='test' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.APP_ORIGIN || ''));
  const setCookie=(value,age)=>res.setHeader('Set-Cookie',`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/api/app; Max-Age=${age}${secure?'; Secure':''}`);
  const origin=new URL(env.APP_ORIGIN).origin;
  if(req.method==='POST' && req.headers.origin!==origin)fail(403,'Origin not allowed');
  if(route==='guest-exit' && req.method==='POST'){
    setCookie('',0);
    const value=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(valid(value)){const service=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await service.rpc('api_guest_close',{p_session:digest(value)});if(r.error)throw r.error;}
    reply(200,{closed:true});return true;
  }
  if(env.AUTH_ENABLED!=='true' || env.GUEST_PORTAL_ENABLED!=='true')fail(503,'Guest booking access is being prepared. Contact Gabrielle for help.');
  const service=clientFactory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(name,args)=>{const r=await service.rpc(name,args);if(r.error)throw r.error;return r.data};
  if(route==='guest-exchange' && req.method==='POST'){
    setCookie('',0);
    if(!valid(body.token))fail(403,'Guest link expired or unavailable. Ask Gabrielle for a new link.');
    const session=secret();await rpc('api_guest_exchange',{p_link:digest(body.token),p_session:digest(session)});setCookie(session,28800);reply(200,{opened:true});return true;
  }
  const cookie=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!valid(cookie))fail(401,'Guest access expired or unavailable. Ask Gabrielle for a new link.');
  const call=(action,data={})=>rpc('api_guest_booking',{p_session:digest(cookie),p_action:action,p_data:data});
  const storage=service.storage.from('walkthroughs');
  if(route==='guest-view' && req.method==='GET'){reply(200,await call('view'));return true;}
  if(route==='guest-approve' && req.method==='POST'){reply(200,await call('approve',{revision:body.revision,consent:body.consent===true}));return true;}
  if(route==='guest-sign' && req.method==='POST'){reply(201,await call('sign',{form_id:body.form_id,visit:body.visit,name:body.name,consent:body.consent===true,electronic:body.electronic===true,answers:body.answers || {}}));return true;}
  if(route==='guest-reserve' && req.method==='POST'){
    const file=await call('reserve',body.file || {});const signed=await storage.createSignedUploadUrl(file.path);if(signed.error)throw signed.error;
    const destination=new URL(signed.data.signedUrl);if(destination.origin!==new URL(env.SUPABASE_URL).origin || !destination.pathname.startsWith('/storage/v1/object/upload/sign/'))fail(500,'Upload destination unavailable');
    reply(201,{file:{id:file.id},signed_url:destination.href});return true;
  }
  if(route==='guest-remove' && req.method==='POST'){
    const file=await call('remove',{id:body.id});const r=await storage.remove([file.path]);if(r.error)throw r.error;reply(200,{removed:true});return true;
  }
  if((route==='guest-file' && req.method==='GET') || (route==='guest-finish' && req.method==='POST')){
    const file=await call(route==='guest-file'?'file':'pending_file',{id:route==='guest-file'?url.searchParams.get('id'):body.id});
    const signed=await storage.createSignedUrl(file.path,60);if(signed.error)throw signed.error;
    if(route==='guest-file'){reply(200,{url:signed.data.signedUrl,mime:file.mime,expiresIn:60});return true;}
    const response=await fetchFile(signed.data.signedUrl,{headers:{Range:'bytes=0-63'},signal:AbortSignal.timeout(10000)});
    if(!response.ok || !signatureMatches(file.mime,new Uint8Array(await response.arrayBuffer())))fail(422,'File content does not match its type. Remove it and choose a supported file.');
    await call('finish',{id:file.id});reply(200,{verified:true});return true;
  }
  fail(404,'Guest action unavailable');
}
module.exports={handleGuest,secret,digest,valid};

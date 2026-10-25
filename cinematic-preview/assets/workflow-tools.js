window.P31Workflow = (() => {
  const types = ['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'];
  function validateFile(file, existing = []) {
    if (!file) throw Error('Choose a room photo or video.');
    if (!types.includes(file.type)) throw Error('Use JPG, PNG, WebP, MP4, WebM, or MOV. Export HEIC photos as JPG before uploading.');
    if (!file.size || file.size > 20 * 1024 * 1024) throw Error('Each file must be between 1 byte and 20 MB.');
    const active = existing.filter(item => item.status !== 'deleted');
    if (active.length >= 6) throw Error('This booking already has 6 files. Remove a file before adding another.');
    if (active.reduce((sum, item) => sum + Number(item.bytes || 0), 0) + file.size > 80 * 1024 * 1024) throw Error('The total walkthrough limit is 80 MB per booking. Remove a file or use a smaller video.');
    return true;
  }
  const photoInputTypes=['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/avif','image/bmp','image/gif','.jpg','.jpeg','.jfif','.png','.webp','.heic','.heif','.avif','.bmp','.gif'];
  const inputTypes=[...photoInputTypes,'video/mp4','video/webm','video/quicktime','video/mov','video/x-quicktime','.mp4','.webm','.mov'];
  const photoFormats='JPG/JPEG, PNG, WebP, HEIC/HEIF, AVIF, BMP, or GIF (still image)';
  const photoHint='Photos: '+photoFormats+'. Up to 20 MB; large photos are resized automatically.';
  const isPhoto=file=>!!file && (/^image\//i.test(file.type||'') || /\.(jpe?g|jfif|png|webp|hei[cf]|avif|bmp|gif)$/i.test(file.name||''));
  function normalizeVideo(file){
    if(!file)return file;
    const ext=(file.name||'').split('.').pop().toLowerCase();
    const mime={mov:'video/quicktime',mp4:'video/mp4',webm:'video/webm'}[ext];
    if(mime && (!file.type || ['application/octet-stream','video/mov','video/x-quicktime','application/quicktime','video/quicktime','video/mp4','video/webm'].includes(file.type)) && file.type!==mime)return new File([file],file.name,{type:mime,lastModified:file.lastModified});
    return file;
  }
  async function prepareFile(file,existing=[],progress=()=>{}) {
    file=normalizeVideo(file);
    if(!file)throw Error('Choose a photo or video.');
    let chosen=file;
    if(isHeic(file))chosen=await prepareHeic(file,existing,progress);
    else if(isPhoto(file)){
      const extension=(file.name||'').split('.').pop().toLowerCase();
      const mime={'jpg':'image/jpeg','jpeg':'image/jpeg','jfif':'image/jpeg','png':'image/png','webp':'image/webp','avif':'image/avif','bmp':'image/bmp','gif':'image/gif'}[extension];
      if((!file.type || file.type==='application/octet-stream' || file.type==='image/jpg') && mime)chosen=new File([file],file.name,{type:mime,lastModified:file.lastModified});
    }
    if(isPhoto(chosen)){
      if(!chosen.size || chosen.size>20*1024*1024)throw Error('Photos must be between 1 byte and 20 MB.');
      if(!['image/jpeg','image/png','image/webp','image/avif','image/bmp','image/x-ms-bmp','image/gif'].includes(chosen.type))throw Error('Use '+photoFormats+'.');
      if(chosen.size>2*1024*1024 || !types.includes(chosen.type)){
        progress('Preparing photo for upload�');
        let bitmap;
        try{bitmap=await createImageBitmap(chosen);}catch{throw Error('This browser could not open the photo. Try JPG or PNG instead.');}
        try{
          const canvas=document.createElement('canvas'),scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
          canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
          const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
          let blob;
          for(const quality of [.9,.8,.65,.5]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob && blob.size<=2097152)break;}
          if(!blob || blob.size>2097152)throw Error('This photo is still too large. Choose a smaller photo.');
          chosen=new File([blob],(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
        }finally{bitmap.close();}
      }
    }
    validateFile(chosen,existing);return chosen;
  }
  const isHeic = file => !!file && (/^image\/hei[cf](?:-sequence)?$/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || ''));
  let converter;
  async function prepareHeic(file, existing = [], progress = () => {}) {
    if (!isHeic(file)) { validateFile(file, existing); return file; }
    // Check source size/count before allocating the decoder; check JPEG quota again afterward.
    validateFile({type:'image/jpeg',size:file.size}, existing);
    progress('Converting iPhone photo to JPG…');
    try {
      if (!window.P31ConvertHEIC) {
        if (!converter) converter = new Promise((resolve,reject) => {
          const script=document.createElement('script');script.src='/assets/heic-converter.js';
          script.onload=()=>window.P31ConvertHEIC?resolve():reject(Error('Converter unavailable'));
          script.onerror=()=>{script.remove();reject(Error('Converter unavailable'))};document.head.append(script);
        }).catch(error=>{converter=null;throw error});
        await converter;
      }
      const blob=await window.P31ConvertHEIC(file);
      if (!blob?.size || blob.type!=='image/jpeg') throw Error('Invalid conversion');
      const jpeg=new File([blob],(file.name || 'room-photo').replace(/\.hei[cf]$/i,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified || Date.now()});
      validateFile(jpeg,existing);
      progress('Converted to JPG. Ready to upload.');
      return jpeg;
    } catch(error) {
      if (/20 MB|80 MB|6 files/.test(error.message)) throw error;
      throw Error('We couldn’t convert this photo. Try selecting it again, or choose a JPG photo.');
    }
  }
  function totals(booking) {
    const starting = booking.quote_snapshot.total_cents;
    const adjustments = (booking.quote_adjustments || []).reduce((sum, item) => sum + item.cents, 0);
    const reviewed = booking.final_cents;
    const total = reviewed ?? starting + adjustments;
    const paid = booking.deposit_paid_cents + booking.final_paid_cents;
    return {starting,adjustments,total,reviewed,paid,balance:Math.max(0,total-paid),difference:total-starting};
  }
  function milestone(b){
    if(b.status==='cancelled')return -1;
    if(b.status==='completed')return 4;
    if(b.deposit_paid_cents<b.quote_snapshot.deposit_cents)return -1;
    if(!b.walkthrough_approved)return 0;
    return {confirmed:1,on_the_way:2,in_progress:3}[b.status] ?? 0;
  }
  function syncChanges(before,packet){
    const rows=packet.rows;
    const freshActivity=(packet.ownerState?.activity || []).filter(e=>!(before.state?.activity || []).some(old=>old.id===e.id));
    const changed=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
    return {
      any:changed(before.records,rows) || packet.ownerState!==null && changed(before.state,packet.ownerState) || packet.people!==null && changed(before.customers,packet.people) || packet.catalog!==null && changed(before.pricing,packet.catalog),
      newBookings:rows.some(b=>!before.records.some(old=>old.id===b.id)) || freshActivity.some(e=>e.action==='booking_created'),
      uploads:freshActivity.some(e=>['walkthrough_uploaded','completion_uploaded'].includes(e.action)) || rows.some(b=>{const old=before.records.find(o=>o.id===b.id);return old && changed(old.walkthrough_files,b.walkthrough_files)}),
      approvals:freshActivity.some(e=>['accept_quote','record_approval','external_approval'].includes(e.action)) || rows.some(b=>{const old=before.records.find(o=>o.id===b.id);return old && old.quote_status!==b.quote_status && b.quote_status==='accepted'})
    };
  }
  return {validateFile,prepareFile,normalizeVideo,inputTypes,photoInputTypes,photoHint,isPhoto,isHeic,totals,types,milestone,syncChanges};
})();


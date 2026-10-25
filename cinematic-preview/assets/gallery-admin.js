window.P31GalleryAdmin=(()=>{
 const el=(t,text)=>{const e=document.createElement(t);if(text)e.textContent=text;return e;};
 function render({api,onDirty=()=>{}}){
  const root=el('section'),h=el('h2','Work gallery'),hint=el('p','Your website album has 10 spaces. Choose an empty space to add a photo or video. Uploads start as drafts; review and publish each item when ready.'),status=el('p'),list=el('div'),form=el('form'),file=el('input'),title=el('input'),alt=el('input'),caption=el('textarea'),submit=el('button','Upload selected file'),counter=el('p');let items=[],pending,busy=false,selectedSlot=null;
  status.className='gallery-upload-status';status.setAttribute('role','status');list.className='gallery-admin-grid';counter.className='gallery-count';hint.className='gallery-hint';root.className='gallery-admin-album';file.type='file';file.accept=P31Workflow.inputTypes.join(',');file.title=P31Workflow.photoHint;file.required=true;title.required=true;title.maxLength=100;alt.maxLength=240;caption.maxLength=1000;submit.type='button';submit.className='primary';form.noValidate=true;
  const field=(text,input)=>{const label=el('label',text);label.append(input);return label;};
  const uploadStatus=el('p'),selectionPreview=el('div');uploadStatus.setAttribute('role','status');uploadStatus.className='gallery-upload-status';
  const setStatus=text=>{status.textContent=text;uploadStatus.textContent=text;if(busy)submit.textContent=text.startsWith('Uploading')?'Uploading�':'Working�';};
  let selectionUrl=null;
  const sizeLabel=bytes=>(Math.ceil(bytes/1048576*100)/100).toFixed(2)+' MB';
  const sizeError=chosen=>!chosen.size?'This file is empty. Choose another file.':chosen.size>(P31Workflow.isPhoto(chosen)?20971520:52428800)?'File too large: '+sizeLabel(chosen.size)+'. The '+(P31Workflow.isPhoto(chosen)?'photo limit is 20 MB.':'video limit is 50 MB.')+' Nothing has been uploaded. '+(P31Workflow.isPhoto(chosen)?'Choose a smaller photo.':'Trim or compress the video, then select the smaller file.') : '';
  const showError=text=>{setStatus(text);uploadStatus.setAttribute('role','alert');uploadStatus.className='gallery-upload-status gallery-upload-error';};
  const clearSelection=()=>{if(selectionUrl)URL.revokeObjectURL(selectionUrl);selectionUrl=null;selectionPreview.replaceChildren();};
  file.onchange=()=>{
    clearSelection();uploadStatus.setAttribute('role','status');uploadStatus.className='gallery-upload-status';const chosen=file.files[0];submit.disabled=busy;if(!chosen){setStatus('Choose a photo or video to begin.');return;}
    onDirty(true);
    if(!title.value.trim())title.value=chosen.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,100);
    const summary=el('p',chosen.name+' — File size: '+sizeLabel(chosen.size)+' / '+(P31Workflow.isPhoto(chosen)?'20':'50')+' MB maximum');summary.className='gallery-file-summary';selectionPreview.append(summary);
    const problem=sizeError(chosen);if(problem){showError(problem);submit.disabled=true;return;}
    if(['image/jpeg','image/png','image/webp','image/gif','image/avif','image/bmp'].includes(chosen.type)){
      selectionUrl=URL.createObjectURL(chosen);const preview=el('img');preview.src=selectionUrl;preview.alt='Selected gallery photo preview';selectionPreview.append(preview);
    }
    setStatus('File selected. Review the title, then click Upload selected file.');
  };
  form.addEventListener('invalid',()=>setStatus('Please complete the highlighted field before uploading.'),true);
  form.className='card';form.append(el('h3','Add a photo or video'),field('Photo or video',file),field('Title',title),field('Describe the photo/video for visitors who cannot see it',alt),field('Caption (optional)',caption),el('p',P31Workflow.photoHint+' HEIC photos convert automatically. MOV, MP4, and WebM videos up to 50 MB. MP4 is recommended for the widest playback support. Photo location metadata is removed during preparation.'),selectionPreview,uploadStatus,submit);
  form.hidden=true;root.append(h,hint,counter,status,list);root.addEventListener("input",()=>onDirty(true));root.addEventListener("change",()=>onDirty(true));
  async function refresh(){const data=await api('gallery',{query:{manage:'1'}});items=data.items;onDirty(!!pending||selectedSlot!==null);counter.textContent=items.length+' / 10 gallery spaces used';submit.disabled=busy||(items.length>=10&&!pending);list.replaceChildren();for(let index=0;index<10;index++){const item=items.find(x=>x.position===index);if(!item){const empty=el('article');empty.className='gallery-admin-card gallery-admin-empty';empty.append(el('p','Slot '+(index+1)),el('span','+'),el('h3','Add a photo or video'));const add=el('button','Upload file');add.type='button';add.className='outline';add.disabled=busy||!!pending;add.setAttribute('aria-label','Upload file to slot '+(index+1));add.onclick=()=>{selectedSlot=index;form.reset();clearSelection();setStatus('Choose a file, then click Upload selected file to save it in this slot.');onDirty(true);form.hidden=false;empty.append(form);form.querySelector('h3').textContent='Upload to slot '+(index+1);file.click();};empty.append(add);list.append(empty);if(selectedSlot===index&&!form.hidden)empty.append(form);continue;}
   const card=el('article');card.className='gallery-admin-card';card.append(el('p','Slot '+(index+1)),el('h3',item.title),el('p',item.state==='uploading'?'Upload unfinished · remove to free this space':item.published?'Visible on website':'Draft · only you can see this'));
   if(item.url){const media=el(item.kind==='video'?'video':'img');media.src=item.url;media.setAttribute('aria-label',item.alt);if(item.kind==='photo')media.alt=item.alt;else{media.controls=true;media.playsInline=true;media.preload='metadata';}card.append(media);}
   if(item.state==='uploading'&&pending?.id===item.id){const retry=el('button','Retry upload');retry.type='button';retry.disabled=busy;retry.onclick=()=>{form.hidden=false;card.append(form);};card.append(retry);if(selectedSlot===index&&!form.hidden)card.append(form);}
   if(item.state==='ready'){
    const edit=el('form'),t=el('input'),a=el('input'),cap=el('textarea'),pub=el('input'),permission=el('input'),save=el('button','Save gallery item');t.required=a.required=true;t.maxLength=100;a.maxLength=240;cap.maxLength=1000;t.value=item.title;a.value=item.alt;cap.value=item.caption;pub.type=permission.type='checkbox';pub.checked=item.published;permission.checked=!!item.sharing_approved_at;save.type='submit';save.className='primary';edit.append(field('Title',t),field('Image/video description',a),field('Caption',cap),field('Show on website',pub),field('I have permission to share this media publicly. It contains no private entry codes or personal documents.',permission),save);edit.onsubmit=async e=>{e.preventDefault();if(pub.checked&&!permission.checked){setStatus('Please confirm permission before publishing.');permission.focus();return;}save.disabled=true;try{await api('gallery-update',{method:'POST',data:{id:item.id,title:t.value.trim(),alt:a.value.trim(),caption:cap.value.trim(),published:pub.checked,permission:permission.checked}});setStatus(pub.checked?'Gallery item published.':'Draft saved. This item is hidden from visitors.');await refresh();}catch(e){setStatus(e.message);save.disabled=false;}};const details=el('details'),summary=el('summary','Edit details & visibility');details.append(summary,edit);details.open=!item.published;card.append(details);
   }
   const actions=el('div');actions.className='gallery-admin-actions';const remove=el('button',item.kind==='video'?'Remove video':'Remove image');remove.type='button';remove.className='outline';remove.onclick=async()=>{if(busy)return;if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='Confirm removal';const cancel=el('button','Keep item');cancel.type='button';cancel.onclick=()=>{delete remove.dataset.confirm;remove.textContent=item.kind==='video'?'Remove video':'Remove image';cancel.remove();};actions.append(cancel);return;}remove.disabled=true;try{await api('gallery-remove',{method:'POST',data:{id:item.id}});if(pending?.id===item.id)pending=null;if(selectedSlot===index){selectedSlot=null;form.reset();form.hidden=true;}setStatus('Slot '+(index+1)+' is empty. Choose Upload file to add another photo or video.');await refresh();}catch(e){setStatus(e.message);remove.disabled=false;}};actions.append(remove);card.append(actions);list.append(card);
  }}
  const uploadSelected=async()=>{
   if(busy){setStatus('An upload is already processing. Please keep this page open.');return;}
   setStatus('Checking selected file�');
   if(selectedSlot===null){setStatus('Choose an empty gallery slot first.');return;}
   if(!file.files[0]){setStatus('Choose a photo or video first.');return;}
   const problem=sizeError(file.files[0]);if(problem){showError(problem);submit.disabled=true;return;}
   if(!title.value.trim())title.value=file.files[0].name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,100)||'Gallery photo';
   if(!form.reportValidity()){setStatus('Upload has not started. Please complete the highlighted field.');return;}
   busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
   const waiting=setTimeout(()=>setStatus('This upload is taking longer than expected. Keep this page open while it finishes, or note this message if it remains stuck.'),30000);
   try{
   let chosen=P31Workflow.normalizeVideo(file.files[0]);if(chosen.size>52428800)throw Error('Choose a photo up to 20 MB or video up to 50 MB.');setStatus('Preparing your media…');
   if(P31Workflow.isPhoto(chosen)){
    if(chosen.size>20971520)throw Error('Photos must be 20 MB or smaller.');chosen=await P31Workflow.prepareFile(chosen,[],text=>setStatus(text));
    const bitmap=await createImageBitmap(chosen),canvas=document.createElement('canvas'),scale=Math.min(1,2560/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)throw Error('This photo could not be prepared. Choose another photo.');chosen=new File([blob],'gallery-photo.jpg',{type:'image/jpeg'});
   }
   const key=file.files[0].name+':'+file.files[0].size+':'+file.files[0].lastModified;
   if(pending&&pending.key!==key){await api('gallery-remove',{method:'POST',data:{id:pending.id}});pending=null;}
   if(!pending){setStatus('Connecting to gallery storage�');const reservation=await api('gallery-reserve',{method:'POST',data:{slot:selectedSlot,mime:chosen.type,bytes:chosen.size,title:title.value.trim(),alt:alt.value.trim()||title.value.trim(),caption:caption.value.trim()}});pending={id:reservation.item.id,url:reservation.signed_url,key};}
   try{await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',pending.url);xhr.timeout=180000;xhr.upload.onprogress=e=>{if(e.lengthComputable)setStatus('Uploading… '+Math.round(e.loaded/e.total*100)+'%');};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('Upload interrupted. Retry this same file or remove the unfinished item.'));xhr.onerror=xhr.ontimeout=()=>reject(Error('Upload interrupted. Check your connection and retry this same file.'));const data=new FormData();data.append('cacheControl','0');data.append('',chosen);xhr.send(data);});}catch(transferError){try{await api('gallery-finish',{method:'POST',data:{id:pending.id}});}catch{throw transferError;}}
   setStatus('Checking your upload…');await api('gallery-finish',{method:'POST',data:{id:pending.id}});pending=null;form.reset();clearSelection();form.hidden=true;selectedSlot=null;setStatus('Draft uploaded. Preview it below, confirm sharing permission, then turn on Show on website and save.');await refresh();
  }catch(e){showError(e.message||'Upload failed. Please try again.');}finally{clearTimeout(waiting);busy=false;submit.textContent='Upload selected file';root.querySelectorAll('button').forEach(b=>b.disabled=false);await refresh().catch(e=>showError('Could not refresh the gallery: '+e.message));submit.disabled=(items.length>=10&&!pending)||!!(file.files[0]&&sizeError(file.files[0]));}};
  submit.onclick=uploadSelected;
  form.onsubmit=e=>{e.preventDefault();return uploadSelected();};
  refresh().catch(e=>{setStatus(e.message);const retry=el('button','Retry gallery');retry.onclick=()=>refresh().then(()=>retry.remove()).catch(e=>setStatus(e.message));root.append(retry);});return root;
 }
 return{render};
})();

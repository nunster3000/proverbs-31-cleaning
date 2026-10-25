window.P31MediaSlots=(()=>{
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const albums=new Map();
 function mount(container,{files,api,label='Walkthrough',editable=false,key=label}){
  const album=albums.get(key)||{ids:Array(6).fill(null),preferred:null};albums.set(key,album);
  album.ids=album.ids.map(id=>files.some(f=>f.id===id)?id:null);
  for(const file of files)if(!album.ids.includes(file.id)){const slot=album.preferred!==null&&!album.ids[album.preferred]?album.preferred:album.ids.indexOf(null);if(slot>=0)album.ids[slot]=file.id;album.preferred=null;}
  container.classList.add('booking-media-album');
  const rows=Array.from(container.children).filter(n=>n.classList.contains('list-row'));
  const form=Array.from(container.children).find(n=>n.tagName==='FORM');
  const grid=el('div',undefined,'booking-media-grid'),count=el('p',files.length+' / 6 spaces used','fine');
  grid.setAttribute('aria-label',label+' media slots');container.append(count,grid);
  if(form){form.hidden=true;form.classList.add('booking-slot-form');}
  for(let index=0;index<6;index++){
   const item=files.find(f=>f.id===album.ids[index]),card=el('article',undefined,'booking-media-slot');
   card.append(el('p','Slot '+(index+1),'booking-slot-number'));
   if(item){
    const row=rows[files.indexOf(item)];if(row){row.classList.remove('list-row');card.append(row);}
    if(item.status==='ready'){
     const preview=el(item.mime.startsWith('image/')?'img':'video');preview.className='booking-slot-media';
     if(item.mime.startsWith('image/')){preview.alt=item.room;preview.loading='lazy';}else{preview.controls=true;preview.playsInline=true;preview.preload='metadata';preview.setAttribute('aria-label',item.room);}
     const notice=el('p','Loading private preview…','fine');card.insertBefore(preview,row||null);card.append(notice);
     api('file',{query:{id:item.id}}).then(data=>{if(!card.isConnected)return;preview.src=data.url;notice.textContent='Private · '+(item.mime.startsWith('image/')?'Photo':'Video');}).catch(()=>{notice.textContent='Use Preview to load this private file.';});
     preview.onerror=()=>notice.textContent='Preview expired or unavailable. Select Preview for a fresh link.';
    }else card.append(el('p','Upload incomplete. Use the available removal control to free this space.','fine'));
   }else{
    card.classList.add('booking-media-empty');card.append(el('span','+','booking-slot-plus'),el('h3','Empty space'));
    if(editable&&form){const add=el('button','Upload photo or video','outline');add.type='button';add.setAttribute('aria-label','Upload '+label.toLowerCase()+' to slot '+(index+1));
     add.onclick=()=>{if(form.querySelector('button[type=submit],button')?.disabled)return;album.preferred=index;form.hidden=false;card.append(form);form.querySelector('input[type=file]').click();};card.append(add);
    }else card.append(el('p',label==='Walkthrough'?'Uploads are closed for this visit.':'Completion photos are added by Gabrielle.','fine'));
   }
   grid.append(card);
  }
  if(files.length>=6)count.textContent+=' · Album full';
  if(form){const original=form.onsubmit;form.onsubmit=async event=>{const controls=grid.querySelectorAll('.booking-media-empty>button');controls.forEach(b=>b.disabled=true);try{await original(event);}finally{controls.forEach(b=>b.disabled=false);}};}
  return grid;
 }
 return {mount};
})();

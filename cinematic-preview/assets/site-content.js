// Public business copy only; customer and booking data never use this endpoint.
(async()=>{
 try{
  const response=await fetch('/api/app?route=site-content',{cache:'no-store'});if(!response.ok)return;
  const data=await response.json();
  document.querySelectorAll('[data-site-key]').forEach(node=>{const value=data[node.dataset.siteKey];if(typeof value!=='string')return;node.textContent=value;if(node.dataset.siteOptional!==undefined)node.hidden=!value;});
  document.querySelectorAll('[data-site-email]').forEach(node=>{node.textContent=data.contact_email;node.href='mailto:'+data.contact_email});
  document.querySelectorAll('[data-site-phone]').forEach(node=>{node.hidden=!data.contact_phone;node.parentElement.hidden=!data.contact_phone;node.textContent=data.contact_phone;node.href='tel:'+data.contact_phone.replace(/[^0-9+]/g,'')});
  const photo=document.querySelector('[data-site-photo]');if(photo&&data.photo_url){photo.src=data.photo_url;photo.alt=data.founder_name;photo.hidden=false;photo.onerror=()=>{photo.hidden=true;document.querySelector('[data-site-photo-fallback]').hidden=false};document.querySelector('[data-site-photo-fallback]').hidden=true;}
 }catch{/* Keep approved static content when the connection is unavailable. */}
})();

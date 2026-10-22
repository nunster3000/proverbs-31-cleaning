/* The business supplies the actual permission wording. No default legal form. */
window.P31Access = (() => {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const field=(label,input)=>{const n=el('label',label);n.append(input);return n};
  const notice=(root,text)=>{const p=el('p',text);p.setAttribute('role','status');root.append(p);return p};
  let receiptUrl;
  const receiptLink=(b,data)=>{
    const r=data.receipt,f=r.form;
    const text=[f.title,'',f.body,'','BOOKING '+b.id,'Visit details: '+JSON.stringify(r.visit_snapshot,null,2),'Signed by: '+r.signer_name,'Signed at: '+r.signed_at,'Form version: '+r.form_id,'Receipt: '+r.id,'Acknowledged permission and electronic signing.'].join('\n');
    if(receiptUrl)URL.revokeObjectURL(receiptUrl);
    receiptUrl=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=el('a','Download signed copy');a.href=receiptUrl;a.download='home-access-'+b.id.slice(0,8)+'.txt';a.className='outline';return a;
  };
  function booking(b,{owner,api,save,focus=false,arrivalLabel=b.arrival}) {
    const root=el('section');root.className='card access-authorization';const heading=el('h2','Home-access authorization');heading.tabIndex=-1;root.append(heading);
    const status=notice(root,'Loading permission form…');
    api('access-form',{query:{id:b.id}}).then(data=>{
      if(!root.isConnected)return;
      if(focus){root.scrollIntoView({block:'start'});heading.focus({preventScroll:true});}
      status.textContent=data.receipt?'Signed · '+data.receipt.signer_name+' · '+new Date(data.receipt.signed_at).toLocaleString("en-US", {timeZone: "America/New_York", timeZoneName: "short"}):b.status==='confirmed'?'Signature needed before Gabrielle can head to your home.':'Available after Gabrielle confirms your booking.';
      if(!data.form){root.append(el('p','Gabrielle’s permission form is being prepared. Signing is not available yet.'));return;}
      const f=data.receipt?.form || data.form;
      root.append(el('h3',f.title));const wording=el('div',f.body);wording.className='access-form-wording';root.append(wording);
      root.append(el('p','Visit: '+b.visit_date+' · '+(b.property?.address || '')+' · Arrival block: '+arrivalLabel));
      if(data.receipt){root.append(receiptLink(b,data));return;}
      if(owner){root.append(el('p','Only the customer can sign this form. On the way stays unavailable until their authorization is recorded.'));return;}
      if(b.status!=='confirmed')return;
      const form=el('form'),name=el('input');name.required=true;name.minLength=3;name.maxLength=120;name.autocomplete='name';
      const consent=el('input');consent.type='checkbox';consent.required=true;
      const electronic=el('input');electronic.type='checkbox';electronic.required=true;
      form.append(field('Type your full name',name),field('I have read this form and authorize the access described above for this visit.',consent),field('I agree to sign this form electronically using my typed name.',electronic));
      form.append(el('p','Signing records this form version and visit details. Changes to the visit or address require a new authorization. You can download your signed copy afterward.'));
      const submit=el('button','Sign home-access authorization');submit.type='submit';submit.className='primary';form.append(submit);
      form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await save(()=>api('access-sign',{method:'POST',data:{id:b.id,form_id:f.id,visit:data.visit,name:name.value.trim(),consent:consent.checked,electronic:electronic.checked}}));}finally{submit.disabled=false;}};
      root.append(form);
    }).catch(()=>{status.textContent='Home-access authorization is being prepared. Signing is unavailable until setup is complete.';});
    return root;
  }
  function editor({api,save}){
    const root=el('section');root.className='card access-authorization';root.append(el('h2','Home-access permission form'),el('p','Add Gabrielle’s existing approved wording here. Publishing makes it available to customers after confirmation. Each published version and signed receipt is preserved. Confirm the wording is ready for customer use before publishing.'));
    const status=notice(root,'Loading current form…');
    api('access-form').then(data=>{
      if(!root.isConnected)return;
      status.textContent=data.form?'Current version published '+new Date(data.form.created_at).toLocaleDateString("en-US", {timeZone: "America/New_York"}):'No form published. Customer signing is unavailable.';
      const form=el('form'),title=el('input'),body=el('textarea'),approved=el('input');title.required=true;title.minLength=3;title.maxLength=160;title.value=data.form?.title || '';body.required=true;body.minLength=40;body.maxLength=30000;body.rows=16;body.value=data.form?.body || '';approved.type='checkbox';approved.required=true;
      form.append(field('Form title',title),field('Permission form wording',body),field('This is the business-approved wording, ready for customers to read and sign.',approved));
      const submit=el('button','Publish permission form');submit.className='primary';submit.type='submit';form.append(submit);
      form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await save(()=>api('access-form',{method:'POST',data:{title:title.value.trim(),body:body.value.trim(),previous:data.form?.id || null}}));}finally{submit.disabled=false;}};root.append(form);
    }).catch(()=>{status.textContent='Permission form setup is pending. No customer signatures can be collected yet.';});return root;
  }
  return {booking,editor};
})();

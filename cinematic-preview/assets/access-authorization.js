/* All signed data is read from the private, versioned server receipt. */
window.P31Access = (() => {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const field=(label,input)=>{const n=el('label',label);n.append(input);return n};
  const entryIcon=i=>{const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 32 32');icon.setAttribute('aria-hidden','true');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.5');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');icon.innerHTML=[`<path d="M4 15 16 5l12 10M8 13v14h16V13M13 27v-9h6v9"/>`,`<circle cx="11" cy="12" r="6"/><path d="m15 16 12 12m-4-4 3-3m-7-1 3-3"/><circle cx="10" cy="11" r="1"/>`,`<rect x="6" y="4" width="20" height="25" rx="4"/><circle cx="12" cy="11" r="1"/><circle cx="20" cy="11" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="20" cy="17" r="1"/><path d="M13 23h6"/>`,`<path d="m16 4 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z"/>`][i];return icon;};
  const notice=(root,text)=>{const p=el('p',text);p.setAttribute('role','status');root.append(p);return p};
  const date=s=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'});
  function download(r){
    const b=el('button','Download signed agreement (PDF)');b.type='button';b.className='outline';
    b.onclick=async()=>{b.disabled=true;try{const bytes=await P31AgreementPDF.create(r),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=el('a');a.href=url;a.download='home-entry-agreement-'+r.booking_id.slice(0,8)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch{b.textContent='Download unavailable · try again';}finally{b.disabled=false;}};return b;
  }
  function summary(root,details,answers,compact=false){
    const dl=el('dl');dl.className='agreement-summary';
    P31AgreementPDF.details(details,answers).forEach(([label,value])=>{if(!value||(compact&&!['Client','Service address','Service','Home / suite','Paid add-ons','Agreed cleaning fee','Scheduled visit','Entry arrangement','Payment due','Cancellation / rescheduling notice'].includes(label)))return;dl.append(el('dt',label),el('dd',value));});root.append(dl);
  }
  function booking(b,{owner,api,save,focus=false,arrivalLabel=b.arrival}){
    const root=el('section');root.className='card access-authorization';const heading=el('h2',owner?'Home entry & cleaning agreement':'Prepare for your visit');heading.tabIndex=-1;root.append(heading);
    const status=notice(root,'Loading agreement…');
    api('access-form',{query:{id:b.id}}).then(data=>{
      if(!root.isConnected)return;
      if(focus){root.scrollIntoView({block:'start'});heading.focus({preventScroll:true});}
      if(!data.form){status.textContent='Gabrielle’s agreement is being prepared. Signing is not available yet.';return;}
      const r=data.receipt,f=r?.form||data.form;
      status.textContent=r?'Customer signed · '+r.signer_name+' · '+date(r.signed_at):b.status==='confirmed'?'A few details to authorize your scheduled visit.':'Available after Gabrielle confirms your booking.';
      if(r){
        root.append(download(r));summary(root,r.agreement_snapshot,r.answers,true);const more=el('details');more.append(el('summary','All signed booking & care details'));summary(more,r.agreement_snapshot,r.answers);root.append(more);root.append(el('p',r.representative_signed_at?'Gabrielle’s signature recorded · '+date(r.representative_signed_at):'Awaiting Gabrielle’s representative signature.'));
        const terms=el('details'),wording=el('div',f.body);wording.className='access-form-wording';terms.append(el('summary','Read signed agreement terms'),wording);root.append(terms);
        if(owner&&!r.representative_signed_at){
          const form=el('form'),name=el('input'),consent=el('input');name.value='Gabrielle Jackson';name.required=true;name.minLength=3;name.maxLength=120;consent.type='checkbox';consent.required=true;
          form.append(field('Representative full name',name),field('I am the authorized representative and agree to sign this agreement electronically.',consent));const submit=el('button','Sign as representative');submit.className='primary';form.append(submit);form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await save(()=>api('access-countersign',{method:'POST',data:{id:b.id,signature_id:r.id,name:name.value.trim(),consent:consent.checked}}));}finally{submit.disabled=false;}};root.append(form);
        }return;
      }
      if(data.questionnaire_version!==1){root.append(el('p','Agreement setup is being updated. Please try again shortly.'));return;}
      if(owner){summary(root,data.details,{});root.append(el('p','The customer must complete and sign this agreement. Gabrielle’s authorized automatic signature is applied when they sign.'));return;}
      if(b.status!=='confirmed')return;
      const form=el('form'),steps=[],values={},progress=el('p');progress.className='eyebrow';progress.setAttribute('aria-live','polite');form.append(progress);
      const intro=el('div');intro.className='agreement-welcome';intro.append(el('span','✦'),el('h3','A little preparation. A home cared for.'),el('p','Three thoughtful steps to help Gabrielle make your visit feel effortless.'));form.prepend(intro);
      const track=el('div');track.className='agreement-track';track.setAttribute('aria-label','Agreement progress');const titles=['Your details','Home access & care','Review & sign'];titles.forEach((title,i)=>{const item=el('span');item.append(el('b',String(i+1)),el('span',title));track.append(item);});form.append(track);
      titles.forEach(title=>{const step=el('section');step.className='agreement-step';step.append(el('h3',title));steps.push(step);form.append(step);});
      const add=(index,key,label,value='',{required=false,area=false,type='text',options}={})=>{
        if(options){const group=el('fieldset');group.className='agreement-entry-options';group.append(el('legend',label));const radios=[];options.filter(Boolean).forEach((option,i)=>{const radio=el('input');radio.type='radio';radio.name='agreement-'+b.id+'-'+key;radio.value=option;radio.required=required;radio.checked=option===value;radios.push(radio);const card=el('label');card.append(radio,entryIcon(i),el('strong',option));group.append(card);});values[key]={get value(){return radios.find(r=>r.checked)?.value||'';}};steps[index].append(group);return group;}
        const input=el(options?'select':area?'textarea':'input');if(options)options.forEach(text=>{const option=el('option',text);option.value=text;input.append(option);});else{if(!area)input.type=type;input.maxLength=area?2000:120;if(area)input.rows=3;}input.value=value||'';input.required=required;if(key==='client_name')input.autocomplete='name';if(key==='phone')input.autocomplete='tel';values[key]=input;
        if(area){const box=el('details');box.className='agreement-note';box.append(el('summary',label),field('Details (optional)',input));if(value)box.open=true;steps[index].append(box);}else steps[index].append(field(label,input));return input;};
      const d=data.details||{};
      add(0,'client_name','Your full name',d.client_name,{required:true});values.client_name.minLength=3;
      add(0,'phone','Best contact phone',d.client_phone,{required:true,type:'tel'});values.phone.minLength=7;
      steps[0].append(el('p','Service address: '+[data.visit.address,data.visit.unit,data.visit.city,data.visit.state,data.visit.zip].filter(Boolean).join(', ')),el('p','Scheduled visit: '+b.visit_date+' · '+arrivalLabel+' · Eastern Time'),el('p','Need to change your address or visit? Contact Gabrielle before signing.'));
      add(1,'entry_method','How will Gabrielle enter your home?','',{required:true,options:['','I will be present','Key handoff','Lockbox or keypad','Other arrangement']});
      add(1,'entry_instructions','Entry instructions or agreed key handoff',b.property?.access_notes,{area:true});
      add(1,'security_notes','Security procedures or restricted areas','',{area:true});
      add(1,'pets_safety','Pets or safety concerns',b.property?.pet_notes,{area:true});
      add(1,'property_care','Fragile items, delicate surfaces, existing damage or special care','',{area:true});
      add(1,'emergency_contact','Emergency contact (optional)');
      steps[1].append(el('p','These private instructions are shared with Gabrielle for this visit. Only provide access codes if needed for the agreed entry arrangement.'));
      const reviewSummary=el('div');steps[2].append(reviewSummary);summary(reviewSummary,d,{},true);
      const terms=el('details'),wording=el('div',f.body);wording.className='access-form-wording';terms.append(el('summary','Read the full agreement'),wording);terms.open=true;steps[2].append(terms);
      const name=el('input');name.required=true;name.minLength=3;name.maxLength=120;name.autocomplete='name';name.value=d.client_name||'';
      const consent=el('input');consent.type='checkbox';consent.required=true;
      const electronic=el('input');electronic.type='checkbox';electronic.required=true;
      steps[2].append(field('Type your full name as your signature',name),field('I am the homeowner or authorized occupant, have read the agreement, and authorize the listed services and entry for this visit.',consent),field('I agree to sign electronically using my typed name and understand I can download the signed agreement.',electronic),el('p','Your answers, this agreement version and the scheduled visit will be saved with your signature. Changing the address or schedule requires a new agreement.'));
      const actions=el('div');actions.className='agreement-actions';const back=el('button','Back'),next=el('button','Continue'),submit=el('button','Sign agreement');back.type=next.type='button';submit.type='submit';submit.className=next.className='primary';back.className='outline';actions.append(back,next,submit);form.append(actions);
      let current=0;const show=()=>{steps.forEach((s,i)=>{s.hidden=i!==current;s.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=i!==current);});progress.textContent='Step '+(current+1)+' of 3';[...track.children].forEach((node,i)=>{node.classList.toggle('is-current',i===current);node.classList.toggle('is-done',i<current);node.setAttribute('aria-current',i===current?'step':'false');node.querySelector('b').textContent=i<current?'✓':String(i+1);});back.hidden=current===0;next.hidden=current===2;submit.hidden=current!==2;};
      back.onclick=()=>{current--;show();};next.onclick=()=>{if(!form.reportValidity())return;current++;if(current===2){if(name.value===d.client_name)name.value=values.client_name.value;reviewSummary.replaceChildren();const entered=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.value.trim()]));summary(reviewSummary,d,entered,true);const allDetails=el('details');allDetails.append(el('summary','All booking & care details'));summary(allDetails,d,entered);reviewSummary.append(allDetails);}show();steps[current].querySelector('h3').tabIndex=-1;steps[current].querySelector('h3').focus();};show();
      form.onsubmit=async e=>{e.preventDefault();if(current<2){next.click();return;}if(!form.reportValidity())return;submit.disabled=true;try{const answers=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.value.trim()]));await save(()=>api('access-sign',{method:'POST',data:{id:b.id,form_id:f.id,visit:data.visit,name:name.value.trim(),consent:consent.checked,electronic:electronic.checked,answers}}));}finally{submit.disabled=false;}};
      root.append(form);
    }).catch(()=>{status.textContent='Agreement setup is pending. Signing is unavailable until setup is complete.';});return root;
  }
  function editor({api,save}){
    const root=el('section');root.className='card access-authorization';root.append(el('h2','Forms & agreements'),el('p','Manage your agreement wording, authorize your automatic signature, and download completed customer forms. Publishing preserves older versions and signed records.'));
    const status=notice(root,'Loading current form…');
    api('access-form').then(data=>{
      if(!root.isConnected)return;
      if(data.questionnaire_version!==1){status.textContent='The questionnaire database update must be applied before this form can be published.';return;}
      status.textContent=data.form?'Current version published '+date(data.form.created_at):'No form published. Review the supplied draft before publishing.';
      const form=el('form'),title=el('input'),body=el('textarea'),approved=el('input'),representative=el('input'),automatic=el('input');title.required=true;title.minLength=3;title.maxLength=160;title.value=data.form?.title||'Home Entry & Cleaning Service Agreement';body.required=true;body.minLength=40;body.maxLength=30000;body.rows=16;body.value=data.form?.body||window.P31AgreementDraft||'';approved.type='checkbox';approved.required=true;representative.value=data.form?.representative_name||'Gabrielle Jackson';representative.maxLength=120;automatic.type='checkbox';automatic.required=true;
      form.append(field('Form title',title),field('Agreement wording',body),field('Representative signature name',representative),field('I am the authorized business representative. I authorize my typed electronic signature to be applied automatically when a customer signs this agreement version.',automatic),field('I have reviewed this wording and approve it for customer use. Payment and cancellation terms remain to be agreed with Gabrielle.',approved));
      const submit=el('button','Publish agreement & authorize signature');submit.className='primary';submit.type='submit';form.append(submit);
      form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await save(()=>api('access-form',{method:'POST',data:{title:title.value.trim(),body:body.value.trim(),previous:data.form?.id||null,representative:representative.value.trim(),automatic:automatic.checked}}));}finally{submit.disabled=false;}};const setup=el('details');setup.open=!data.form;setup.append(el('summary','Agreement wording & automatic signature setup'),form);root.append(setup);
      const records=el('section');records.append(el('h3','Recent signed customer agreements'),el('p','Older agreements remain available inside their booking.'));const filter=el('input');filter.type='search';filter.placeholder='Search name, address, date or booking';filter.setAttribute('aria-label','Search signed agreements');records.append(filter);const list=el('div');records.append(list);root.insertBefore(records,setup);
      api('access-records').then(rows=>{const render=()=>{list.replaceChildren();const query=filter.value.trim().toLowerCase(),matches=rows.filter(r=>[r.signer_name,r.booking_id,r.visit_snapshot?.address,r.visit_snapshot?.date].join(' ').toLowerCase().includes(query));if(!matches.length)list.append(el('p','No signed agreements match.'));matches.forEach(r=>{const item=el('article');item.className='agreement-record';item.append(el('h4',r.signer_name),el('p',(r.visit_snapshot?.date||'')+' · '+(r.visit_snapshot?.address||'')),el('p','Customer signed '+date(r.signed_at)+(r.representative_signed_at?' · Representative signed':' · Representative signature pending')),download(r));list.append(item);});};filter.oninput=render;render();}).catch(()=>notice(records,'Signed agreements could not be loaded. Please try again.'));
    }).catch(()=>{status.textContent='Agreement setup is pending. No signatures can be collected yet.';});return root;
  }
  return {booking,editor};
})();

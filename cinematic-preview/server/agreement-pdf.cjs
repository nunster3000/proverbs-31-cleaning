const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const fontkit=require('@pdf-lib/fontkit');
const signatureFonts=new Set(['allura','greatvibes','parisienne']);
const clean=s=>String(s ?? '').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2022/g,'-').replace(/[^\x20-\x7e\n\u00a0-\u00ff]/gu,c=>'[U+'+c.codePointAt(0).toString(16).toUpperCase()+']');
const money=c=>c===null||c===undefined?'Not yet agreed':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const time=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'}):'Pending';
const service={standard:'Standard Cleaning',deep:'Deep Cleaning',apartment:'Apartment Cleaning',airbnb:'Airbnb Turnover'};
function details(d={},a={}){
 const v=d.visit||{},q=d.included||{},freq=d.recurrence||{};
 const arrival=v.arrival==='morning'?'9:00 AM - 12:00 PM':v.arrival==='afternoon'?'12:00 PM - 3:00 PM':/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v.arrival||'')?v.arrival:v.arrival||'';
 return [
 ['Business',d.business_name||'Proverbs 31 Cleaning Services'],['Business email',d.business_email||''],['Business phone',d.business_phone||'Not provided'],
 ['Client',a.client_name||d.client_name||''],['Client email',d.client_email||''],['Client phone',a.phone||d.client_phone||''],
 ['Service address',[v.address,v.unit,v.city,v.state,v.zip].filter(Boolean).join(', ')],
 ['Service',service[d.service]||d.service||''],['Home / suite',q.space||''],['Apartment visit',d.apartment_mode||'Not applicable'],
 ['Rooms / focus',(d.focus||[]).join(', ')||'As listed in the booking'],
 ['Included care',({standard:'Routine dusting and surface cleaning, vacuuming, sweeping, mopping, bed making, and kitchen and bathroom care in the agreed areas.',deep:'Detailed cleaning of the agreed areas, including baseboards, windows, sanitizing and disinfecting. Refrigerator and oven cleaning are included when the kitchen is selected as a focus.',apartment:'Standard cleaning of the empty apartment before move-in or after move-out.',airbnb:'Standard cleaning of the selected guest suite between stays.'}[d.service]||'See authorized service')],
 ['Included add-ons',(q.addons||[]).filter(a=>a.included).map(a=>a.label).join(', ')||'None'],
 ['Paid add-ons',(q.addons||[]).filter(a=>!a.included&&a.quantity>0).map(a=>a.label+' x '+a.quantity+' ('+money(a.amount_cents)+')').join(', ')||'None selected'],
 ['Starting estimate',money(d.starting_cents)],['Agreed cleaning fee',money(d.agreed_cents)],['Deposit recorded',money(d.deposit_paid_cents||0)],
 ['Service frequency',freq.kind==='custom'?`Every ${freq.interval} ${freq.unit}`:({once:'One-time',weekly:'Weekly',monthly:'Monthly',biweekly:'Biweekly'}[freq.kind]||freq.kind||'One-time')],
 ['Scheduled visit',`${v.date||''} · ${arrival} Eastern Time`],['Payment due',d.payment_due||'To be agreed with Gabrielle'],['Cancellation / rescheduling notice',d.cancellation_notice||'To be agreed with Gabrielle'],
 ['Entry arrangement',a.entry_method||''],['Special entry instructions',a.entry_instructions||'None provided'],['Security / restricted areas',a.security_notes||'None provided'],['Pets and safety',a.pets_safety||'None provided'],['Fragile items / existing damage / special care',a.property_care||'None provided'],['Emergency contact (optional)',a.emergency_contact||'Not provided'],['Other services requested',a.other_services||'None requested; additions require mutual approval']
 ];
}
async function createAgreementPdf(r,{loadFont}={}){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),standardScript=await pdf.embedFont(({classic:StandardFonts.TimesRomanItalic,modern:StandardFonts.Helvetica,formal:StandardFonts.TimesRoman}[r.form.configuration?.representative_style]||StandardFonts.TimesRomanItalic)),clientScript=await pdf.embedFont(StandardFonts.TimesRomanItalic);
 const style=r.form.configuration?.representative_style,customScript=signatureFonts.has(style);
 let script=standardScript;
 if(customScript){const bytes=loadFont?await loadFont(style):await (async()=>{const response=await fetch(new URL('assets/signature-fonts/'+style+'.ttf',location.href));if(!response.ok)throw Error('Signature font could not be loaded. Please try the download again.');return new Uint8Array(await response.arrayBuffer());})();script=await pdf.embedFont(bytes,{subset:false});}
 pdf.setTitle(r.form.title);pdf.setAuthor('Proverbs 31 Cleaning Services');pdf.setCreationDate(new Date(r.signed_at));
 let page,y;const pages=[];const addPage=()=>{page=pdf.addPage([612,792]);pages.push(page);y=732;page.drawText('PROVERBS 31  /  CLEANING SERVICES',{x:44,y,font:bold,size:10,color:rgb(.48,.34,.14)});y-=30;};addPage();
 const line=(text,{size=10,face=font,gap=5}={})=>{
   const paragraphs=clean(text).split('\n');for(const p of paragraphs){let row='';for(const token of p.split(/\s+/)){const chars=[];let part='';for(const c of token){if(face.widthOfTextAtSize(part+c,size)>500){chars.push(part);part='';}part+=c;}chars.push(part);for(const word of chars){if(row && face.widthOfTextAtSize(row+' '+word,size)>520){if(y<60)addPage();page.drawText(row,{x:44,y,font:face,size});y-=size+gap;row=word;}else row+=(row?' ':'')+word;}}if(y<60)addPage();if(row)page.drawText(row,{x:44,y,font:face,size});y-=size+gap;}
 };
 line(r.form.title,{size:18,face:bold,gap:10});
 line('1. Client information and visit details',{size:12,face:bold});
 for(const [label,value] of details(r.agreement_snapshot,r.answers))line(label+': '+value);
 addPage();line('Agreement terms',{size:14,face:bold,gap:10});for(const paragraph of r.form.body.split('\n')){const heading=/^\d+\. /.test(paragraph);if(heading&&y<130)addPage();line(paragraph,{face:heading?bold:font});}
 if(r.agreement_snapshot?.policy_snapshot){addPage();line('Business policies attached to this agreement',{size:14,face:bold,gap:10});for(const[key,value]of Object.entries(r.agreement_snapshot.policy_snapshot)){if(y<130)addPage();line(key.replaceAll('_',' '),{size:12,face:bold});line(value);}}
 if(r.form.configuration?.questions){if(y<120)addPage();y-=10;line('Questionnaire responses',{size:12,face:bold});for(const q of r.form.configuration.questions)line(q.label+': '+(r.answers?.[q.id]||'Not provided'));}
 if(y<(customScript?330:280))addPage();y-=10;line('Electronic signatures and record',{size:12,face:bold});
 line('Client / authorized occupant: '+r.signer_name,{size:15,face:clientScript});line('Customer signed: '+time(r.signed_at));
 if(customScript){line('Representative signature:');y-=24;line(r.representative_name||'Awaiting representative signature',{size:30,face:script,gap:12});}else line('Representative: '+(r.representative_name||'Awaiting representative signature'),{size:15,face:script});line('Representative signed: '+time(r.representative_signed_at));
 if(r.form.automatic_representative)line('Representative signature automatically applied under the authorization recorded with this form version. Authorization date: '+time(r.form.representative_authorized_at));
 line('Customer acknowledged permission to enter and consented to electronic signing.');line('Booking: '+r.booking_id);line('Form version: '+r.form_id);line('Receipt: '+r.id);
 pages.forEach((p,i)=>p.drawText(`Private customer record  |  ${i+1} of ${pages.length}`,{x:44,y:30,font,size:8,color:rgb(.4,.4,.4)}));
 return pdf.save();
}
module.exports={createAgreementPdf,details};

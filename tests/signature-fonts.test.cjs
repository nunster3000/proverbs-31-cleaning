const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PDFDocument,PDFName}=require('../cinematic-preview/node_modules/pdf-lib');
const {createAgreementPdf}=require('../cinematic-preview/server/agreement-pdf.cjs');
const fixture=style=>({id:'receipt-test',booking_id:'booking-test',form_id:'form-test',signer_name:'Customer Example',representative_name:'Gabrielle Jackson',signed_at:'2026-10-22T14:00:00Z',representative_signed_at:'2026-10-22T14:00:00Z',form:{title:'Isolated font verification',body:'A disposable test agreement used only to verify signature rendering.',configuration:{representative_style:style}},agreement_snapshot:{},answers:{}});
test('each cursive preset embeds its actual font in the PDF, and font failures never silently substitute a different signature',async()=>{
 for(const [style,fontName] of [['allura','Allura'],['greatvibes','GreatVibes'],['parisienne','Parisienne']]){
  const bytes=await createAgreementPdf(fixture(style),{loadFont:id=>fs.readFileSync('cinematic-preview/assets/signature-fonts/'+id+'.ttf')});
  const pdf=await PDFDocument.load(bytes),descriptors=pdf.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o.get?.(PDFName.of('FontFile2')));
  const descriptor=descriptors.find(o=>String(o.get(PDFName.of('FontName'))).includes(fontName));assert.ok(descriptor,style+' must embed the chosen font');const stream=pdf.context.lookup(descriptor.get(PDFName.of('FontFile2')));const embedded=require('node:zlib').inflateSync(stream.getContents());assert.deepEqual(embedded,fs.readFileSync('cinematic-preview/assets/signature-fonts/'+style+'.ttf'),'Embed the complete script font to avoid missing ligature glyphs');assert.ok(pdf.getPageCount()>=2);
 }
 await assert.rejects(()=>createAgreementPdf(fixture('allura'),{loadFont:()=>{throw Error('Font unavailable');}}),/Font unavailable/);
 let called=false;await createAgreementPdf(fixture('classic'),{loadFont:()=>{called=true;throw Error('Must not load');}});assert.equal(called,false);
});

/* A bounded schema keeps owner edits inside the established questionnaire UI. */
(function(root){
 const defaults=()=>({representative_style:'allura',questions:[
 {id:'client_name',label:'Your full name',type:'text',required:true,step:0},
 {id:'phone',label:'Best contact phone',type:'text',required:true,step:0},
 {id:'entry_method',label:'How will Gabrielle enter your home?',type:'choice',required:true,step:1,options:['I will be present','Key handoff','Lockbox or keypad','Other arrangement']},
 {id:'entry_instructions',label:'Entry instructions or agreed key handoff',type:'long',required:false,step:1},
 {id:'security_notes',label:'Security procedures or restricted areas',type:'long',required:false,step:1},
 {id:'pets_safety',label:'Pets or safety concerns',type:'long',required:false,step:1},
 {id:'property_care',label:'Fragile items, delicate surfaces, existing damage or special care',type:'long',required:false,step:1},
 {id:'emergency_contact',label:'Emergency contact',type:'text',required:false,step:1}
 ]});
 const styles={allura:{label:'Allura · soft cursive',family:'P31Allura, cursive',style:'normal'},greatvibes:{label:'Great Vibes · flowing script',family:'P31GreatVibes, cursive',style:'normal'},parisienne:{label:'Parisienne · handwritten',family:'P31Parisienne, cursive',style:'normal'},classic:{label:'Elegant italic',family:'Georgia, serif',style:'italic'},modern:{label:'Clean & modern',family:'Arial, sans-serif',style:'normal'},formal:{label:'Traditional serif',family:'Georgia, serif',style:'normal'}};
 const api={defaults,styles};if(typeof module!=='undefined')module.exports=api;else root.P31AgreementBuilder=api;
})(typeof window==='undefined'?{}:window);

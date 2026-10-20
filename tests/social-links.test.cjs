const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('cinematic-preview/assets/social-links.js','utf8');
const context={window:{}};vm.runInNewContext(code,context);const S=context.window.P31Social;
test('social URLs require HTTPS, a recognized platform host and a page path',()=>{
 for(const [id,url]of [['facebook','https://www.facebook.com/proverbs31'],['instagram','https://instagram.com/proverbs31/'],['tiktok','https://www.tiktok.com/@proverbs31'],['youtube','https://www.youtube.com/@proverbs31'],['linkedin','https://linkedin.com/company/proverbs31'],['x','https://x.com/proverbs31'],['x','https://twitter.com/proverbs31']])assert.equal(S.valid(id,url),true,url);
 for(const url of ['javascript:alert(1)','http://instagram.com/proverbs31','https://instagram.com/','https://instagram.com.evil.example/profile','https://instagram.com@evil.example/profile','https://user@instagram.com/profile','https://instagram.com:8443/profile','https://instagram.com/has space','https://facebook.com/proverbs31'])assert.equal(S.valid('instagram',url),false,url);
 assert.equal(S.valid('unknown','https://instagram.com/profile'),false);
});
test('only enabled valid profiles render real platform SVG icons with accessible links',()=>{
 function node(tag){return{tag,children:[],attrs:{},append(n){this.children.push(n)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},closest(){return null}}}
 const nav=node('nav'),ctx={window:{},document:{querySelectorAll:()=>[nav],createElement:node,createElementNS:(_ns,tag)=>node(tag)}};vm.runInNewContext(code,ctx);
 ctx.window.P31Social.render({facebook:{enabled:false,url:'https://facebook.com/test'},instagram:{enabled:true,url:'https://instagram.com/test'},youtube:{enabled:true,url:'javascript:alert(1)'}});
 assert.equal(nav.children.length,1);assert.equal(nav.hidden,false);const link=nav.children[0];assert.equal(link.href,'https://instagram.com/test');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.match(link.attrs['aria-label'],/Instagram/);assert.equal(link.children[0].tag,'svg');assert.equal(link.children[0].children[0].attrs.d,ctx.window.P31Social.platforms.find(p=>p.id==='instagram').path);
 ctx.window.P31Social.render({instagram:{enabled:false,url:'https://instagram.com/test'}});assert.equal(nav.hidden,true);assert.equal(nav.children.length,0);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {searchPolicy,ORIGIN,PUBLIC}=require('../cinematic-preview/server/search-visibility.cjs');
const at=Date.parse(require('../cinematic-preview/server/launch-clock.cjs').OPENS_AT),env={LAUNCH_COUNTDOWN_ENABLED:'true',VERCEL_ENV:'production'};
test('search visibility follows the exact launch instant without exposing private routes',()=>{
 for(const p of PUBLIC){assert.match(searchPolicy(ORIGIN+p,env,at-1).headers['X-Robots-Tag'],/noindex/);assert.equal(searchPolicy(ORIGIN+p,env,at).headers['X-Robots-Tag'],'index, follow');}
 for(const p of ['/guest.html#access=secret','/workspace.html','/account.html','/admin.html','/sign-in.html','/care.html','/api/app'])assert.match(searchPolicy(ORIGIN+p,env,at).headers['X-Robots-Tag'],/noindex/);
 assert.match(searchPolicy(ORIGIN+'/',{...env,LAUNCH_HOLD:'true'},at).headers['X-Robots-Tag'],/noindex/);
 for(const url of ['https://preview.vercel.app/','https://proverbs-31-cleaning.vercel.app/'])assert.match(searchPolicy(url,env,at).headers['X-Robots-Tag'],/noindex/);
 assert.match(searchPolicy(ORIGIN+'/',{...env,VERCEL_ENV:'preview'},at).headers['X-Robots-Tag'],/noindex/);
});
test('robots and sitemap are empty of public discovery until launch, and only list canonical public pages afterward',()=>{
 assert.equal(searchPolicy(ORIGIN+'/robots.txt',env,at-1).body,'User-agent: *\nDisallow: /\n');
 assert.doesNotMatch(searchPolicy(ORIGIN+'/sitemap.xml',env,at-1).body,/<loc>/);
 const robots=searchPolicy(ORIGIN+'/robots.txt',env,at).body,sitemap=searchPolicy(ORIGIN+'/sitemap.xml',env,at).body;
 assert.match(robots,/Disallow: \/guest.html/);assert.match(robots,/Sitemap:/);assert.match(sitemap,/<loc>https:\/\/www.proverbs31cleaningcoservices.info\/services.html/);assert.doesNotMatch(sitemap,/guest|workspace|token|index.html|account/);
});

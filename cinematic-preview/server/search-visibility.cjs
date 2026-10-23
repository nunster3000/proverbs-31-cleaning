const {launchState}=require('./launch-clock.cjs');
const ORIGIN='https://www.proverbs31cleaningcoservices.info';
const PUBLIC=['/','/index.html','/services.html','/about.html','/contact.html','/privacy.html','/service-information.html'];
function searchPolicy(url,env=process.env,now=Date.now()){
 const u=new URL(url),open=!launchState(env,now).pending&&env.LAUNCH_HOLD!=='true'&&u.origin===ORIGIN&&env.VERCEL_ENV!=='preview';
 const index=open&&PUBLIC.includes(u.pathname);
 const headers={'X-Robots-Tag':index?'index, follow':'noindex, nofollow','Cache-Control':'no-store'};
 if(u.pathname==='/robots.txt')return {headers,body:open?`User-agent: *\nAllow: /\nDisallow: /api/\n${['account','admin','workspace','guest','sign-in','owner-sign-in','owner-preview','final-payment','care'].map(x=>'Disallow: /'+x+'.html').join('\n')}\nSitemap: ${ORIGIN}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n',type:'text/plain; charset=utf-8'};
 if(u.pathname==='/sitemap.xml')return {headers,body:'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(open?PUBLIC.filter(p=>p!=='/index.html').map(p=>'<url><loc>'+ORIGIN+p+'</loc></url>').join(''):'')+'</urlset>',type:'application/xml; charset=utf-8'};
 return {headers};
}
module.exports={searchPolicy,ORIGIN,PUBLIC};

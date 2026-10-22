import { next } from '@vercel/functions';
import launch from './server/launch-clock.cjs';
import page from './server/countdown-page.cjs';
export const config={matcher:['/((?!assets/|favicon.ico|robots.txt|api/).*)']};
export default function proxy(request:Request){
 const state=launch.launchState(process.env),url=new URL(request.url),path=url.pathname;
 const ownerPage=['/owner-sign-in.html','/owner-preview.html'].includes(path);
 if(!state.pending){if(ownerPage)return new Response(null,{status:302,headers:{Location:(path==='/owner-preview.html'?'/workspace.html':'/sign-in.html')+url.search,'Cache-Control':'no-store'}});return next();}
 if(ownerPage&&process.env.OWNER_PRELAUNCH_ENABLED==='true'&&process.env.LAUNCH_HOLD!=='true')return next();
 // Serve only the countdown document before opening, even for direct dashboard/page URLs.
 return new Response(request.method==='HEAD'?null:page.countdownPage({ownerEntrance:process.env.OWNER_PRELAUNCH_ENABLED==='true'&&process.env.LAUNCH_HOLD!=='true'}),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}

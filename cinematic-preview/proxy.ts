import { next } from '@vercel/functions';
import launch from './server/launch-clock.cjs';
import page from './server/countdown-page.cjs';
export const config={matcher:['/((?!assets/|favicon.ico|robots.txt|api/).*)']};
export default function proxy(request:Request){
 if(!launch.launchState(process.env).pending)return next();
 // Serve only the countdown document before opening, even for direct dashboard/page URLs.
 return new Response(request.method==='HEAD'?null:page.countdownPage(),{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}

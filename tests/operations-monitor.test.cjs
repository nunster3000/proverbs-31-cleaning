const {test}=require('node:test'),assert=require('node:assert/strict');const {assessHealth,createOperationsHandler}=require('../cinematic-preview/server/operations.cjs');
const now=Date.parse('2026-10-23T15:00:00Z');
test('monitor flags missing, stale and failed backups and terminal emails, with daily alert suppression',()=>{
 assert.equal(assessHealth({backup:{succeeded_at:new Date(now-36*3600000).toISOString()}},now).alerts.length,0);
 assert.equal(assessHealth({backup:{succeeded_at:new Date(now-36*3600000-1).toISOString()}},now).shouldNotify,true);
 const h=assessHealth({backup:{succeeded_at:new Date(now-1000).toISOString(),failed_at:new Date(now).toISOString(),alerted_at:new Date(now-100).toISOString()},email_failures:1},now);assert.equal(h.alerts.length,2);assert.equal(h.shouldNotify,false);
 assert.equal(assessHealth({backup:{}},now).shouldNotify,true);
});
test('monitor is cron-protected and independent of the public launch gate',async()=>{let result,status,called=0;const h=createOperationsHandler({env:{CRON_SECRET:'private',OPERATIONS_MONITOR_ENABLED:'true',LAUNCH_COUNTDOWN_ENABLED:'true'},clock:()=>now,clientFactory:()=>({rpc:async()=>{called++;return{data:{backup:{succeeded_at:new Date(now).toISOString()}}}}})});const res={setHeader(){},set statusCode(v){status=v},end(v){result=JSON.parse(v)}};await h({method:'GET',headers:{}},res);assert.equal(status,401);assert.equal(called,0);await h({method:'GET',headers:{authorization:'Bearer private'}},res);assert.equal(status,200);assert.equal(result.enabled,true);assert.equal(result.issues,0);});

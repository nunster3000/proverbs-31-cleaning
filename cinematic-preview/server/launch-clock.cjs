// One server-owned launch instant: October 26, 2026, 5 AM Atlanta Eastern time.
const OPENS_AT='2026-10-26T05:00:00-04:00';
function launchState(env=process.env,now=Date.now()){
 const enabled=env.LAUNCH_COUNTDOWN_ENABLED==='true',opensAt=Date.parse(OPENS_AT);
 return {enabled,opensAt:OPENS_AT,serverNow:new Date(now).toISOString(),pending:enabled&&now<opensAt,remainingSeconds:enabled?Math.max(0,Math.ceil((opensAt-now)/1000)):0};
}
function effectiveEnv(env=process.env,now=Date.now()){
 const state=launchState(env,now);
 return {...env,AUTH_ENABLED:state.pending?'false':env.LAUNCH_HOLD==='true'?'false':state.enabled&&env.LAUNCH_LOGIN_ENABLED==='true'?'true':env.AUTH_ENABLED};
}
module.exports={OPENS_AT,launchState,effectiveEnv};

// Authenticated refreshes only; pause when hidden and never overlap requests.
window.P31AutoSync = {
  start({fetchUpdates,apply,onState=()=>{},visible=()=>document.visibilityState==='visible',interval=8000,setTimer=setTimeout,clearTimer=clearTimeout}) {
    let timer,stopped=false,busy=false,failures=0;
    const schedule=()=>{clearTimer(timer);if(!stopped && visible())timer=setTimer(tick,Math.min(60000,interval*2**failures));};
    async function tick(){
      clearTimer(timer);
      if(stopped || busy || !visible())return;
      busy=true;
      try{const updates=await fetchUpdates();if(stopped || !visible())return;await apply(updates);failures=0;onState('connected');}
      catch(error){if(!stopped){failures=Math.min(failures+1,4);onState('retrying',error);}}
      finally{busy=false;schedule();}
    }
    schedule();onState('connected');
    return {wake(){if(stopped)return;clearTimer(timer);if(visible())return tick();},pause(){clearTimer(timer);},stop(){stopped=true;clearTimer(timer);}};
  }
};

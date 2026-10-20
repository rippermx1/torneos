import {performance} from 'node:perf_hooks'
type Clock={now:()=>number;schedule:(callback:()=>void,delay:number)=>()=>void}
const realClock:Clock={now:()=>performance.now(),schedule:(callback,delay)=>{const timer=setTimeout(callback,delay);return()=>clearTimeout(timer)}}
// Fixed deadlines compensate timer rounding/callback delay. A long stall drops
// debt rather than running an unbounded catch-up loop on a saturated host.
export function periodic(periodMs:number,callback:()=>void,clock:Clock=realClock){
  let stopped=false,due=clock.now()+periodMs,cancel=()=>{}
  function schedule(){cancel=clock.schedule(run,Math.max(1,Math.ceil(due-clock.now())))}
  function run(){if(stopped)return;callback();due+=periodMs;if(due<clock.now()-periodMs)due=clock.now()+periodMs;if(!stopped)schedule()}
  schedule();return()=>{stopped=true;cancel()}
}

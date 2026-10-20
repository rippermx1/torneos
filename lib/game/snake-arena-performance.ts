export type ArenaRenderSample={fps?:number;frameMsP95?:number;wasmAllocatedMB?:number}
export type ArenaPerformanceSummary={state:'recording'|'complete';seconds:number;samples:number;fpsMean:number|null;fpsMin:number|null;fpsMax:number|null;worstWindowP95Ms:number|null;below55Seconds:number;wasmMinMiB:number|null;wasmMaxMiB:number|null;excluded:number;interruptions:number}
// Unity 005 publishes windows of at least 2 s. Count at most 2 s per receipt;
// discard warmup, gaps and inactive windows instead of extending a short sample.
export class ArenaPerformance {
  private lastAt:number|null=null
  private samples:{fps:number;p95?:number;wasm?:number;seconds:number}[]=[]
  private seconds=0;private excluded=0;private interruptions=0
  constructor(readonly targetSeconds=180){}
  pause(){if(this.seconds>=this.targetSeconds||this.samples.length>=180)return;if(this.lastAt!==null)this.interruptions++;this.lastAt=null}
  observe(sample:ArenaRenderSample,at:number,active:boolean){
    if(this.seconds>=this.targetSeconds||this.samples.length>=180)return this.summary()
    if(!active){this.pause();this.excluded++;return this.summary()}
    if(!Number.isFinite(at)||typeof sample.fps!=='number'||!Number.isFinite(sample.fps)||sample.fps<=0||[sample.frameMsP95,sample.wasmAllocatedMB].some(n=>n!==undefined&&(!Number.isFinite(n)||n<0))){this.excluded++;this.pause();return this.summary()}
    if(this.lastAt===null){this.lastAt=at;this.excluded++;return this.summary()}
    const delta=at-this.lastAt
    if(delta<1000){this.excluded++;return this.summary()}
    this.lastAt=at
    if(delta>3500){this.excluded++;this.interruptions++;return this.summary()}
    const seconds=Math.min(delta/1000,2,this.targetSeconds-this.seconds)
    this.samples.push({fps:sample.fps,p95:sample.frameMsP95,wasm:sample.wasmAllocatedMB,seconds});this.seconds+=seconds
    return this.summary()
  }
  summary():ArenaPerformanceSummary {
    let total=0,min=Infinity,max=0,p95:number|null=null,wasmMin:number|null=null,wasmMax:number|null=null,below55=0
    for(const s of this.samples){total+=s.fps*s.seconds;min=Math.min(min,s.fps);max=Math.max(max,s.fps);if(s.fps<55)below55+=s.seconds;if(s.p95!==undefined)p95=Math.max(p95??0,s.p95);if(s.wasm!==undefined){wasmMin=Math.min(wasmMin??s.wasm,s.wasm);wasmMax=Math.max(wasmMax??s.wasm,s.wasm)}}
    return {state:this.seconds>=this.targetSeconds||this.samples.length>=180?'complete':'recording',seconds:this.seconds,samples:this.samples.length,fpsMean:this.seconds?total/this.seconds:null,fpsMin:this.samples.length?min:null,fpsMax:this.samples.length?max:null,worstWindowP95Ms:p95,below55Seconds:below55,wasmMinMiB:wasmMin,wasmMaxMiB:wasmMax,excluded:this.excluded,interruptions:this.interruptions}
  }
}

export const QUALITY_LEVELS=['high','balanced','low'] as const
export type ArenaQuality=typeof QUALITY_LEVELS[number]
export type ArenaQualityMode='auto'|ArenaQuality
export const QUALITY_NAMES:Record<ArenaQuality,string>={high:'Alta',balanced:'Equilibrada',low:'Baja'}
export function isArenaQuality(value:unknown):value is ArenaQuality{return QUALITY_LEVELS.some(q=>q===value)}
export function isArenaQualityMode(value:unknown):value is ArenaQualityMode{return value==='auto'||isArenaQuality(value)}
type RenderWindow={fps?:number;frameMsP95?:number}
// Only consecutive, complete, active 2 s windows count. Recovery is deliberately slower.
export class ArenaAdaptiveQuality {
  mode:ArenaQualityMode='auto'
  quality:ArenaQuality='high'
  changes=0
  reason:'initial'|'manual'|'slow'|'recovered'='initial'
  private lastAt:number|null=null
  private changedAt:number|null=null
  private slow=0
  private healthy=0
  pause(){this.lastAt=null;this.slow=0;this.healthy=0}
  select(mode:ArenaQualityMode,at:number){
    this.mode=mode;this.pause();this.changedAt=Number.isFinite(at)?at:null
    if(mode!=='auto'&&mode!==this.quality){this.quality=mode;this.changes++;this.reason='manual'}
    return this.quality
  }
  observe(sample:RenderWindow,at:number,active:boolean){
    if(this.mode!=='auto')return this.quality
    if(!active||!Number.isFinite(at)||at<0||!Number.isFinite(sample.fps)||!sample.fps||sample.fps<0||sample.frameMsP95!==undefined&&(!Number.isFinite(sample.frameMsP95)||sample.frameMsP95<0)){this.pause();return this.quality}
    if(this.lastAt===null){this.lastAt=at;return this.quality}
    const elapsed=at-this.lastAt
    if(elapsed<=0){this.pause();return this.quality}
    if(elapsed<1000)return this.quality
    this.lastAt=at
    if(elapsed>3500){this.slow=0;this.healthy=0;return this.quality}
    const slow=sample.fps<50||(sample.frameMsP95??0)>35
    const healthy=sample.fps>=58&&(sample.frameMsP95??0)<=22
    this.slow=slow?this.slow+1:0;this.healthy=healthy?this.healthy+1:0
    const sinceChange=this.changedAt===null?Infinity:at-this.changedAt
    const index=QUALITY_LEVELS.indexOf(this.quality)
    let next=index,reason=this.reason
    if(this.slow>=2&&sinceChange>=6000&&index<2){next=index+1;reason='slow'}
    else if(this.healthy>=6&&sinceChange>=20000&&index>0){next=index-1;reason='recovered'}
    if(next!==index){this.quality=QUALITY_LEVELS[next];this.reason=reason;this.changedAt=at;this.slow=0;this.healthy=0;this.changes++}
    return this.quality
  }
  snapshot(){return {mode:this.mode,quality:this.quality,changes:this.changes,reason:this.reason}}
}

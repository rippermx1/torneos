export type LightRain={nextSpawnTick:number;endsTick:number|null;simulationHz:number;remaining:number}
export function readLightRain(value:unknown):LightRain|null{
  if(!value||typeof value!=='object')return null
  const r=value as LightRain
  if(!Number.isSafeInteger(r.nextSpawnTick)||r.nextSpawnTick<0||!Number.isInteger(r.simulationHz)||r.simulationHz<1||r.simulationHz>60||!Number.isInteger(r.remaining)||r.remaining<0||r.remaining>24)return null
  if(r.endsTick!==null&&(!Number.isSafeInteger(r.endsTick)||r.endsTick<0))return null
  if(r.endsTick===null&&r.remaining!==0)return null
  return r
}
export function lightRainHint(tick:number,rain:LightRain,food:{x:number;y:number;kind?:string}[],me?:{x:number;y:number}){
  const active=rain.endsTick!==null&&rain.endsTick>tick&&rain.remaining>0
  const target=active&&me?food.filter(f=>f.kind==='rain'&&Number.isFinite(f.x)&&Number.isFinite(f.y)).reduce<{x:number;y:number}|undefined>((best,f)=>!best||(f.x-me.x)**2+(f.y-me.y)**2<(best.x-me.x)**2+(best.y-me.y)**2?f:best,undefined):undefined
  const direction=target&&me?['→','↗','↑','↖','←','↙','↓','↘'][(Math.round(Math.atan2(target.y-me.y,target.x-me.x)*4/Math.PI)+8)%8]:''
  return {active,remaining:active?rain.remaining:0,seconds:Math.max(0,Math.ceil(((active?rain.endsTick!:rain.nextSpawnTick)-tick)/rain.simulationHz)),direction}
}

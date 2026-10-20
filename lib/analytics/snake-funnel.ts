export const FUNNEL_STEPS=['practice_view','game_ready','game_started','game_finished','tournaments_click','catalog_view','tournament_view','registration_confirmed'] as const
export type FunnelStep=typeof FUNNEL_STEPS[number]
export type FunnelEvent={event:Exclude<FunnelStep,'registration_confirmed'>;surface?:'header'|'result';availability?:'available'|'empty'|'unavailable'}
export type FunnelJourney={startedAt:number;steps:Partial<Record<FunnelStep,number>>;surface?:'header'|'result';availability?:FunnelEvent['availability']}
export type FunnelState={version:1;updatedAt:number;journeys:Record<string,FunnelJourney>}
export const FUNNEL_TTL=6*60*60*1000
export const FUNNEL_RETENTION=30*86400000
export function readFunnelEvent(value:unknown):FunnelEvent|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const b=value as Record<string,unknown>
  if(Object.keys(b).some(k=>!['event','surface','availability'].includes(k))||!FUNNEL_STEPS.includes(b.event as FunnelStep)||b.event==='registration_confirmed')return null
  if(b.surface!==undefined&&(b.event!=='tournaments_click'||typeof b.surface!=='string'||!['header','result'].includes(b.surface)))return null
  if(b.availability!==undefined&&(b.event!=='catalog_view'||typeof b.availability!=='string'||!['available','empty','unavailable'].includes(b.availability)))return null
  return b as FunnelEvent
}
export function funnelSummary(state:FunnelState,now=Date.now()){
  const journeys=Object.values(state.journeys).filter(j=>j.startedAt>=now-FUNNEL_RETENTION&&j.steps.practice_view!==undefined)
  const counts=Object.fromEntries(FUNNEL_STEPS.map(step=>[step,journeys.filter(j=>j.steps[step]!==undefined).length])) as Record<FunnelStep,number>
  // Conversion requires the ordered path; unrelated/replayed stages never inflate the numerator.
  const converted=journeys.filter(j=>{
    const stages=['practice_view','tournaments_click','catalog_view','tournament_view','registration_confirmed'] as const
    return stages.every((step,i)=>j.steps[step]!==undefined&&(i===0||j.steps[step]!>=j.steps[stages[i-1]]!))
  }).length
  const clickConversion=counts.tournaments_click?converted/counts.tournaments_click:null
  const practiceConversion=journeys.length?converted/journeys.length:null
  return {updatedAt:state.updatedAt,sessions:journeys.length,counts,converted,clickConversion,practiceConversion,clickSurfaces:{header:journeys.filter(j=>j.surface==='header').length,result:journeys.filter(j=>j.surface==='result').length},catalogAvailability:{available:journeys.filter(j=>j.availability==='available').length,empty:journeys.filter(j=>j.availability==='empty').length,unavailable:journeys.filter(j=>j.availability==='unavailable').length},scope:'Sesiones de navegador atribuidas a práctica Snake; no personas únicas, ventas, D7/D30 ni retorno causal.'}
}

'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {readPracticeLeaderboard,type PracticeLeaderboard} from '@/lib/game/snake-practice-leaderboard'
import {readSeasonLeaderboard,seasonLabel,practiceWeek,type LeaderboardScope,type SeasonLeaderboard} from '@/lib/game/snake-practice-season'
const SCOPE_NAMES:Record<LeaderboardScope,string>={historical:'Récord histórico',current:'Esta semana',previous:'Semana anterior'}
export function SnakePracticeLeaderboard({userId,latestRunId,active}:{userId:string|null;latestRunId:string;active:boolean}){
  const [scope,setScope]=useState<LeaderboardScope>('current')
  const [confirmed,setConfirmed]=useState<{board:PracticeLeaderboard|SeasonLeaderboard;scope:LeaderboardScope;owner:string|null}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const epoch=useRef(0)
  const load=useCallback(async(participating?:boolean)=>{
    const requestId=++epoch.current
    setBusy(true);setError('');setNotice('')
    try{
      const response=await fetch('/play/snake-arena/leaderboard?scope='+scope,{method:participating===undefined?'GET':'POST',headers:participating===undefined?undefined:{'Content-Type':'application/json'},body:participating===undefined?undefined:JSON.stringify({participating}),cache:'no-store',signal:AbortSignal.timeout(6000)})
      if(!response.ok)throw new Error('No se pudo actualizar la clasificación. Intenta nuevamente.')
      const value=await response.json(),data=scope==='historical'?readPracticeLeaderboard(value):readSeasonLeaderboard(value);if(!data||scope!=='historical'&&(data as SeasonLeaderboard).season.period!==scope)throw new Error('No se pudo confirmar la clasificación.')
      if(requestId===epoch.current){setConfirmed({board:data,scope,owner:userId});if(participating!==undefined)setNotice(participating?'Participación guardada para el ranking histórico y las temporadas.':'Récord oculto en todas las clasificaciones. Tu historial sigue guardado.')}
    }catch(cause){if(requestId===epoch.current)setError(cause instanceof Error?cause.message:'Clasificación no disponible.')}
    finally{if(requestId===epoch.current)setBusy(false)}
  },[scope,userId])
  useEffect(()=>{const generation=epoch;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);generation.current++}},[load,userId,latestRunId])
  const board=confirmed?.owner===userId?confirmed.board:null,displayScope=board?confirmed!.scope:scope
  const mine=board?.mine,season=board&&'season' in board?board.season as SeasonLeaderboard['season']:null
  // Refresh at the server-confirmed boundary and periodically while the panel is open.
  useEffect(()=>{
    if(active)return
    const interval=setInterval(()=>void load(),60000)
    const boundary=season?setTimeout(()=>void load(),Math.max(1000,Date.parse(practiceWeek(season.serverNow).endsAt)-season.serverNow+100)):undefined
    return()=>{clearInterval(interval);if(boundary)clearTimeout(boundary)}
  },[active,load,season])
  return <details open={!active} className="rounded-2xl border border-violet-300/25 bg-gradient-to-br from-[#171c35] to-[#0b1e29] p-4 text-violet-100" aria-label="Clasificación de práctica">
    <summary className="cursor-pointer text-sm font-semibold">Clasificación de práctica <span className="ml-2 text-xs font-normal text-violet-100/65">{SCOPE_NAMES[displayScope]}{mine?.position?` · Tu posición #${mine.position}`:''}</span></summary>
    <div role="group" aria-label="Periodo de clasificación" className="mt-3 flex flex-wrap gap-2">{(['current','previous','historical'] as const).map(value=><button key={value} type="button" aria-pressed={scope===value} onClick={()=>setScope(value)} className={scope===value?'rounded-lg border border-teal-200/40 bg-teal-200/15 px-3 py-2 text-xs font-semibold text-teal-100':'rounded-lg border border-violet-300/25 px-3 py-2 text-xs hover:bg-white/5'}>{SCOPE_NAMES[value]}</button>)}</div>
    <p className="mt-3 text-xs text-violet-100/70">Una fila por cuenta · Mejor puntaje guardado · Los empates comparten posición.</p>
    {displayScope!=='historical'&&<p className="mt-2 text-xs text-violet-100/70">{season?`${seasonLabel(season)} · ${season.period==='previous'?'Temporada terminada.':'Temporada actual.'} `:''}Se renueva el lunes a medianoche de Chile. El récord histórico y la XP se conservan.</p>}
    {board&&displayScope!==scope&&<p role="status" className="mt-2 text-xs text-amber-200">Mostrando datos confirmados de {SCOPE_NAMES[displayScope].toLowerCase()} mientras se consulta el periodo elegido.</p>}
    {mine?<div className="mt-3 rounded-xl border border-teal-300/20 bg-teal-300/5 p-3 text-sm text-teal-100">
      <p>{displayScope==='historical'?'Tu récord histórico':'Tu mejor puntaje de esta temporada'}: <strong>{mine.best}</strong> puntos · {mine.position?`Posición #${mine.position} de ${board!.players}`:mine.participating?displayScope==='previous'?'Sin partidas con puntos en esa temporada.':'Completa una partida con puntos para aparecer.':'Aún no participas.'}</p>
      <p className="mt-1 text-xs text-teal-100/65">{mine.participating?'Tu apodo y récord son visibles en histórico y temporadas. Puedes ocultarlos y conservar tus partidas.':'Participar publica tu apodo y mejores puntajes en histórico y temporadas.'}</p>
      <button type="button" disabled={busy} onClick={()=>void load(!mine.participating)} className="mt-3 rounded-lg border border-teal-200/40 bg-teal-200/10 px-4 py-2 text-xs font-semibold hover:bg-teal-200/20 disabled:opacity-50">{mine.participating?'Ocultar mi récord':'Publicar mi récord'}</button>
    </div>:board&&<p className="mt-3 text-xs text-violet-100/70"><a href="/sign-in?next=%2Fplay%2Fsnake-arena" className="text-teal-200 underline underline-offset-4">Inicia sesión</a> para publicar tu récord y ver tu posición.</p>}
    {board&&<>{board.entries.length?<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm" aria-label="Mejores récords de práctica"><thead className="text-xs text-violet-100/60"><tr><th scope="col" className="pb-2 pr-3">Posición</th><th scope="col" className="pb-2 pr-3">Jugador</th><th scope="col" className="pb-2 text-right">Puntos</th></tr></thead><tbody>{board.entries.map((entry,i)=><tr key={i} className={entry.isMe?'border-t border-white/10 bg-teal-200/10 text-teal-200':'border-t border-white/10'}><td className="py-2 pr-3 tabular-nums">#{entry.position}</td><th scope="row" className="max-w-40 break-words py-2 pr-3 font-normal">{entry.name}{entry.isMe&&<span className="ml-2 text-xs">· Tú</span>}</th><td className="py-2 text-right font-semibold tabular-nums">{entry.score}</td></tr>)}</tbody></table></div>:<p className="mt-4 text-sm text-violet-100/75">Todavía no hay récords publicados. Puedes ser el primero.</p>}<p className="mt-2 text-[11px] text-violet-100/55">{board.players} cuentas en la clasificación · Se muestran hasta 20.</p></>}
    <button type="button" disabled={busy} onClick={()=>void load()} className="mt-3 rounded-lg border border-violet-300/25 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50">{busy?'Actualizando…':'Actualizar clasificación'}</button>
    {notice&&<p role="status" className="mt-2 text-xs text-teal-200">{notice}</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-amber-200">{error}</p>}
  </details>
}

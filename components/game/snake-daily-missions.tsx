'use client'
import {useEffect,useRef,useState} from 'react'
import {DAILY_MISSIONS,dailyCelebration,type DailyProgress} from '@/lib/game/snake-daily-missions'
export function SnakeDailyMissions({progress,state,active,refresh}:{progress:DailyProgress|null;state:string;active:boolean;refresh:()=>void}){
  const [clock,setClock]=useState({source:0,seconds:0}),[notice,setNotice]=useState('')
  const previous=useRef<DailyProgress|null>(null),renew=useRef(refresh)
  useEffect(()=>{renew.current=refresh},[refresh])
  useEffect(()=>{
    if(!progress)return
    const changed=previous.current?.day!==progress.day,message=dailyCelebration(previous.current,progress);previous.current=progress
    if(!message&&!changed)return
    const show=setTimeout(()=>setNotice(message),0)
    return()=>clearTimeout(show)
  },[progress])
  useEffect(()=>{if(!notice)return;const clear=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(clear)},[notice])
  const day=progress?.day,serverNow=progress?.serverNow,reset=progress?.resetsAt
  useEffect(()=>{
    if(serverNow===undefined||!reset)return
    const started=performance.now();let lastRenew=-Infinity
    const timer=setInterval(()=>{
      const elapsed=performance.now()-started,seconds=Math.max(0,Math.ceil((Date.parse(reset)-serverNow-elapsed)/1000))
      setClock({source:serverNow,seconds})
      if(seconds===0&&elapsed-lastRenew>5000){lastRenew=elapsed;renew.current()}
    },1000)
    return()=>clearInterval(timer)
  },[day,serverNow,reset])
  if(!progress)return <div className="rounded-xl border border-sky-300/15 bg-[#0b2033] px-4 py-3 text-xs text-sky-100/75">Misiones diarias · Inicia sesión para acumular progreso entre partidas y ganar XP adicional.</div>
  const seconds=clock.source===progress.serverNow?clock.seconds:Math.max(0,Math.ceil((Date.parse(progress.resetsAt)-progress.serverNow)/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),time=[hours,minutes,seconds%60].map(n=>String(n).padStart(2,'0')).join(':'),done=progress.missions.filter(m=>m.complete).length
  return <details open={!active} className="rounded-xl border border-sky-300/25 bg-gradient-to-br from-[#0b2033] to-[#111f35] px-4 py-3 text-sky-100" aria-label="Misiones diarias">
    <summary className="cursor-pointer text-sm font-semibold"><span>Diarias · {done}/3</span><span className="ml-3 text-xs font-normal text-sky-100/70">{seconds?`Renuevan en ${time}`:'Renovando objetivos…'}</span></summary>
    <p className="mt-2 text-xs text-sky-100/70">Acumula entre partidas · Hasta 235 XP extra al día · Renuevan a medianoche de Chile.</p>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{DAILY_MISSIONS.map((m,i)=>{const value=progress.missions[i];return <div key={m.id} className={`rounded-xl border p-3 ${value.complete?'border-teal-200/40 bg-teal-200/10':'border-white/10 bg-white/5'}`}>
      <p className="text-xs font-semibold">{value.complete?'✓ ':''}{m.label}</p><p className="mt-1 text-xs">{value.value}/{m.target} · {m.xp} XP {value.complete&&'guardada'}</p>
      <div role="progressbar" aria-label={m.label} aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={value.value} className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-300 transition-all motion-reduce:transition-none" style={{width:`${value.value/m.target*100}%`}} /></div>
    </div>})}</div>
    <p role="status" className="mt-2 text-[11px] text-sky-100/65">{state==='retrying'?'Progreso pendiente · reintentando guardado':state==='saving'?'Guardando progreso diario…':'Progreso diario guardado'} · {progress.earned}/235 XP extra obtenida</p>
    {notice&&<p role="status" className="mt-2 rounded-lg border border-teal-200/30 bg-teal-200/10 p-2 text-xs font-semibold text-teal-100">✦ {notice}</p>}
  </details>
}

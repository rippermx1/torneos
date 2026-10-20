'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import builds from '@/lib/game/runtime-builds.json'
import {readFactory3dEvent} from '@/lib/game/factory-3d'
import type {ColonyVisit} from '@/lib/game/factory-3d-community'
import {PublicColonyMetrics,communityDate} from './factory-community'
import styles from './factory-community.module.css'
export function FactoryColonyVisit({id}:{id:string}) {
  const frame=useRef<HTMLIFrameElement>(null),latest=useRef<ColonyVisit|null>(null),ready=useRef(false)
  const [visit,setVisit]=useState<ColonyVisit|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('Consultando la colonia publicada…'),[refresh,setRefresh]=useState(0)
  const build=builds['factory-empire']
  const send=useCallback((method:'OnVisitState'|'OnVisitCenter',payload='')=>{frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type:'visit',method,payload},location.origin)},[build])
  useEffect(()=>{ready.current=false;const receive=(event:MessageEvent)=>{if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;const d=readFactory3dEvent(event.data,build);if(!d)return;if(d.type==='ready'){ready.current=true;if(latest.current)send('OnVisitState',JSON.stringify({state:latest.current.state}))}if(d.type==='visit-ready')setStatus('Visita de solo lectura · guardado confirmado.');if(d.type==='error')setStatus(d.payload)};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)
  },[build,id,send])
  useEffect(()=>{let active=true;const controller=new AbortController()
    async function load(){try{const r=await fetch(`/play/factory-empire/community/data?id=${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal});if(!r.ok){if(r.status===404)throw new Error('Esta colonia no está publicada o su dueño retiró la publicación.');throw new Error('No pudimos consultar esta colonia. Reintenta en unos momentos.')}const d:ColonyVisit=await r.json();if(active){latest.current=d;setVisit(d);setError('');if(ready.current)send('OnVisitState',JSON.stringify({state:d.state}));else setStatus('Preparando la visita 3D…')}}catch(e){if(active){latest.current=null;setVisit(null);setError(e instanceof Error?e.message:'No se pudo consultar la colonia.')}}}
    void load();const poll=setInterval(()=>{if(!document.hidden)void load()},15000);return()=>{active=false;controller.abort();clearInterval(poll)}
  },[id,refresh,build,send])
  return <div className={styles.page}><nav className={styles.nav} aria-label="Factory Empire"><Link className={styles.link} href="/play/factory-empire/community">Volver a la comunidad</Link><Link className={styles.link} href="/play/factory-empire">Volver a mi colonia</Link></nav>{error?<section className={styles.panel}><h1 className="text-2xl font-semibold">Visita no disponible</h1><p role="alert" className={styles.status}>{error}</p><button className={styles.button} onClick={()=>setRefresh(n=>n+1)}>Reintentar visita</button></section>:!visit?<p role="status">{status}</p>:<>
    <header className={styles.intro}><span className={styles.eyebrow}>COLONIA PUBLICADA · SOLO LECTURA</span><h1>{visit.colony.name}</h1><PublicColonyMetrics colony={visit.colony}/><p className={styles.time}>Guardado confirmado: <time dateTime={visit.colony.snapshotAt}>{communityDate(visit.colony.snapshotAt)}</time>. La visita no genera producción ni modifica ninguna partida.</p></header>
    <div className={styles.header}><span role="status" className={styles.muted}>{status}</span><div className={styles.actions}><button className={styles.button} onClick={()=>setRefresh(n=>n+1)}>Actualizar visita</button><button className={styles.button} onClick={()=>send('OnVisitCenter')}>Centrar colonia</button></div></div>
    <div className={styles.viewer}><iframe ref={frame} key={`${build}:${id}`} title={`Visita de solo lectura a ${visit.colony.name}`} src={`/games/factory-empire/${build}/index.html?persistence=visit`} sandbox="allow-scripts allow-same-origin"/></div>
    <p className={styles.muted}>Cámara: botón derecho o central y arrastrar, rueda para zoom, Inicio para centrar. En pantalla táctil, arrastra la colonia para recorrerla.</p>
    <section className={styles.panel}><h2>Industria compartida</h2><p className={styles.muted}>{visit.colony.prestiges} ascensiones · {visit.state.sectors.length} sectores · {visit.state.technologies.length} tecnologías · {visit.state.earnedAchievements?.length??0} logros conservados.</p><div className={`${styles.industry} mt-4`}>{visit.state.structures.length?visit.state.structures.map(b=><article className={styles.machine} key={b.instanceId}><strong>{({'mining-drone':'Dron minero','surface-drill':'Taladro de superficie','drilling-platform':'Plataforma perforadora','industrial-beacon':'Baliza industrial'} as Record<string,string>)[b.definitionId]??b.definitionId}</strong><p>Nivel {b.level} · celda {b.cellX}, {b.cellZ}</p></article>):<p className={styles.muted}>Esta colonia todavía no tiene máquinas instaladas.</p>}</div></section>
  </>}</div>
}

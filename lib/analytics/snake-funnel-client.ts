'use client'
import type {FunnelEvent} from './snake-funnel'
let pending=Promise.resolve()
export function canBrowseSnakeTournaments(){return typeof window==='undefined'||!['3092','3093','3095'].includes(window.location.port)}
export function trackSnakeFunnel(event:FunnelEvent){
  if(process.env.NEXT_PUBLIC_SNAKE_FUNNEL!=='1'||!canBrowseSnakeTournaments())return
  // First view sets the signed HttpOnly session cookie before later requests. Small keepalive requests survive navigation.
  pending=pending.then(async()=>{try{await fetch('/play/snake-arena/metrics',{method:'POST',credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(2000),headers:{'Content-Type':'application/json'},body:JSON.stringify(event)})}catch{}})
}

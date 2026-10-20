import config from '@/config/snake-practice-sponsor.json'
import {readSnakeSponsor} from '@/lib/game/snake-result-sponsor'
export function SnakeResultSponsor({configuration=config}:{configuration?:unknown}){
  const sponsor=readSnakeSponsor(configuration)
  if(!sponsor)return null
  return <aside aria-label="Publicidad de patrocinador" className="rounded-xl border border-violet-300/20 bg-[#101b2c] px-4 py-4 text-white">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="rounded-full bg-violet-200/10 px-2 py-1 text-violet-100">Publicidad</span><span className="text-white/60">{sponsor.sponsor}</span></div>
    <p className="text-sm font-semibold text-white">{sponsor.title}</p>
    {sponsor.description&&<p className="mt-1 text-xs text-white/70">{sponsor.description}</p>}
    <a href={sponsor.href} target="_blank" rel="sponsored nofollow noopener noreferrer" className="mt-3 inline-block rounded-lg border border-violet-200/30 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-200/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200">Conocer más <span aria-hidden="true">↗</span><span className="sr-only"> · abre una nueva pestaña</span></a>
  </aside>
}

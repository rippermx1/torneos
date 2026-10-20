import Link from 'next/link'
import {snakeAdmin,SNAKE_PUBLIC_COLUMNS} from '@/lib/snake-arena/server'
import {SnakeFunnelObserver} from '@/components/game/snake-funnel'
export async function SnakeCatalog(){
  if(process.env.TORNEOS_ENV==='cloud-development')return null
  const {data,error}=await snakeAdmin().from('snake_tournaments').select(SNAKE_PUBLIC_COLUMNS).order('starts_at',{ascending:false}).limit(12)
  return <section className="space-y-4" aria-label="Torneos de Snake Arena"><SnakeFunnelObserver event="catalog_view" availability={error?'unavailable':data?.length?'available':'empty'}/><div><h2 className="text-2xl font-bold">Snake Arena</h2><p className="text-sm text-muted-foreground">Sala privada · Inicio simultáneo · Una vida · Inscripción gratuita, sin premios monetarios.</p></div>
    {error?<p role="alert">No se pudieron consultar los torneos de Snake Arena.</p>:!data?.length?<p className="text-sm text-muted-foreground">Próximamente publicaremos nuevas rondas.</p>:<div className="grid gap-4 sm:grid-cols-2">{data.map(t=><Link key={t.id} href={`/tournaments/snake-arena/${t.id}`} className="space-y-2 rounded-xl border p-5 hover:border-teal-500"><p className="font-semibold">{t.name}</p><p className="text-sm">{new Date(t.starts_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} (Chile)</p><p className="text-sm">{t.duration_seconds} s · Hasta {t.max_players} jugadores · {({open:'Inscripción abierta',locked:'Sala abierta',live:'En juego',completed:'Resultados disponibles',cancelled:'Cancelado'})[t.status]}</p><p className="text-sm font-semibold text-teal-700">Ver reglas y participar →</p></Link>)}</div>}
    <Link href="/tournaments/snake-arena/leaderboard" className="inline-block rounded-lg border border-teal-600/30 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">Ver clasificación competitiva →</Link>
  </section>
}

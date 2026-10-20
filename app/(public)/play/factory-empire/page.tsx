import type {Metadata} from 'next'
import Link from 'next/link'
import {UnityFactoryEmpire3D} from '@/components/game/unity-factory-empire-3d'
export const metadata: Metadata = {title: 'Factory Empire 3D — TorneosPlay', description: 'Extrae ferrita, coloca máquinas y expande tu colonia minera 3D.'}
export default function FactoryEmpirePage() {
  return <div className="mx-auto w-full space-y-4 px-3 py-4 sm:px-6">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Factory Empire 3D</h1><p className="mt-1 text-sm text-muted-foreground">Colonia minera · práctica gratuita en desarrollo</p></div><Link className="text-sm underline" href="/play">Volver a juegos</Link></div>
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg border px-4 text-sm" href="/play/factory-empire/community">Comunidad · visitar colonias</Link><Link className="inline-flex min-h-12 items-center rounded-lg border px-4 text-sm" href="/play/factory-empire/challenge">Desafío · 24 horas</Link></div>
    <UnityFactoryEmpire3D />
    <p className="text-xs text-muted-foreground">La partida local se guarda en este navegador. Jugar con mi cuenta abre otra colonia, con guardado y producción confirmados por el servidor y hasta ocho horas de ausencia. Se conservan por separado: la partida local no se importa ni sobrescribe. Esta práctica no concede premios.</p>
  </div>
}

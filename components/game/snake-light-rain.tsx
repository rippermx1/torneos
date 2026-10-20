import type {lightRainHint} from '@/lib/game/snake-light-rain'
export function SnakeLightRain({hint}:{hint:ReturnType<typeof lightRainHint>}){
  return <div aria-label="Lluvia de luces" className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-amber-100 ${hint.active?'border-amber-200/50 bg-gradient-to-r from-[#382d1e] via-[#222133] to-[#0b2033] shadow-lg shadow-amber-300/10':'border-amber-200/15 bg-[#111d28]'}`}>
    <span aria-hidden="true" className={hint.active?'text-3xl text-amber-200 drop-shadow-[0_0_8px_#fcd34d]':'text-2xl text-amber-100/50'}>✧</span>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Lluvia de luces {hint.active&&<span aria-label="Dirección de las luces" className="ml-2 text-lg">{hint.direction}</span>}</p><p className="text-xs text-amber-100/75">{hint.active?`${hint.remaining} luces extra en grupos dorados · ${hint.seconds} s para recogerlas`:`Próxima lluvia en ${hint.seconds} s · busca los grupos dorados`}</p></div>
  </div>
}

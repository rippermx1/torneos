import {SNAKE_APPEARANCES,canUseAppearance,type SnakeAppearance} from '@/lib/game/snake-arena-cosmetics'
export function SnakeCosmetics({appearance,choose,disabled,accountXp,accountState}:{appearance:SnakeAppearance;choose:(id:SnakeAppearance)=>void;disabled:boolean;accountXp:number|null;accountState:string}){
  const available=SNAKE_APPEARANCES.filter(s=>canUseAppearance(s.id,accountXp)).length
  return <fieldset className="px-4 pb-4 text-white" disabled={disabled}>
    <legend className="px-2 text-sm font-semibold text-teal-100">Elige tu criatura</legend>
    <p className="mb-3 text-xs text-teal-100/65">{accountState==='loading'?'Consultando tus desbloqueos…':`${available}/6 aspectos disponibles${accountXp===null?' · Gana XP con una cuenta':` · Nivel ${Math.floor(accountXp/100)+1}`}`}</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{SNAKE_APPEARANCES.map(skin=>{
      const unlocked=canUseAppearance(skin.id,accountXp),selected=appearance===skin.id
      return <button type="button" key={skin.id} disabled={!unlocked} aria-label={unlocked?`Elegir ${skin.name}`:`${skin.name} bloqueado · Nivel ${skin.level}`} aria-pressed={selected&&unlocked} onClick={()=>choose(skin.id)} className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition enabled:hover:bg-white/10 aria-pressed:border-teal-200 aria-pressed:bg-teal-200/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200 disabled:cursor-default">
        <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-semibold ${!unlocked?'bg-violet-200/10 text-violet-200':skin.level>1?'bg-teal-200/10 text-teal-200':'bg-white/5 text-white/60'}`}>{skin.level===1?'Inicial':unlocked?'Desbloqueado':`Nivel ${skin.level}`}</span>
        <span aria-hidden="true" className={`mb-3 flex h-8 items-center ${unlocked?'':'opacity-50'}`}>{Array.from({length:8},(_,i)=><span key={i} className="-mr-1 block rounded-full" style={{width:i===7?28:22,height:i===7?28:22,background:skin.colors[i%skin.colors.length],boxShadow:i===7?`0 0 14px ${skin.colors[1]}70`:undefined}} />)}</span>
        <span className={`block text-sm font-semibold ${unlocked?'text-white':'text-white/65'}`}>{skin.name}{selected&&unlocked?' · Elegida':''}</span>
        <span className="mt-1 block text-xs text-white/65">{skin.description}</span>
        {skin.level>1&&<span className={`mt-2 block text-xs ${unlocked?'text-teal-200/80':'text-violet-200/80'}`}>{unlocked?`Disponible desde nivel ${skin.level}`:`${Math.min(accountXp??0,(skin.level-1)*100)}/${(skin.level-1)*100} XP de cuenta para desbloquear`}</span>}
      </button>
    })}</div>
    <p className="mt-3 text-xs text-white/65">Aurora, Nebulosa y Solar están disponibles desde el inicio. Cometa, Eclipse y Prisma se desbloquean con XP guardada de cuenta; cambia entre partidas. Todos tienen las mismas reglas de juego.</p>
    {accountXp===null&&accountState!=='loading'&&<a className="mt-3 inline-block text-xs font-semibold text-teal-300 underline underline-offset-4" href="/sign-in?next=%2Fplay%2Fsnake-arena">Inicia sesión para guardar XP y desbloquear aspectos</a>}
  </fieldset>
}

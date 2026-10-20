import {QUALITY_NAMES,isArenaQualityMode,type ArenaQuality,type ArenaQualityMode} from '@/lib/game/snake-arena-quality'
export function SnakeQuality({mode,quality,applied,onChange,disabled}:{mode:ArenaQualityMode;quality:ArenaQuality;applied:ArenaQuality|null;onChange:(mode:ArenaQualityMode)=>void;disabled:boolean}){
  return <div className="rounded-xl border border-teal-400/15 bg-[#0b1d2b] px-4 py-3 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-3 text-sm text-teal-100">Calidad visual
        <select aria-label="Calidad visual" disabled={disabled} value={mode} onChange={e=>{if(isArenaQualityMode(e.target.value))onChange(e.target.value)}} className="rounded-lg border border-teal-200/25 bg-[#102b3b] px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200 disabled:opacity-50">
          <option value="auto">Automática</option><option value="high">Alta</option><option value="balanced">Equilibrada</option><option value="low">Baja</option>
        </select>
      </label>
      <p role="status" className="text-xs text-teal-100/80">{applied===quality?`Efectos: ${QUALITY_NAMES[applied]}`:'Aplicando calidad…'}</p>
    </div>
    <p className="mt-2 text-xs text-teal-100/65">{mode==='auto'?'Ajusta destellos y estelas según la fluidez durante la partida.':'Tu elección se conserva en este navegador.'} Las criaturas, los recursos y las señales de peligro se mantienen.</p>
  </div>
}

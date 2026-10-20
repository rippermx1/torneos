import type {CompetitionSummary, LeaderboardPage, PlanetDirectoryPage, PlanetVisit} from './factory-reference/contracts'
import type {FactoryCatalogOption, FactoryCatalogRow} from './factory-catalog'
import {formatMilli} from './factory-empire'

export interface PublicFactoryState {directory?: PlanetDirectoryPage; ranking?: LeaderboardPage; competition?: CompetitionSummary; visit?: PlanetVisit}
const plain = (text: string) => text.replace(/[<>]/g, '').slice(0, 80)
const option = (id: string, label: string): FactoryCatalogOption => ({id, label, quote: 'Consulta del snapshot local', enabled: true, confirmation: ''})
export function publicFactoryRows(state: PublicFactoryState): FactoryCatalogRow[] {
  const rows: FactoryCatalogRow[] = [{id: 'directory', section: 'UNIVERSO', title: 'Planetas publicados', detail: 'Visita industrias y compara producción. Directorio local de la referencia; puede incluir planetas simulados. Tu sesión de invitado no publica un planeta.', options: [option('directory:refresh', 'Abrir directorio'), ...(state.directory?.next_cursor ? [option('directory:next', 'Más planetas')] : [])]},
    {id: 'ranking', section: 'UNIVERSO', title: 'Clasificación de producción', detail: state.competition?.own ? `Tu puesto: ${state.competition.own.rank}. Métricas publicadas por el servidor.` : 'Consulta la clasificación local. Publicar tu planeta y seguir un rival requiere una cuenta registrada en la referencia.', options: [option('ranking:refresh', 'Ver clasificación'), ...(state.ranking?.next_cursor ? [option('ranking:next', 'Más puestos')] : [])]}]
  const entries = new Map((state.directory?.items ?? []).map(p => [p.id, p]))
  for (const p of state.ranking?.items ?? []) entries.set(p.id, p)
  for (const p of entries.values()) {
    const ranked = state.ranking?.items.find(r => r.id === p.id), v = state.visit?.id === p.id ? state.visit : undefined
    rows.push({id: `public-${p.id}`, section: 'UNIVERSO', title: `${ranked ? `#${ranked.rank} · ` : ''}${plain(p.name)}`, detail: `Nivel ${p.level} · ${formatMilli(p.production_milli_per_second)} /s · ${p.ascensions} ascensiones. ${v ? `Visita: ${v.industry.map(m => `${plain(m.name)} ${m.owned} (nv.${m.level})`).join(', ')}.` : 'Visita para observar su industria, sin modificarla.'}`, options: [option(`visit:${p.id}`, v ? 'Actualizar visita' : 'Visitar planeta')]})
  }
  return rows
}
export function publicPlanetAllowed(state: PublicFactoryState, id: string) {return [...(state.directory?.items ?? []), ...(state.ranking?.items ?? [])].some(p => p.id === id)}

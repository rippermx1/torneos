import type {Action} from './factory-reference/contracts'
import {formatMilli, type FactoryResult} from './factory-empire'

export interface FactoryCatalogOption {id: string; label: string; quote: string; enabled: boolean; confirmation: string}
export interface FactoryCatalogRow {id: string; section: string; title: string; detail: string; options: FactoryCatalogOption[]}
export interface FactoryCatalogAction {action: Action; enabled: boolean}

/** Presentation and exact comparisons only. Every quote and prerequisite is from the API. */
export function projectFactoryCatalog(result: FactoryResult) {
  const s = result.state, rows: FactoryCatalogRow[] = [], actions = new Map<string, FactoryCatalogAction>()
  const balance = BigInt(s.balance_milli), cores = s.evolution_cores ?? 0
  // A7-07 service rejects all frontier/ship mutations, including fresh saves where
  // vespera.retired is false because no historical colony ever existed.
  const expansionRetired = true
  const affordable = (cost: number | string | null | undefined) => cost != null && balance >= BigInt(cost)
  const money = (cost: number | string | null | undefined) => cost == null ? 'No disponible' : `${formatMilli(cost)} Ferrite`
  const option = (id: string, label: string, quote: string, enabled: boolean, action: Action, confirmation = ''): FactoryCatalogOption => {
    if (actions.has(id)) throw new Error('Acción duplicada del catálogo.')
    actions.set(id, {action, enabled}); return {id, label, quote, enabled, confirmation}
  }
  const add = (section: string, id: string, title: string, detail: string, options: FactoryCatalogOption[] = []) => rows.push({section, id, title, detail, options})
  for (const m of s.machines) {
    const opts: FactoryCatalogOption[] = []
    for (const q of [1, 10, 100, 'max'] as const) {
      const cost = q === 'max' ? m.max_cost_milli : m.bulk_costs_milli?.[String(q) as '1' | '10' | '100'] ?? (q === 1 ? m.cost_milli : null)
      const count = q === 'max' ? m.max_affordable ?? 0 : q
      opts.push(option(`buy:${m.id}:${q}`, `Comprar ${q === 'max' ? `máx. (${count})` : q}`, money(cost), m.owned + count <= m.max_owned && count > 0 && affordable(cost), q === 1 ? {kind: 'buy_machine', machine_id: m.id} : {kind: 'buy_machine_bulk', machine_id: m.id, quantity: q}))
    }
    for (const q of [1, 10, 100, 'max'] as const) {
      const refund = q === 'max' ? m.sell_max_refund_milli : m.sell_refunds_milli?.[String(q) as '1' | '10' | '100']
      const count = q === 'max' ? m.owned : q
      const quote = money(refund)
      opts.push(option(`sell:${m.id}:${q}`, `Vender ${q === 'max' ? 'todo' : q}`, `Reembolso ${quote}`, count > 0 && count <= m.owned && refund != null, {kind: 'sell_machine', machine_id: m.id, quantity: q}, `Vender ${count} ${m.name}. Reembolso: ${quote}. Tu producción disminuirá. El servidor confirma el importe final.`))
    }
    add('MÁQUINAS', m.id, `${m.name} · ${m.owned}/${m.max_owned}`, `${m.description ?? ''} Base +${formatMilli(m.rate_milli_per_second)} /s por unidad · nivel ${m.level ?? 1}.`, opts)
  }
  add('TECNOLOGÍA', 'laser', `Láser · nivel ${s.click_level ?? 0}`, `+${formatMilli(s.click_yield_milli)} por toque confirmado.`, [option('upgrade:laser', 'Mejorar láser', money(s.click_upgrade_cost_milli), affordable(s.click_upgrade_cost_milli), {kind: 'upgrade_click'})])
  for (const u of s.industrial_upgrades ?? []) add('TECNOLOGÍA', u.id, u.name, `${u.description} ${u.owned ? 'INSTALADA' : u.requirement}`, [option(`industrial:${u.id}`, u.owned ? 'Instalada' : 'Instalar', money(u.cost_milli), !u.owned && u.unlocked && affordable(u.cost_milli), {kind: 'buy_industrial_upgrade', upgrade_id: u.id})])
  for (const u of s.amplifier_upgrades ?? []) add('TECNOLOGÍA', u.id, u.name, `${u.description} ${u.owned ? 'INSTALADA' : u.requirement}`, [option(`amplifier:${u.id}`, u.owned ? 'Instalada' : `Multiplicar ×${u.multiplier}`, money(u.cost_milli), !u.owned && u.unlocked && affordable(u.cost_milli), {kind: 'buy_amplifier_upgrade', upgrade_id: u.id})])
  for (const u of s.synergies ?? []) add('TECNOLOGÍA', u.id, `${u.name} · ${u.active ? 'Activa' : 'Pendiente'}`, `${u.description} Bono confirmado +${formatMilli(u.bonus_milli_per_second)} /s.`)
  for (const m of s.milestones ?? []) add('OBJETIVOS', m.id, `${m.completed ? '✓ ' : ''}${m.title}`, `${m.requirement} Premio automático: ${money(m.reward_milli)}. ${m.completed ? 'Acreditado.' : ''}`)
  const tracked = s.tracked_achievements ?? []
  for (const a of [...(s.achievements ?? [])].sort((a, b) => Number(tracked.includes(b.id)) - Number(tracked.includes(a.id)) || Number(a.unlocked) - Number(b.unlocked))) {
    const isTracked = tracked.includes(a.id), display = (n: string | number) => a.unit.startsWith('milli_') ? formatMilli(n) : String(n)
    add('LOGROS', a.id, `${isTracked ? '★ ' : ''}${a.unlocked ? '✓ ' : ''}${a.title}`, `${a.description} ${display(a.progress)} / ${display(a.target)} · ${a.reward_label}`, a.trackable || isTracked ? [option(`track:${a.id}`, isTracked ? 'Quitar objetivo' : 'Fijar objetivo', isTracked ? 'Objetivo fijado' : `${tracked.length}/3 fijados`, isTracked || tracked.length < 3, {kind: isTracked ? 'untrack_achievement' : 'track_achievement', achievement_id: a.id})] : [])
  }
  add('EVOLUCIÓN', 'cores', `${cores} núcleos de evolución`, 'Se obtienen con el tiempo del servidor: un núcleo cada día. Evoluciona las máquinas de tu industria. No se gastan por mirar este panel.')
  for (const m of s.machines) add('EVOLUCIÓN', `evolve-${m.id}`, `${m.name} · nivel ${m.level ?? 1}`, `Posee al menos una unidad. Nivel máximo: 3. +${formatMilli(m.rate_milli_per_second)} /s por unidad actualmente.`, [option(`evolve:${m.id}`, 'Evolucionar', `${money(m.evolution_ferrite_cost_milli)} · ${m.evolution_cores_cost ?? '—'} núcleos`, m.owned > 0 && m.evolution_cores_cost != null && cores >= m.evolution_cores_cost && affordable(m.evolution_ferrite_cost_milli), {kind: 'evolve_machine', machine_id: m.id})])
  const cal = s.calibration
  if (cal) add('EVENTOS', 'calibration', 'Bono del taladro', `Supera tu récord de ${cal.drill_peak ?? 0} taladros para obtener un crédito. Disponibles: ${cal.credits ?? 0}.`, cal.choices.map(c => option(`calibrate:${c.power_cells}`, `Calibrar · energía ${c.power_cells}`, `Premio ${money(c.reward_milli)}`, cal.unlocked && cal.ready, {kind: 'calibrate_drill', power_cells: c.power_cells})))
  const special = s.special_mineral
  add('EVENTOS', 'special', 'Mineral excepcional', special ? `Oferta del servidor · ${Math.max(0, Math.ceil((special.expires_ms - s.server_time_ms) / 1000))} s al sincronizar.` : 'Explora Nereida. El servidor puede ofrecer un mineral con recompensa temporal.', special ? [option(`special:${special.event_id}`, 'Extraer mineral', money(special.reward_milli), special.expires_ms > s.server_time_ms, {kind: 'claim_special_mineral', event_id: special.event_id})] : [])
  for (const e of s.temporal_effects ?? []) add('EVENTOS', e.id, e.name, `×${e.multiplier} durante ${e.duration_ms / 60000} min. ${e.active_expires_ms > s.server_time_ms ? 'ACTIVO' : !e.unlocked ? 'Construye la máquina requerida para desbloquear.' : 'Espera una oferta temporal.'}`, e.offer ? [option(`temporal:${e.id}:${e.offer.event_id}`, 'Activar impulso', 'Oferta temporal gratuita', e.unlocked && e.offer.expires_ms > s.server_time_ms, {kind: 'claim_temporal_event', effect_id: e.id, event_id: e.offer.event_id})] : [])
  for (const galaxy of s.universe?.galaxies ?? []) for (const p of galaxy.planets.filter(p => p.colonized)) add('UNIVERSO', p.id, `${p.name} · ${expansionRetired ? 'Archivo' : p.colonized ? 'Colonizado' : 'Frontera'}`, `${galaxy.name} · ${p.colonist_count} colonos. ${expansionRetired ? 'Expansión antigua retirada; visita planetas publicados en el directorio.' : !p.unlocked && !p.colonized ? 'Continúa la progresión para desbloquear.' : ''}`, p.kind === 'frontier' && !expansionRetired ? [option(`colonize:${p.id}`, 'Colonizar', `${money(p.ferrite_cost_milli)} · ${p.cores_cost ?? '—'} núcleos`, !p.colonized && p.unlocked && p.cores_cost != null && cores >= p.cores_cost && affordable(p.ferrite_cost_milli), {kind: 'colonize_planet', planet_id: p.id})] : [])
  if (s.vespera?.colonized) add('UNIVERSO', 'vespera-history', `${s.vespera.name} · Archivo`, `Colonia histórica: ${s.vespera.rigs} módulos. Producción convertida a Nereida: +${formatMilli(s.converted_vespera_rate_milli_per_second ?? 0)} /s.`)
  const fleet = s.fleet
  if (fleet && fleet.ships.length > 0) {
    add('FLOTA', 'fleet', `${fleet.ships.length}/${fleet.max_ships} naves`, `${expansionRetired ? 'Flota histórica. El astillero anterior está retirado.' : fleet.unlocked ? 'Flota disponible' : 'Coloniza la frontera para desbloquear la flota.'} Ataque ${fleet.totals.attack} · reparación ${fleet.totals.repair} · escudo ${fleet.totals.shield}.`)
    for (const t of fleet.ship_types) add('FLOTA', t.id, `${t.name} · ${t.owned}`, `Rol: ${t.role}. Ataque ${t.base_stats.attack} · reparación ${t.base_stats.repair} · escudo ${t.base_stats.shield}.`, expansionRetired ? [] : [option(`ship:${t.id}`, 'Construir nave', `${money(t.build_ferrite_cost_milli)} · ${t.build_cores_cost} núcleos`, fleet.unlocked && fleet.ships.length < fleet.max_ships && cores >= t.build_cores_cost && affordable(t.build_ferrite_cost_milli), {kind: 'build_ship', ship_type_id: t.id})])
    for (const ship of fleet.ships) add('FLOTA', ship.id, `${ship.name} · nivel ${ship.level}`, `${ship.role} · ataque ${ship.stats.attack} · reparación ${ship.stats.repair} · escudo ${ship.stats.shield}`, expansionRetired ? [] : [option(`ship-evolve:${ship.id}`, 'Evolucionar nave', `${money(ship.evolution_ferrite_cost_milli)} · ${ship.evolution_cores_cost ?? '—'} núcleos`, ship.evolution_cores_cost != null && cores >= ship.evolution_cores_cost && affordable(ship.evolution_ferrite_cost_milli), {kind: 'evolve_ship', ship_id: ship.id})])
  }
  const a = s.ascension
  if (a) add('LEGADO', 'ascension', `Ascensión · ciclo ${a.ascension_count + 1}`, `Extraído este ciclo: ${money(a.run_lifetime_milli)}. Bono ${a.bonus_percent_now}% → ${a.bonus_percent_after}%. Próximo punto: ${money(a.next_point_at_run_milli)}.`, [option(`ascend:${a.ascension_count}:${a.gain_points}`, `Ascender · +${a.gain_points} puntos`, `${a.available_legacy_points ?? a.legacy_points} puntos disponibles`, a.can_ascend, {kind: 'ascend', expected_gain: a.gain_points, expected_ascensions: a.ascension_count}, `Comenzar otro ciclo y ganar ${a.gain_points} puntos. Reinicia: ${a.resets.join(', ')}. Conserva: ${a.preserves.join(', ')}. Esta acción reinicia tu industria.`)])
  for (const u of s.legacy_upgrades ?? []) add('LEGADO', u.id, u.name, `${u.description} ${u.effect_label}. ${!u.unlocked ? 'Requiere la mejora anterior de esta rama.' : ''}`, [option(`legacy:${u.id}`, u.owned ? 'Permanente instalada' : 'Comprar legado', `${u.cost_points} puntos`, !u.owned && u.unlocked && u.affordable, {kind: 'buy_legacy_upgrade', upgrade_id: u.id})])
  if (rows.length > 256) throw new Error('Catálogo supera la cota de esta versión.')
  return {rows, actions}
}

/** Prevent arbitrary payloads from Unity. Resolve only an offered, currently enabled action. */
export function resolveFactoryAction(result: FactoryResult, id: string): Action | null {
  const entry = projectFactoryCatalog(result).actions.get(id)
  return entry?.enabled ? entry.action : null
}

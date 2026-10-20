import {describe, expect, it} from 'vitest'
import {projectFactoryCatalog, resolveFactoryAction} from '../factory-catalog'
import {FactoryClickBuffer} from '../factory-click-buffer'
import {FACTORY_BUILD, FACTORY_CHANNEL, readFactoryIntent, toFactoryFeedback, type FactoryResult} from '../factory-empire'
import {startTrainingDuel, advanceTrainingDuel} from '../factory-reference/core/training-duel'
import type {FleetView} from '../factory-reference/contracts'
import {publicFactoryRows, publicPlanetAllowed} from '../factory-public-planets'
import {referenceTarget} from '../factory-reference-proxy'

function fixture(): FactoryResult {
  return {state: {revision: 2, server_time_ms: 100, balance_version: '1.7.0', planet: 'Nereida-7', balance_milli: '9007199254740993', rate_milli_per_second: 200, click_yield_milli: 1000, click_upgrade_cost_milli: 25000, offline_cap_ms: 21600000,
    evolution_cores: 1,
    machines: [{id: 'drone', name: 'Dron', description: 'Recolecta.', owned: 10, level: 1, max_owned: 250, cost_milli: 15000, rate_milli_per_second: 200, bulk_costs_milli: {'1': 15000, '10': 100000, '100': null}, max_affordable: 2, max_cost_milli: '9007199254740994', sell_refunds_milli: {'1': 2000, '10': 20000, '100': null}, sell_max_refund_milli: 20000, evolution_cores_cost: 2, evolution_ferrite_cost_milli: 10000}],
    industrial_upgrades: [{id: 'test_upgrade', name: 'Tecnología', description: 'Mejora.', requirement: 'Posee un taladro.', cost_milli: 1000, machine_id: 'drone', bonus_per_unit_milli: 100, owned: false, unlocked: false, required_milestone: null}],
    ascension: {run_lifetime_milli: 10000000000, best_run_milli: 10000000000, historical_vespera_milli: 0, legacy_points: 0, ascension_count: 0, gain_points: 1, legacy_points_after: 1, bonus_percent_now: 0, bonus_percent_after: 1, next_point_at_run_milli: 40000000000, can_ascend: true, resets: ['Máquinas', 'Saldo'], preserves: ['Logros', 'Planetas']},
  }, offline: {elapsed_ms: 0, credited_ms: 0, earned_milli: 0, capped: false}}
}
describe('Full Factory catalog boundary', () => {
  it('offers bulk purchases and sales using server quotes, including exact max affordability', () => {
    const r = fixture(), p = projectFactoryCatalog(r)
    expect(resolveFactoryAction(r, 'buy:drone:10')).toEqual({kind: 'buy_machine_bulk', machine_id: 'drone', quantity: 10})
    expect(resolveFactoryAction(r, 'buy:drone:100')).toBeNull()
    expect(resolveFactoryAction(r, 'buy:drone:max')).toBeNull()
    expect(p.rows[0].options.find(o => o.id === 'sell:drone:10')?.confirmation).toContain('producción disminuirá')
    expect(resolveFactoryAction(r, 'sell:drone:100')).toBeNull()
    expect(resolveFactoryAction(r, 'sell:drone:max')).toEqual({kind: 'sell_machine', machine_id: 'drone', quantity: 'max'})
  })
  it('does not bypass technology prerequisites or evolution core costs with a rich balance', () => {
    const r = fixture()
    expect(resolveFactoryAction(r, 'industrial:test_upgrade')).toBeNull()
    expect(resolveFactoryAction(r, 'evolve:drone')).toBeNull()
    r.state.evolution_cores = 2
    expect(resolveFactoryAction(r, 'evolve:drone')).toEqual({kind: 'evolve_machine', machine_id: 'drone'})
    r.state.industrial_upgrades![0].unlocked = true
    expect(resolveFactoryAction(r, 'industrial:test_upgrade')).toEqual({kind: 'buy_industrial_upgrade', upgrade_id: 'test_upgrade'})
  })
  it('rejects stale ascension previews and exposes the actual reset and preserve lists', () => {
    const r = fixture(), option = projectFactoryCatalog(r).rows.find(row => row.id === 'ascension')!.options[0]
    expect(option.confirmation).toContain('Máquinas, Saldo'); expect(option.confirmation).toContain('Logros, Planetas')
    expect(resolveFactoryAction(r, option.id)).toEqual({kind: 'ascend', expected_gain: 1, expected_ascensions: 0})
    r.state.ascension!.gain_points = 2
    expect(resolveFactoryAction(r, option.id)).toBeNull()
    expect(resolveFactoryAction(r, 'set_balance')).toBeNull()
    expect(resolveFactoryAction(r, 'forge_evolution_core')).toBeNull()
  })
  it('accepts only versioned catalog identifiers and validates transient event expiration', () => {
    const base = {channel: FACTORY_CHANNEL, version: 1, build: FACTORY_BUILD, type: 'catalog'}
    expect(readFactoryIntent({...base, actionId: 'buy:drone:10'})).toBe('catalog')
    for (const actionId of [undefined, {}, '../admin', 'x'.repeat(181)]) expect(readFactoryIntent({...base, actionId})).toBeNull()
    const r = fixture(); r.state.special_mineral = {event_id: 'test', expires_ms: 99, reward_milli: 1000}
    expect(resolveFactoryAction(r, 'special:test')).toBeNull()
    r.state.special_mineral.expires_ms = 101
    expect(resolveFactoryAction(r, 'special:test')).toEqual({kind: 'claim_special_mineral', event_id: 'test'})
  })
  it('honors the three tracked objectives and allows removing an existing objective', () => {
    const r = fixture(); r.state.tracked_achievements = ['a', 'b', 'c']; r.state.achievements = ['a', 'd'].map(id => ({id, definition_version: 7, category: 'mining', unit: 'count', title: id, description: 'Meta', progress: 1, target: 10, unlocked: false, trackable: true, unlocked_ms: null, reward_label: 'Méritos'}))
    expect(resolveFactoryAction(r, 'track:a')).toEqual({kind: 'untrack_achievement', achievement_id: 'a'})
    expect(resolveFactoryAction(r, 'track:d')).toBeNull()
  })
  it('keeps the retired star chart read-only even when a fresh save has no retired colony', () => {
    const r = fixture(); r.state.universe = {version: 2, id: 'origin', name: 'Universo', owned_galaxies: 0, galaxies: [{id: 'aurora', name: 'Aurora', owned: false, unlocked: true, planets: [{id: 'cyris_4', name: 'Cyris', kind: 'frontier', colonized: false, unlocked: true, ferrite_cost_milli: 1, cores_cost: 1, colonist_count: 1}]}]}
    r.state.fleet = {unlocked: true, max_ships: 30, ships: [], totals: {attack: 0, repair: 0, shield: 0}, ship_types: [{id: 'interceptor', name: 'Interceptor', role: 'combate', owned: 0, build_ferrite_cost_milli: 1, build_cores_cost: 1, base_stats: {attack: 30, repair: 0, shield: 0}}]}
    expect(resolveFactoryAction(r, 'colonize:cyris_4')).toBeNull(); expect(resolveFactoryAction(r, 'ship:interceptor')).toBeNull()
    expect(projectFactoryCatalog(r).rows.find(row => row.id === 'cyris_4')).toBeUndefined()
  })
})
describe('Current public Universe', () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  const p = {id, name: '<color=red>Planeta', published_ms: 1, production_milli_per_second: '9007199254740993', ascensions: 2, level: 3, level_version: 1, metric_as_of_ms: 1}
  it('projects only published source metrics and limits visit intents to the loaded directory', () => {
    const state = {directory: {items: [p], next_cursor: null, as_of_ms: 1}}, rows = publicFactoryRows(state)
    expect(rows[2].title).not.toContain('<'); expect(rows[2].detail).toContain('9.007.199.254.740,993 /s')
    expect(publicPlanetAllowed(state, id)).toBe(true); expect(publicPlanetAllowed(state, 'unknown')).toBe(false)
    expect(rows[0].detail).toContain('simulados')
  })
  it('allows bounded read-only directory pagination and visits while keeping profile/auth mutations unavailable', () => {
    expect(referenceTarget('planets', 'GET', 'development', undefined, '?limit=24')?.search).toBe('?limit=24')
    expect(referenceTarget(`planets/${id}/visit`, 'GET', 'development')).not.toBeNull()
    for (const path of ['auth/register', 'planets/me', 'competition/rival']) expect(referenceTarget(path, 'POST', 'development')).toBeNull()
    for (const query of ['?limit=100', '?cursor=../admin', '?q=' + 'a'.repeat(33), '?limit=1&limit=2', '?url=http://localhost']) expect(referenceTarget('planets', 'GET', 'development', undefined, query)).toBeNull()
    expect(referenceTarget('planets', 'GET', 'production')).toBeNull()
  })
})
describe('Continuous click input', () => {
  it('queues rapid taps during an in-flight batch and retries only server-unaccepted taps', () => {
    const q = new FactoryClickBuffer()
    for (let i = 0; i < 12; i++) expect(q.enqueue()).toBe(true)
    expect(q.take()).toBe(8); expect(q.take()).toBe(0)
    q.enqueue(); q.settle(8, 3)
    expect(q.count).toBe(10); expect(q.take()).toBe(8)
    q.settle(8, 8); expect(q.take()).toBe(2); q.settle(2, 2); expect(q.count).toBe(0)
  })
  it('bounds unsent plus in-flight input and rejects impossible receipts', () => {
    const q = new FactoryClickBuffer()
    for (let i = 0; i < 128; i++) q.enqueue()
    expect(q.enqueue()).toBe(false); expect(q.take()).toBe(8); expect(q.enqueue()).toBe(false)
    expect(() => q.settle(8, 9)).toThrow()
    q.settle(8, 0); expect(q.count).toBe(128)
  })
  it('shows only accepted taps in a confirmed batch reward', () => {
    const r = fixture(); r.accepted_clicks = 3
    expect(toFactoryFeedback(r, {kind: 'mine', clicks: 8})).toEqual({kind: 'mine', label: '+3 Ferrite · 3 toques'})
    r.accepted_clicks = 0; expect(toFactoryFeedback(r, {kind: 'mine', clicks: 8})).toBeNull()
    r.accepted_clicks = 3; r.state.balance_milli = '9000000000000000000'
    expect(toFactoryFeedback(r, {kind: 'mine', clicks: 8})?.label).toBe('3 toques confirmados · saldo al límite')
  })
})
describe('Reused fleet training', () => {
  const fleet: FleetView = {unlocked: true, max_ships: 12, totals: {attack: 10, repair: 4, shield: 5}, ship_types: [], ships: [{id: 'test', type_id: 'interceptor', name: 'Interceptor', role: 'combate', level: 1, stats: {attack: 10, repair: 0, shield: 5}, evolution_cores_cost: 1, evolution_ferrite_cost_milli: 10000}]}
  it('requires a real owned ship and stops the deterministic simulator on victory', () => {
    expect(() => startTrainingDuel({...fleet, ships: []})).toThrow()
    let s = startTrainingDuel(fleet); const original = JSON.stringify(fleet)
    for (let i = 0; i < 24; i++) s = advanceTrainingDuel(s, fleet, 'attack')
    expect(s.result).toBe('victory'); expect(s.enemyHull).toBe(0); expect(JSON.stringify(fleet)).toBe(original)
    expect(advanceTrainingDuel(s, fleet, 'repair')).toBe(s)
  })
})

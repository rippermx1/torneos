import builds from './runtime-builds.json'
import type {Action, CommandResult, GameState} from './factory-reference/contracts'
import {projectFactoryCatalog, type FactoryCatalogRow} from './factory-catalog'

export const FACTORY_BUILD = builds['factory-empire']
export const FACTORY_CHANNEL = 'torneos.factory-empire'
export const FACTORY_API = '/play/factory-empire/api'
export type FactoryAction = Action
type Milli = number | string
export interface FactoryResult {
  accepted_clicks?: number
  state: Partial<GameState> & {
    revision: number; server_time_ms: number; balance_version: string; planet: string
    balance_milli: Milli; rate_milli_per_second: Milli; click_yield_milli: Milli
    click_upgrade_cost_milli: Milli | null; offline_cap_ms: number
    machines: GameState['machines']
  }
  offline: {elapsed_ms: number; credited_ms: number; earned_milli: Milli; capped: boolean}
}
export interface FactoryView {
  revision: number; ferrite: string; rate: string; yield: string; planet: string
  droneOwned: number; droneCost: string; droneRate: string; droneCanBuy: boolean
  drillOwned: number; drillCost: string; drillRate: string; drillCanBuy: boolean
  upgradeCost: string; upgradeCanBuy: boolean; achievements: number
  offlineReward: string; offlineSeconds: number; offlineCapped: boolean
  catalog: FactoryCatalogRow[]; nextGoal: string; cores: number; colonyStage: string; machineTypes: number
  installations: {id: string; owned: number; level: number}[]
  balanceMilli: string; rateMilli: string
}
const exact = (value: Milli): bigint => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Importe inválido del servidor.')
  // Quotes may exceed the wallet cap as machine prices grow; keep them exact.
  if (!/^\d{1,32}$/.test(String(value))) throw new Error('Importe inválido del servidor.')
  return BigInt(value)
}
export function formatMilli(value: Milli): string {
  const n = exact(value)
  const whole = (n / BigInt(1000)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = (n % BigInt(1000)).toString().padStart(3, '0').replace(/0+$/, '')
  return whole + (fraction ? ',' + fraction : '')
}
export function toFactoryView(result: FactoryResult): FactoryView {
  const state = result.state
  const drone = state.machines.find(m => m.id === 'drone')
  const drill = state.machines.find(m => m.id === 'drill')
  if (!drone || !drill || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Estado incompatible con esta versión.')
  const balance = exact(state.balance_milli)
  const milestone = state.milestones?.find(m => !m.completed)
  const tracked = state.achievements?.find(a => !a.unlocked && state.tracked_achievements?.includes(a.id))
  const nextMachine = state.machines.find(m => m.owned === 0)
  const nextTechnology = state.industrial_upgrades?.find(u => u.unlocked && !u.owned)
  return {
    revision: state.revision, ferrite: formatMilli(state.balance_milli), rate: formatMilli(state.rate_milli_per_second),
    yield: formatMilli(state.click_yield_milli), planet: state.planet,
    droneOwned: drone.owned, droneCost: formatMilli(drone.cost_milli), droneRate: formatMilli(drone.rate_milli_per_second),
    droneCanBuy: drone.owned < drone.max_owned && balance >= exact(drone.cost_milli),
    drillOwned: drill.owned, drillCost: formatMilli(drill.cost_milli), drillRate: formatMilli(drill.rate_milli_per_second),
    drillCanBuy: drill.owned < drill.max_owned && balance >= exact(drill.cost_milli),
    upgradeCost: state.click_upgrade_cost_milli === null ? 'Máximo' : formatMilli(state.click_upgrade_cost_milli),
    upgradeCanBuy: state.click_upgrade_cost_milli !== null && balance >= exact(state.click_upgrade_cost_milli),
    achievements: state.achievements?.filter(a => a.unlocked).length ?? 0,
    offlineReward: formatMilli(result.offline.earned_milli), offlineSeconds: Math.floor(result.offline.credited_ms / 1000), offlineCapped: result.offline.capped,
    catalog: projectFactoryCatalog(result).rows,
    nextGoal: milestone?.requirement ?? (tracked ? `${tracked.title}: ${tracked.unit.startsWith('milli_') ? formatMilli(tracked.progress) : tracked.progress} / ${tracked.unit.startsWith('milli_') ? formatMilli(tracked.target) : tracked.target}` : nextMachine ? `Construye ${nextMachine.name.toLowerCase()}.` : nextTechnology ? `Instala ${nextTechnology.name}.` : state.ascension?.can_ascend ? `Ascender: +${state.ascension.gain_points} puntos permanentes.` : 'Evoluciona tu industria y visita otros planetas.'),
    cores: state.evolution_cores ?? 0,
    colonyStage: state.machines.filter(m => m.owned > 0).length >= 5 ? 'Colonia orbital' : state.machines.filter(m => m.owned > 0).length >= 3 ? 'Colonia industrial' : 'Colonia minera',
    machineTypes: state.machines.filter(m => m.owned > 0).length,
    installations: state.machines.map(m => ({id: m.id, owned: m.owned, level: m.level ?? 1})),
    balanceMilli: exact(state.balance_milli).toString(), rateMilli: exact(state.rate_milli_per_second).toString(),
  }
}
export function toFactoryFeedback(result: FactoryResult, action: FactoryAction) {
  if (action.kind === 'mine') {
    const accepted = result.accepted_clicks
    if (!accepted || !Number.isInteger(accepted) || accepted < 1 || accepted > action.clicks || accepted > 8) return null
    if (result.state.balance_milli !== undefined && exact(result.state.balance_milli) >= BigInt('9000000000000000000')) return {kind: 'mine', label: `${accepted} toques confirmados · saldo al límite`}
    return {kind: 'mine', label: `+${formatMilli((exact(result.state.click_yield_milli) * BigInt(accepted)).toString())} Ferrite${accepted > 1 ? ` · ${accepted} toques` : ''}`}
  }
  if (action.kind === 'upgrade_click') return {kind: 'upgrade', label: `Láser mejorado · +${formatMilli(result.state.click_yield_milli)} por toque`}
  if (action.kind === 'buy_machine' || action.kind === 'buy_machine_bulk') return {kind: action.machine_id === 'drone' || action.machine_id === 'drill' ? action.machine_id : 'catalog', label: `${result.state.machines.find(m => m.id === action.machine_id)?.name ?? 'Máquina'} instalado`}
  const receipt = result as CommandResult
  return {kind: 'catalog', label: action.kind === 'calibrate_drill' ? `Bono confirmado +${formatMilli(receipt.calibration_reward_milli ?? 0)}` : action.kind === 'claim_special_mineral' ? `Mineral confirmado +${formatMilli(receipt.special_reward_milli ?? 0)}` : action.kind === 'sell_machine' ? `Venta confirmada +${formatMilli(receipt.sale_refund_milli ?? 0)}` : action.kind === 'ascend' ? `Nuevo ciclo · +${receipt.ascension_gain_points ?? 0} puntos` : 'Progreso confirmado'}
}
export function readFactoryIntent(data: unknown): 'ready' | 'mine' | 'drone' | 'drill' | 'upgrade' | 'retry' | 'sync' | 'catalog' | 'train' | 'attack' | 'guard' | 'repair' | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.channel !== FACTORY_CHANNEL || d.version !== 1 || d.build !== FACTORY_BUILD) return null
  if (d.type === 'catalog' && (typeof d.actionId !== 'string' || !/^[a-zA-Z0-9_:.\-]{1,180}$/.test(d.actionId))) return null
  return ['ready', 'mine', 'drone', 'drill', 'upgrade', 'retry', 'sync', 'catalog', 'train', 'attack', 'guard', 'repair'].includes(String(d.type)) ? d.type as ReturnType<typeof readFactoryIntent> : null
}

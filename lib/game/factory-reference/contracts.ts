/** Espejo pequeño del OpenAPI versionado en contracts/openapi.json.
 * Actualizar junto con schemas.py y la prueba de contrato. Sin saldos enviados al servidor.
 */
export interface GuestSession {
  user_id: string;
  kind: 'guest' | 'registered';
  username: string | null;
  csrf_token: string;
  expires_ms: number;
  warning: string;
}
export interface RecoverySession extends GuestSession { recovery_code: string; }
export interface PlanetProfile {
  id: string; name: string | null; published: boolean; published_ms: number | null;
  moderation_status: 'visible' | 'hidden'; visibility_notice: string;
}
export interface PublicPlanet {
  id: string; name: string; published_ms: number;
  production_milli_per_second: string; ascensions: number;
  level: number; level_version: number; metric_as_of_ms: number;
}
export interface PlanetVisit extends PublicPlanet {
  appearance_tier: 'frontier' | 'industrial' | 'orbital';
  industry: {id: string; name: string; owned: number; level: number}[];
}
export interface PlanetDirectoryPage {
  items: PublicPlanet[]; next_cursor: string | null; as_of_ms: number;
}
export interface RankedPlanet extends PublicPlanet {
  rank: number; gap_milli_per_second: string | null;
}
export interface CompetitionSummary {
  own: RankedPlanet | null; nearby: RankedPlanet[]; reference: RankedPlanet | null;
  saved_rival: RankedPlanet | null; saved_rival_unavailable: boolean; as_of_ms: number;
}
export interface LeaderboardPage {
  items: RankedPlanet[]; next_cursor: string | null; as_of_ms: number;
}
/** Los importes sobre 2^53-1 llegan como cadenas decimales; los antiguos seguros como número. */
export type Milli = number | string;
export interface MachineView {
  id: string;
  name: string;
  description: string;
  owned: number;
  level?: number;
  evolution_cores_cost?: number | null;
  evolution_ferrite_cost_milli?: Milli | null;
  max_owned: number;
  rate_milli_per_second: Milli;
  bonus_rate_milli_per_second?: Milli;
  cost_milli: Milli;
  bulk_costs_milli?: Record<'1' | '10' | '100', Milli | null>;
  max_affordable?: number;
  max_cost_milli?: Milli;
  sell_refunds_milli?: Record<'1' | '10' | '100', Milli | null>;
  sell_max_refund_milli?: Milli | null;
}
export interface IndustrialUpgradeView {
  id: string;
  name: string;
  description: string;
  required_milestone: string | null;
  required_machine_count?: number;
  required_upgrade?: string | null;
  requirement: string;
  cost_milli: Milli;
  machine_id: string;
  bonus_per_unit_milli: Milli;
  owned: boolean;
  unlocked: boolean;
}
export interface AmplifierUpgradeView {
  id: string;
  name: string;
  description: string;
  effect: 'click' | 'production';
  multiplier: number;
  cost_milli: Milli;
  required_milestone: string | null;
  required_machine: string | null;
  required_machine_count: number;
  required_upgrade: string | null;
  requirement: string;
  owned: boolean;
  unlocked: boolean;
}
export interface SynergyView {
  id: string;
  name: string;
  description: string;
  required_upgrade: string;
  required_machine: string;
  bonus_machine: string;
  bonus_per_unit_milli: Milli;
  bonus_milli_per_second: Milli;
  active: boolean;
}
export interface CalibrationView {
  unlocked: boolean;
  ready: boolean;
  ready_at_ms: number;
  count: number;
  /** Los recibos previos a la compra por créditos pueden omitir este campo. */
  credits?: number;
  /** Récord de taladros simultáneos de este ciclo; falta en recibos antiguos. */
  drill_peak?: number;
  choices: { power_cells: 0 | 1 | 2; reward_milli: Milli; cooldown_hours: number }[];
}
export interface VesperaView {
  planet_id: 'vespera_2';
  name: string;
  balance_version: string;
  unlocked: boolean;
  colonized: boolean;
  retired?: boolean;
  balance_milli: Milli;
  lifetime_milli: Milli;
  rigs: number;
  max_rigs: number;
  power_cells: 0 | 1 | 2;
  rate_milli_per_second: Milli;
  offline_cap_ms: number;
  rig_cost_milli: Milli | null;
  choices: { power_cells: 0 | 1 | 2; rate_milli_per_second: Milli;
    rate_per_rig_milli: Milli; offline_cap_ms: number;
    rig_cost_milli?: Milli | null; configuration_cost_milli?: Milli }[];
}
export interface PlanetView {
  id: string;
  name: string;
  kind: 'home' | 'existing' | 'frontier';
  colonized: boolean;
  unlocked: boolean;
  ferrite_cost_milli: Milli | null;
  cores_cost: number | null;
  colonist_count: number;
}
export interface UniverseView {
  version: number;
  id: string;
  name: string;
  owned_galaxies: number;
  galaxies: { id: string; name: string; unlocked: boolean; owned: boolean;
    planets: PlanetView[] }[];
}
export interface FleetView {
  unlocked: boolean;
  max_ships: number;
  totals: { attack: number; repair: number; shield: number };
  ship_types: { id: 'interceptor' | 'repair_frigate' | 'guardian'; name: string;
    role: 'combate' | 'soporte' | 'defensa'; owned: number;
    build_ferrite_cost_milli: Milli; build_cores_cost: number;
    base_stats: { attack: number; repair: number; shield: number } }[];
  ships: { id: string; type_id: 'interceptor' | 'repair_frigate' | 'guardian';
    name: string; role: 'combate' | 'soporte' | 'defensa'; level: number;
    stats: { attack: number; repair: number; shield: number };
    evolution_ferrite_cost_milli: Milli | null; evolution_cores_cost: number | null }[];
}
export interface MilestoneView {
  id: string;
  title: string;
  requirement: string;
  reward_milli: Milli;
  completed: boolean;
}
export interface AchievementView {
  id: string;
  definition_version: number;
  category: string;
  unit: 'milli_ferrite' | 'milli_ferrite_per_second' | 'count';
  title: string;
  description: string;
  progress: Milli;
  target: Milli;
  unlocked: boolean;
  trackable: boolean;
  unlocked_ms: number | null;
  reward_label: string;
}
export interface LegacyUpgradeView {
  id: string;
  name: string;
  description: string;
  branch: string;
  cost_points: number;
  requires: string | null;
  owned: boolean;
  unlocked: boolean;
  affordable: boolean;
  effect_label: string;
}
export interface TemporalEffectView {
  id: 'click' | 'production';
  name: string;
  multiplier: number;
  duration_ms: number;
  unlocked: boolean;
  offer: { event_id: string; expires_ms: number } | null;
  active_expires_ms: number;
  claim_count: number;
}
export interface GameState {
  balance_version: string;
  revision: number;
  server_time_ms: number;
  planet: string;
  /** A7-01; los recibos históricos no incluyen identidad planetaria. */
  home_planet?: { id: string; created_ms: number } | null;
  balance_milli: Milli;
  evolution_cores?: number;
  next_daily_core_ms?: number | null;
  core_forge_cost_milli?: Milli | null;
  lifetime_milli: Milli;
  rate_milli_per_second: Milli;
  /** Los recibos anteriores a A3-14 se reproducen intactos. */
  temporary_bonus_milli_per_second?: Milli;
  /** Los recibos anteriores a A2 no incluyen el desglose. */
  base_rate_milli_per_second?: Milli | null;
  upgrade_bonus_milli_per_second?: Milli | null;
  synergy_bonus_milli_per_second?: Milli | null;
  click_level: number;
  click_yield_milli: Milli;
  temporary_click_bonus_milli?: Milli;
  click_multiplier?: number;
  production_multiplier?: number;
  special_mineral?: { event_id: string; expires_ms: number; reward_milli: Milli } | null;
  special_mineral_claim_count?: number;
  temporal_effects?: TemporalEffectView[] | null;
  ascension?: {
    run_lifetime_milli: Milli;
    best_run_milli: Milli;
    historical_vespera_milli: Milli;
    legacy_points: number;
    available_legacy_points?: number;
    available_legacy_points_after?: number;
    ascension_count: number;
    gain_points: number;
    legacy_points_after: number;
    bonus_percent_now: number;
    bonus_percent_after: number;
    next_point_at_run_milli: Milli | null;
    can_ascend: boolean;
    resets: string[];
    preserves: string[];
  } | null;
  legacy_bonus_milli_per_second?: Milli;
  converted_vespera_rate_milli_per_second?: Milli;
  legacy_upgrades?: LegacyUpgradeView[] | null;
  click_upgrade_cost_milli: Milli | null;
  offline_cap_ms: number;
  machines: MachineView[];
  /** Los recibos 0.1.0 se reproducen intactos y omiten este campo. */
  milestones?: MilestoneView[] | null;
  industrial_upgrades?: IndustrialUpgradeView[] | null;
  amplifier_upgrades?: AmplifierUpgradeView[] | null;
  synergies?: SynergyView[] | null;
  calibration?: CalibrationView | null;
  vespera?: VesperaView | null;
  universe?: UniverseView | null;
  fleet?: FleetView | null;
  /** Old receipts predate A1 and are returned unchanged. */
  achievements?: AchievementView[] | null;
  tracked_achievements?: string[] | null;
  merit_points?: number | null;
}
export interface CommandResult {
  state: GameState;
  offline: { elapsed_ms: number; credited_ms: number; earned_milli: Milli; capped: boolean };
  accepted_clicks: number;
  calibration_reward_milli?: Milli;
  special_reward_milli?: Milli;
  ascension_gain_points?: number;
  sold_quantity?: number;
  sale_refund_milli?: Milli;
  vespera_offline?: { elapsed_ms: number; credited_ms: number; earned_milli: Milli;
    capped: boolean } | null;
}
export type Action =
  | { kind: 'mine'; clicks: number }
  | { kind: 'buy_machine'; machine_id: string }
  | { kind: 'buy_machine_bulk'; machine_id: string; quantity: 10 | 100 | 'max' }
  | { kind: 'sell_machine'; machine_id: string; quantity: 1 | 10 | 100 | 'max' }
  | { kind: 'claim_special_mineral'; event_id: string }
  | { kind: 'claim_temporal_event'; effect_id: TemporalEffectView['id']; event_id: string }
  | { kind: 'ascend'; expected_gain: number; expected_ascensions: number }
  | { kind: 'buy_legacy_upgrade'; upgrade_id: string }
  | { kind: 'forge_evolution_core' } // Solo para recuperar intenciones y recibos anteriores a A6-06.
  | { kind: 'evolve_machine'; machine_id: string }
  | { kind: 'colonize_planet'; planet_id: string }
  | { kind: 'build_ship'; ship_type_id: FleetView['ship_types'][number]['id'] }
  | { kind: 'evolve_ship'; ship_id: string }
  | { kind: 'upgrade_click' }
  | { kind: 'buy_industrial_upgrade'; upgrade_id: IndustrialUpgradeView['id'] }
  | { kind: 'buy_amplifier_upgrade'; upgrade_id: AmplifierUpgradeView['id'] }
  | { kind: 'calibrate_drill'; power_cells: 0 | 1 | 2 }
  | { kind: 'colonize_vespera'; power_cells: 0 | 1 | 2 }
  | { kind: 'configure_vespera'; power_cells: 0 | 1 | 2 }
  | { kind: 'buy_vespera_rig' }
  | { kind: 'track_achievement'; achievement_id: string }
  | { kind: 'untrack_achievement'; achievement_id: string };
export type Command = Action & { command_id: string };
export interface GameSummary {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  path: string;
  status: string;
  genre: string;
}
export interface Catalog {
  games: GameSummary[];
  features: Record<string, boolean>;
}

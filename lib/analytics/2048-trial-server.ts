import 'server-only'

import { COMMUNITY_REPORT_LIMITATIONS, readCommunity2048Report } from '@/lib/analytics/2048-community'
import { PLAYER_2048_RETENTION_LIMITATIONS, PLAYER_2048_RETENTION_TIMEZONE, player2048RetentionRange,
  readPlayer2048Retention, type Player2048RetentionReport, type Player2048RetentionRpcClient } from '@/lib/game/player-2048-retention'

export const TRIAL_2048_SERVER_LIMITATIONS = [
  'El rango de fechas selecciona cohortes de primer día activo conocido para retención de cuentas; no filtra los retos comunitarios.',
  'La comunidad muestra los últimos 30 retos disponibles, no 30 días. Sus participaciones no deben sumarse como personas únicas.',
  'Cada fuente se confirma por separado. Una fuente no disponible conserva report=null; no se sustituye por un informe vacío ni por ceros.',
  ...PLAYER_2048_RETENTION_LIMITATIONS,
  ...COMMUNITY_REPORT_LIMITATIONS,
] as const

export type Trial2048ServerSource<T> = { status: 'ready'; report: T } | { status: 'unavailable'; report: null }
export type Trial2048ReportClient = Parameters<typeof readCommunity2048Report>[0]
export type Trial2048CommunityReport = Awaited<ReturnType<typeof readCommunity2048Report>>
export interface Trial2048ServerSnapshot {
  version: 1
  /** UTC response assembly time, not the source's cohort maturation date. */
  loadedAt: string
  timezone: 'America/Santiago'
  range: { from: string; to: string; days: number }
  retention: Trial2048ServerSource<Player2048RetentionReport>
  community: Trial2048ServerSource<Trial2048CommunityReport>
  scopes: {
    retention: 'first_known_activity_cohorts_in_range'
    community: 'latest_30_community_events_without_date_filter'
  }
  limitations: readonly string[]
}

/** The caller enforces admin MFA before creating/passing its privileged client. */
export async function get2048TrialServerSnapshot(
  db: Trial2048ReportClient, input: { from: unknown; to: unknown },
): Promise<Trial2048ServerSnapshot> {
  const range = player2048RetentionRange(input.from, input.to)
  if (!range) throw new Error('TRIAL_2048_INVALID_RANGE')
  // Existing readers validate completeness and whitelist their aggregate outputs.
  const [retention, community] = await Promise.allSettled([
    readPlayer2048Retention(db as unknown as Player2048RetentionRpcClient, range.from, range.to),
    readCommunity2048Report(db),
  ])
  return {
    version: 1, loadedAt: new Date().toISOString(), timezone: PLAYER_2048_RETENTION_TIMEZONE, range,
    retention: retention.status === 'fulfilled' ? { status: 'ready', report: retention.value } : { status: 'unavailable', report: null },
    community: community.status === 'fulfilled' ? { status: 'ready', report: community.value } : { status: 'unavailable', report: null },
    scopes: { retention: 'first_known_activity_cohorts_in_range', community: 'latest_30_community_events_without_date_filter' },
    limitations: TRIAL_2048_SERVER_LIMITATIONS,
  }
}

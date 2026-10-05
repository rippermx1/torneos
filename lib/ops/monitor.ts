import { createAdminClient } from '@/lib/supabase/server'
import { resolveOpsAlertEmail } from '@/lib/email/ops-notifications'
import { sendOperationalEmail, OperationalEmailError } from '@/lib/email/operational'

export interface OperationalQueue {
  key: string; title: string; href: string; count: number; amount_cents: number; oldest_at: string | null
}
export interface OperationalSnapshot {
  observed_at: string; bank_cash_verified: false; queues: OperationalQueue[]
  checks: Omit<OperationalQueue, 'oldest_at'>[]; jobs: import('@/types/database').CronHeartbeat[]
  active_incidents?: number
}
export interface OpsIncident {
  id: string; condition_key: string; title: string; severity: 'attention' | 'critical'
  details: Record<string, unknown>; first_seen_at: string; last_seen_at: string
  acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_note: string | null
  escalated_at: string | null; resolved_at: string | null
}
export interface OpsNotification {
  id: string; incident_id: string; stage: string; recipient: string | null; subject: string; text_body: string
  state: 'pending' | 'sending' | 'accepted' | 'blocked' | 'received_manually'; attempts: number; created_at: string
  claim_token: string | null; provider_id: string | null; accepted_at: string | null; last_error: string | null
  reviewed_by?: string | null; reviewed_at?: string | null; review_note?: string | null
}

export async function runOperationalMonitor() {
  const admin = createAdminClient()
  const recipient = await resolveOpsAlertEmail()
  const { data, error } = await admin.rpc('observe_operations', {
    p_recipient: recipient ?? null, p_escalation_recipient: process.env.OPS_ESCALATION_EMAIL?.trim() && process.env.OPS_ESCALATION_EMAIL.trim().toLowerCase() !== recipient?.toLowerCase() ? process.env.OPS_ESCALATION_EMAIL.trim() : null,
  })
  if (error || !data) throw new Error('No se pudo comprobar y registrar la operación')
  assertOperationalSnapshot(data)
  const { data: notifications, error: claimError } = await admin.rpc('claim_ops_notifications')
  if (claimError || !notifications) throw new Error('No se pudo tomar la cola de avisos')
  let failed = 0
  for (const notification of notifications as unknown as OpsNotification[]) {
    let providerId: string | null = null, sendError: string | null = null, retryable = true
    try { providerId = await sendOperationalEmail(notification) }
    catch (error) {
      failed++
      sendError = error instanceof Error ? error.message : 'Respuesta del correo perdida'
      retryable = !(error instanceof OperationalEmailError) || error.retryable
    }
    // A lost DB response is not an email failure: keep the same immutable provider key on lease recovery.
    const { error: finishError } = await admin.rpc('finish_ops_notification', {
      p_id: notification.id, p_token: notification.claim_token!, p_provider_id: providerId,
      p_error: sendError, p_retryable: retryable,
    })
    if (finishError) throw new Error('Aviso incierto: no se pudo guardar la respuesta del proveedor')
  }
  const { count: unresolvedNotifications, error: countError } = await admin.from('ops_notifications')
    .select('id', { count: 'exact', head: true }).not('state', 'in', '(accepted,received_manually)')
  if (countError || unresolvedNotifications === null) throw new Error('No se pudo comprobar el trabajo de notificación pendiente')
  return { snapshot: data as unknown as OperationalSnapshot, accepted: notifications.length - failed,
    failed, unresolvedNotifications }
}

export async function loadOperationalDashboard() {
  const admin = createAdminClient()
  const results = await Promise.all([
    admin.rpc('operational_snapshot'),
    admin.from('ops_incidents').select('*').is('resolved_at', null).order('first_seen_at'),
    admin.from('ops_incidents').select('*').not('resolved_at', 'is', null).order('resolved_at', { ascending: false }).limit(20),
    admin.from('ops_notifications').select('*').not('state', 'in', '(accepted,received_manually)').order('created_at').limit(50),
    admin.from('ops_incident_events').select('*').order('created_at', { ascending: false }).limit(30),
    admin.from('cron_heartbeats').select('*').eq('job_name', 'watchdog').maybeSingle(),
    admin.from('ops_notifications').select('*').in('state', ['accepted', 'received_manually']).order('created_at', { ascending: false }).limit(20),
  ])
  if (results.some(r => r.error) || !results[0].data) throw new Error('Comprobación operativa incompleta; no interpretar como cero obligaciones')
  assertOperationalSnapshot(results[0].data)
  return { snapshot: results[0].data as unknown as OperationalSnapshot,
    incidents: results[1].data as OpsIncident[], recovered: results[2].data as OpsIncident[],
    notifications: results[3].data as OpsNotification[], events: results[4].data,
    watchdog: results[5].data, recentNotificationResults: results[6].data as OpsNotification[] }
}

export function assertOperationalSnapshot(value: unknown): asserts value is OperationalSnapshot {
  const snapshot = value as Partial<OperationalSnapshot> | null
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.observed_at ?? '')) || snapshot.bank_cash_verified !== false ||
      !Array.isArray(snapshot.queues) || snapshot.queues.length !== 7 || !Array.isArray(snapshot.checks) || snapshot.checks.length !== 5 || !Array.isArray(snapshot.jobs)) {
    throw new Error('Comprobación operativa incompleta o inválida')
  }
  for (const entry of [...snapshot.queues, ...snapshot.checks]) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0 || !Number.isSafeInteger(entry.amount_cents) || entry.amount_cents < 0 ||
        typeof entry.key !== 'string' || typeof entry.title !== 'string' || !entry.href.startsWith('/admin/')) throw new Error('Agregado operativo inválido')
    const oldest = 'oldest_at' in entry && typeof entry.oldest_at === 'string' ? entry.oldest_at : ''
    if ('oldest_at' in entry && entry.count > 0 && !Number.isFinite(Date.parse(oldest))) throw new Error('Edad de obligación no comprobable')
  }
}

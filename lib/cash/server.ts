import { createAdminClient } from '@/lib/supabase/server'
import { assertCashStatus } from './model'

export async function loadCashDashboard() {
  const admin = createAdminClient()
  const [status, movements, reconciliations, differences, events, operators] = await Promise.all([
    admin.rpc('cash_status'),
    admin.from('cash_movements').select('*').is('approved_at', null).is('rejected_at', null).order('created_at', { ascending: true }).limit(50),
    admin.from('cash_reconciliations').select('*').order('created_at', { ascending: false }).limit(50),
    admin.from('cash_differences').select('*').is('resolved_at', null).order('due_at', { ascending: true }).limit(50),
    admin.from('cash_events').select('*').order('created_at', { ascending: false }).limit(50),
    admin.from('profile_roles').select('profile_id, role').in('role', ['admin', 'owner']),
  ])
  if ([status, movements, reconciliations, differences, events, operators].some(result => result.error || result.data === null)) throw new Error('No se pudo comprobar la caja')
  assertCashStatus(status.data)
  return { status: status.data, movements: movements.data!, reconciliations: reconciliations.data!, differences: differences.data!, events: events.data!, operators: [...new Set(operators.data!.map(row => row.profile_id))] }
}

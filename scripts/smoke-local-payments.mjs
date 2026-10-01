import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { mkdir, writeFile } from 'node:fs/promises'

const env = process.env
if (env.TORNEOS_LOCAL_MODE !== '1' || env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321' ||
    env.APP_URL !== 'http://127.0.0.1:3081' || env.CONFIRM_SUPABASE_PROJECT_REF !== 'local') {
  throw new Error('Este smoke solo acepta el entorno local aislado.')
}
const base = env.APP_URL
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const jar = new Map()
const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)) },
})
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const checks = []
async function request(route, init = {}, authenticated = true) {
  const headers = new Headers(init.headers)
  if (authenticated) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
  const response = await fetch(new URL(route, base), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  return response
}
async function createTournament(suffix) {
  const { data, error } = await admin.from('tournaments').insert({
    name: `Smoke pagos local ${suffix} ${Date.now()}`, description: 'Prueba sintética local, sin cargos reales.',
    created_by: user.id, tournament_type: 'standard', game_type: '2048_score', status: 'open', is_test: true,
    business_rule_version: 3, preset_key: 'commercial_v1', entry_fee_cents: 500000,
    prize_1st_cents: 2475000, prize_2nd_cents: 825000, prize_3rd_cents: 0,
    min_players: 12, max_players: 15, max_game_duration_seconds: 600,
    prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
    registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
    play_window_start: new Date(Date.now() + 86_400_000).toISOString(), play_window_end: new Date(Date.now() + 90_000_000).toISOString(),
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}
async function checkout(id) {
  const response = await request(`/api/tournaments/${id}/checkout/flow/create`, { method: 'POST' })
  const payload = await response.json()
  assert(response.ok && payload.redirectUrl, `Checkout falló: ${payload.error}`)
  const url = new URL(payload.redirectUrl)
  assert(url.origin === base && url.pathname === '/dev/flow/payment', 'Checkout salió del entorno local')
  return url.searchParams.get('token')
}
async function pay(token, status) {
  const response = await request('/dev/flow/payment', { method: 'POST', headers: { origin: base }, body: new URLSearchParams({ token, status: String(status) }) })
  assert(response.status === 303, `Confirmación local falló: ${response.status}`)
  return response.headers.get('location')
}
// Fresh synthetic identity keeps repeated runs independent of per-user checkout limits.
const email = `payments.local.${Date.now()}@example.com`
const createdUser = await admin.auth.admin.createUser({ email, password: env.SUPABASE_E2E_PASSWORD, email_confirm: true })
if (createdUser.error || !createdUser.data.user) throw new Error('No se pudo crear la identidad sintética de pagos')
const identity = createdUser.data.user.id
const profile = await admin.from('profiles').upsert({ id: identity, username: `payments_${Date.now()}`, birth_date: '1994-01-01',
  kyc_status: 'approved', kyc_verified_at: new Date().toISOString(), terms_accepted_at: new Date().toISOString(), terms_version: '1.3' })
if (profile.error) throw new Error(profile.error.message)
const role = await admin.from('profile_roles').upsert({ profile_id: identity, role: 'user', granted_by: identity }, { onConflict: 'profile_id,role' })
if (role.error) throw new Error(role.error.message)
const { data: session, error: loginError } = await client.auth.signInWithPassword({ email, password: env.SUPABASE_E2E_PASSWORD })
if (loginError || !session.user) throw new Error('No se pudo iniciar la sesión de pruebas local')
const user = session.user
const id = await createTournament('aprobado')
const token = await checkout(id)
const location = await pay(token, 2)
const returned = await request(location)
assert((await returned.text()).includes('¡Inscripción confirmada!'), 'El retorno no mostró la inscripción confirmada')
checks.push('checkout/confirmación/retorno mediante APIs reales locales')
await pay(token, 2)
const registrations = await admin.from('registrations').select('id', { count: 'exact' }).eq('tournament_id', id).eq('user_id', user.id)
assert(registrations.count === 1, 'Confirmación repetida duplicó la inscripción')
checks.push('confirmación repetida idempotente')
const duplicate = await request(`/api/tournaments/${id}/checkout/flow/create`, { method: 'POST' })
assert(duplicate.status === 409, 'Permitió volver a pagar la misma inscripción')
const denied = await request('/dev/flow/payment', { method: 'POST', headers: { origin: 'https://example.com' }, body: new URLSearchParams({ token, status: '2' }) })
assert(denied.status === 403, 'No bloqueó origen ajeno')
checks.push('doble checkout y origen ajeno bloqueados')
const rejectedId = await createTournament('rechazado')
await pay(await checkout(rejectedId), 3)
const rejected = await admin.from('registrations').select('id', { count: 'exact' }).eq('tournament_id', rejectedId)
assert(rejected.count === 0, 'Un pago rechazado produjo inscripción')
await admin.from('tournaments').update({ status: 'cancelled' }).eq('id', rejectedId)
checks.push('rechazo sin inscripción')

// Payment accepted by provider after registrations closed: existing settlement issues a refund.
const closedId = await createTournament('ventana-cerrada')
const closedToken = await checkout(closedId)
const closed = await admin.from('tournaments').update({ status: 'cancelled' }).eq('id', closedId)
assert(!closed.error, 'No se pudo cerrar el torneo sintético')
await pay(closedToken, 2)
const { data: refund, error: refundError } = await admin.from('flow_refund_attempts').select('id,flow_refund_token,status').eq('tournament_id', closedId).single()
assert(!refundError && refund?.flow_refund_token, 'La confirmación tardía no emitió reembolso')
const callback = await request('/api/webhooks/flow/refund', { method: 'POST', body: new URLSearchParams({ token: refund.flow_refund_token }) }, false)
assert(callback.ok, 'Callback del reembolso falló')
const { data: settled } = await admin.from('flow_refund_attempts').select('status').eq('id', refund.id).single()
assert(settled?.status === 'completed', 'Reembolso no quedó confirmado')
const missing = await admin.from('registrations').select('id', { count: 'exact' }).eq('tournament_id', closedId)
assert(missing.count === 0, 'Pago tardío inscribió al usuario')
checks.push('pago tardío: reembolso confirmado sin inscripción')

const unsigned = await request('/api/local-flow/payment/getStatus?token=' + token, {}, false)
assert(unsigned.status === 403, 'Proveedor aceptó consulta sin firma')
checks.push('API del proveedor exige firma HMAC')
await admin.from('tournaments').update({ status: 'cancelled' }).eq('id', id)
await mkdir('artifacts/local-environment', { recursive: true })
await writeFile('artifacts/local-environment/payments-evidence.json', JSON.stringify({ passed: true, checks, tournamentIds: [id, rejectedId, closedId], provider: 'local simulator; no real charges' }, null, 2))
console.log(`Pagos locales: ${checks.length} comprobaciones PASS (sin cargos reales).`)

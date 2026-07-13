// Smoke E2E de la inscripción con crédito (rakeback). Verifica que
// register_with_credit debita el crédito y crea la inscripción de forma atómica.
// Requiere las migraciones de rakeback aplicadas (tournament_credit +
// register_with_credit). Crea datos is_test y los limpia.
//
// Uso: node scripts/smoke-rakeback-redeem.mjs   (o npm run smoke:rakeback)

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { requireNonProductionProject } from './supabase-safety.mjs'

const CURRENT_TERMS_VERSION = '1.1'

const { loadEnvConfig } = nextEnv
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvConfig(rootDir)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.SUPABASE_E2E_PASSWORD
if (!url || !key || !PW) { console.error('Faltan credenciales Supabase o SUPABASE_E2E_PASSWORD.'); process.exit(1) }
const targetProjectRef = requireNonProductionProject(url, 'Smoke test de rakeback')
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const ENTRY = 100000, GRANT = 250000, MIN = 2

const results = []
const check = (name, ok, detail) => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`) }

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((c) => c.email === email)
    if (u) return u
    if (data.users.length < 200) return null
  }
}
async function ensureUser(i) {
  const email = `smoke.rakeback.${i}@example.com`
  let user = await findUser(email)
  if (!user) { const { data, error } = await sb.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error; user = data.user }
  await sb.from('profiles').upsert({ id: user.id, username: `smoke_rb_${i}`, full_name: `Smoke RB ${i}`, birth_date: '1994-01-01', kyc_status: 'approved', terms_accepted_at: new Date().toISOString(), terms_version: CURRENT_TERMS_VERSION })
  await sb.from('profile_roles').upsert([{ profile_id: user.id, role: 'user', granted_by: user.id }], { onConflict: 'profile_id,role' })
  return user.id
}

let tournamentId = null
let userId = null

async function main() {
  console.log(`Proyecto de pruebas confirmado: ${targetProjectRef}`)
  userId = await ensureUser(1)

  const now = Date.now(), iso = (ms) => new Date(ms).toISOString()
  const { data: t, error: tErr } = await sb.from('tournaments').insert({
    name: `SMOKE rakeback ${now}`, entry_fee_cents: ENTRY,
    prize_1st_cents: 98000, prize_2nd_cents: 28000, prize_3rd_cents: 14000,
    min_players: MIN, max_players: 20,
    registration_opens_at: iso(now - 3600_000), play_window_start: iso(now + 3600_000), play_window_end: iso(now + 7200_000),
    status: 'open', is_test: true,
  }).select('id').single()
  if (tErr) throw tErr
  tournamentId = t.id

  // Otorgar crédito (simula rakeback acumulado).
  const { error: grantErr } = await sb.rpc('wallet_insert_transaction', {
    p_user_id: userId, p_type: 'tournament_credit', p_amount_cents: GRANT,
    p_reference_type: 'rakeback', p_reference_id: null, p_metadata: { kind: 'rakeback_grant' },
  })
  if (grantErr) throw new Error(`grant: ${grantErr.message}`)

  const { data: creditBefore } = await sb.rpc('wallet_credit_balance', { p_user_id: userId })
  check('crédito inicial otorgado', Number(creditBefore) === GRANT, `${creditBefore}`)

  // Inscribirse con crédito.
  const { data: regId, error: regErr } = await sb.rpc('register_with_credit', {
    p_user_id: userId, p_tournament_id: tournamentId, p_entry_fee_cents: ENTRY,
  })
  check('register_with_credit devolvió una inscripción', !regErr && !!regId, regErr?.message ?? regId)

  const { count: regCount } = await sb.from('registrations').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId).eq('user_id', userId)
  check('inscripción creada', regCount === 1, `count=${regCount}`)

  const { data: creditAfter } = await sb.rpc('wallet_credit_balance', { p_user_id: userId })
  check('crédito debitado por la cuota', Number(creditAfter) === GRANT - ENTRY, `${creditAfter} vs ${GRANT - ENTRY}`)

  const { data: redeem } = await sb.from('wallet_transactions').select('amount_cents, metadata').eq('reference_id', tournamentId).eq('type', 'tournament_credit')
  check('existe transacción de consumo', (redeem ?? []).some((r) => r.amount_cents === -ENTRY), JSON.stringify((redeem ?? []).map((r) => r.amount_cents)))

  // Reintento: ya inscrito → falla, sin doble débito.
  const { error: dupErr } = await sb.rpc('register_with_credit', { p_user_id: userId, p_tournament_id: tournamentId, p_entry_fee_cents: ENTRY })
  const { data: creditFinal } = await sb.rpc('wallet_credit_balance', { p_user_id: userId })
  check('reintento rechazado sin doble débito', !!dupErr && Number(creditFinal) === GRANT - ENTRY, `err=${!!dupErr} credit=${creditFinal}`)
}

async function cleanup() {
  if (tournamentId) {
    await sb.from('wallet_transactions').delete().eq('reference_id', tournamentId)
    await sb.from('registrations').delete().eq('tournament_id', tournamentId)
    await sb.from('tournaments').delete().eq('id', tournamentId)
  }
  // Limpia el crédito otorgado sin reference (grant con reference_id null) del usuario de prueba.
  if (userId) await sb.from('wallet_transactions').delete().eq('user_id', userId).eq('type', 'tournament_credit').is('reference_id', null)
  console.log('Limpieza OK.')
}

main().then(cleanup).then(() => {
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} verificaciones OK`)
  process.exit(failed === 0 ? 0 : 1)
}).catch(async (e) => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exit(1) })

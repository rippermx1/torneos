// Smoke E2E del modelo de premio fijo contra el entorno no productivo
// configurado en .env.local. Comprueba que llenar el torneo no cambia los
// premios publicados y elimina los datos generados al terminar.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { requireNonProductionProject } from './supabase-safety.mjs'

const CURRENT_TERMS_VERSION = '1.3'
const { loadEnvConfig } = nextEnv
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvConfig(rootDir)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SUPABASE_E2E_PASSWORD
if (!url || !key || !password) {
  console.error('Faltan credenciales Supabase o SUPABASE_E2E_PASSWORD.')
  process.exit(1)
}

const targetProjectRef = requireNonProductionProject(url, 'Smoke test de premio fijo')
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const ENTRY = 500000
const MIN = 12
const MAX = 15
const PRIZE_1 = 2475000
const PRIZE_2 = 825000
const TOTAL_PRIZE = PRIZE_1 + PRIZE_2
const createdUserIds = []

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email === email)
    if (user) return user
    if (data.users.length < 200) return null
  }
}

async function ensureUser(index) {
  const email = `smoke.fixed.${index}@example.com`
  let user = await findUser(email)
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
    createdUserIds.push(user.id)
  }

  const { error: profileError } = await sb.from('profiles').upsert({
    id: user.id,
    username: `smoke_fixed_${index}`,
    full_name: `Smoke Fixed ${index}`,
    birth_date: '1994-01-01',
    is_admin: false,
    is_banned: false,
    kyc_status: 'approved',
    kyc_verified_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: CURRENT_TERMS_VERSION,
  })
  if (profileError) throw new Error(`profile ${email}: ${profileError.message}`)

  const { error: roleError } = await sb.from('profile_roles').upsert(
    [{ profile_id: user.id, role: 'user', granted_by: user.id }],
    { onConflict: 'profile_id,role' }
  )
  if (roleError) throw new Error(`role ${email}: ${roleError.message}`)
  return user.id
}

let tournamentId = null
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  console.log(`Proyecto de pruebas confirmado: ${targetProjectRef}`)
  const userIds = []
  for (let index = 1; index <= MAX; index++) userIds.push(await ensureUser(index))

  const now = Date.now()
  const iso = (value) => new Date(value).toISOString()
  const { data: tournament, error: tournamentError } = await sb.from('tournaments').insert({
    name: `SMOKE premio fijo ${now}`,
    prize_model: 'fixed',
    business_rule_version: 3,
    preset_key: 'commercial_v1',
    entry_fee_cents: ENTRY,
    prize_1st_cents: PRIZE_1,
    prize_2nd_cents: PRIZE_2,
    prize_3rd_cents: 0,
    prize_fund_bps: 5500,
    platform_fee_bps: 4500,
    prize_1st_bps: 7500,
    prize_2nd_bps: 2500,
    prize_3rd_bps: 0,
    min_players: MIN,
    max_players: MAX,
    registration_opens_at: iso(now - 3600_000),
    play_window_start: iso(now + 3600_000),
    play_window_end: iso(now + 7200_000),
    status: 'open',
    is_test: true,
  }).select('id').single()
  if (tournamentError) throw tournamentError
  tournamentId = tournament.id

  for (const userId of userIds) {
    const { error } = await sb.rpc('register_for_tournament', {
      p_user_id: userId,
      p_tournament_id: tournamentId,
      p_entry_fee_cents: ENTRY,
    })
    if (error) throw new Error(`register ${userId}: ${error.message}`)
  }

  for (let index = 0; index < MAX; index++) {
    const { error } = await sb.from('games').insert({
      tournament_id: tournamentId,
      user_id: userIds[index],
      seed: `smoke-fixed-${index}`,
      status: 'completed',
      final_score: (MAX - index) * 1000,
      highest_tile: 512,
      move_count: 120,
      started_at: iso(now),
      ended_at: iso(now),
      end_reason: 'self_ended',
    })
    if (error) throw new Error(`game ${index}: ${error.message}`)
  }

  await sb.from('tournaments').update({ status: 'finalizing' }).eq('id', tournamentId)
  const { data: finalization, error: finalizationError } = await sb.rpc('finalize_tournament', {
    p_tournament_id: tournamentId,
  })
  if (finalizationError) throw new Error(`finalize: ${finalizationError.message}`)

  check('modelo liquidado como fixed', finalization.prize_model === 'fixed', finalization.prize_model)
  check('solo existen dos obligaciones de premio', finalization.prizes_awarded === 2, `${finalization.prizes_awarded} vs 2`)
  check(
    'premio total no cambia al llenar el torneo',
    finalization.published_prize_fund_cents === TOTAL_PRIZE,
    `${finalization.published_prize_fund_cents} vs ${TOTAL_PRIZE}`
  )

  const { data: rows } = await sb.from('tournament_results')
    .select('rank, prize_awarded_cents')
    .eq('tournament_id', tournamentId)
    .order('rank')
  const byRank = Object.fromEntries((rows ?? []).map((row) => [row.rank, row.prize_awarded_cents]))
  check('1° recibe el monto publicado', byRank[1] === PRIZE_1, `${byRank[1]} vs ${PRIZE_1}`)
  check('2° recibe el monto publicado', byRank[2] === PRIZE_2, `${byRank[2]} vs ${PRIZE_2}`)
  check('no existe tercer premio', byRank[3] === 0, `${byRank[3]} vs 0`)
}

async function cleanup() {
  if (tournamentId) {
    await sb.from('wallet_transactions').delete().eq('reference_id', tournamentId)
    await sb.from('tournament_results').delete().eq('tournament_id', tournamentId)
    await sb.from('games').delete().eq('tournament_id', tournamentId)
    await sb.from('registrations').delete().eq('tournament_id', tournamentId)
    await sb.from('tournaments').delete().eq('id', tournamentId)
  }

  for (const userId of createdUserIds.reverse()) {
    const { error: profileError } = await sb.from('profiles').delete().eq('id', userId)
    if (profileError) throw new Error(`cleanup profile ${userId}: ${profileError.message}`)

    const { error } = await sb.auth.admin.deleteUser(userId)
    if (error) throw new Error(`cleanup auth user ${userId}: ${error.message}`)
  }

  console.log('Limpieza OK (torneo y usuarios temporales eliminados).')
}

main()
  .then(cleanup)
  .then(() => {
    const failed = results.filter((result) => !result.ok)
    console.log(`\n${results.length - failed.length}/${results.length} verificaciones OK`)
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch(async (error) => {
    console.error('ERROR:', error.message)
    await cleanup().catch(() => {})
    process.exit(1)
  })

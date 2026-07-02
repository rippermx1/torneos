// Smoke E2E de la escalera de premios contra el entorno configurado en .env.local.
// Crea un torneo is_test con escalera, inscribe 5 usuarios de prueba, simula
// partidas completadas, finaliza y verifica que finalize_tournament paga la bolsa
// del TRAMO aplicable (5 inscritos -> tramo 5), no el tramo base. Limpia los datos
// del torneo al terminar. Los usuarios de prueba se reutilizan entre corridas.
//
// Uso: node scripts/smoke-prize-ladder.mjs   (o npm run smoke:ladder)

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvConfig(rootDir)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan credenciales Supabase.'); process.exit(1) }
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const ENTRY = 100000, MIN = 2, MAX = 20, N = 5 // 5 inscritos -> tramo 5
const PW = process.env.SUPABASE_E2E_PASSWORD ?? 'Torneos2048!Smoke'

// Réplica de buildPrizeLadder (lib/tournament/finance.ts) para verificación.
function buildLadder(entry, min, max) {
  const set = new Set([min])
  for (const m of [1, 2.5, 5, 8, 13]) { const t = Math.round(m * min); if (t >= min && t <= max) set.add(t) }
  return [...set].sort((a, b) => a - b).map((th) => {
    const fund = Math.round((entry * th * 7000) / 10000)
    const p1 = Math.round((fund * 7000) / 10000)
    const p2 = Math.round((fund * 2000) / 10000)
    return { threshold: th, fund, p1, p2, p3: fund - p1 - p2 }
  })
}

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
  const email = `smoke.ladder.${i}@example.com`
  let user = await findUser(email)
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: PW, email_confirm: true })
    if (error) throw error
    user = data.user
  }
  await sb.from('profiles').upsert({
    id: user.id, username: `smoke_ladder_${i}`, full_name: `Smoke Ladder ${i}`,
    birth_date: '1994-01-01', is_admin: false, is_banned: false,
    kyc_status: 'approved', kyc_verified_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
  })
  await sb.from('profile_roles').upsert(
    [{ profile_id: user.id, role: 'user', granted_by: user.id }],
    { onConflict: 'profile_id,role' }
  )
  return user.id
}

let tournamentId = null
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`)
}

async function main() {
  const ladder = buildLadder(ENTRY, MIN, MAX)
  const expected = ladder.find((t) => t.threshold === N)
  console.log('Escalera esperada:', ladder.map((t) => `${t.threshold}+→${t.fund}`).join('  '))

  const userIds = []
  for (let i = 1; i <= N; i++) userIds.push(await ensureUser(i))

  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const base = ladder[0]
  const { data: t, error: tErr } = await sb.from('tournaments').insert({
    name: `SMOKE escalera ${now}`, entry_fee_cents: ENTRY,
    prize_1st_cents: base.p1, prize_2nd_cents: base.p2, prize_3rd_cents: base.p3,
    min_players: MIN, max_players: MAX,
    registration_opens_at: iso(now - 3600_000),
    play_window_start: iso(now + 3600_000),
    play_window_end: iso(now + 7200_000),
    status: 'open', is_test: true,
  }).select('id').single()
  if (tErr) throw tErr
  tournamentId = t.id

  const tierRows = ladder.map((tr) => ({
    tournament_id: tournamentId, min_players_threshold: tr.threshold,
    prize_fund_cents: tr.fund, prize_1st_cents: tr.p1, prize_2nd_cents: tr.p2, prize_3rd_cents: tr.p3,
  }))
  const { error: tiErr } = await sb.from('tournament_prize_tiers').insert(tierRows)
  if (tiErr) throw tiErr

  // Inscribir por el RPC real (Ruta 1: no debita wallet).
  for (const uid of userIds) {
    const { error } = await sb.rpc('register_for_tournament', {
      p_user_id: uid, p_tournament_id: tournamentId, p_entry_fee_cents: ENTRY,
    })
    if (error) throw new Error(`register ${uid}: ${error.message}`)
  }

  // Partidas completadas con puntajes distintos (rank 1..5 por score desc).
  const scores = [5000, 4000, 3000, 2000, 1000]
  for (let i = 0; i < N; i++) {
    const { error } = await sb.from('games').insert({
      tournament_id: tournamentId, user_id: userIds[i], seed: `smoke-${i}`,
      status: 'completed', final_score: scores[i], highest_tile: 512, move_count: 120,
      started_at: iso(now), ended_at: iso(now), end_reason: 'self_ended',
    })
    if (error) throw new Error(`game ${i}: ${error.message}`)
  }

  await sb.from('tournaments').update({ status: 'finalizing' }).eq('id', tournamentId)

  const { data: fin, error: fErr } = await sb.rpc('finalize_tournament', { p_tournament_id: tournamentId })
  if (fErr) throw new Error(`finalize: ${fErr.message}`)

  // Verificaciones.
  check('finalize aplica el tramo 5 (no el base)', fin.applied_tier_threshold === N,
    `applied_tier_threshold=${fin.applied_tier_threshold}`)
  check('bolsa publicada = tramo 5', fin.published_prize_fund_cents === expected.fund,
    `${fin.published_prize_fund_cents} vs ${expected.fund}`)

  const { data: tr } = await sb.from('tournament_results')
    .select('rank, user_id, prize_awarded_cents').eq('tournament_id', tournamentId).order('rank')
  const byRank = Object.fromEntries((tr ?? []).map((r) => [r.rank, r.prize_awarded_cents]))
  check('premio 1° = tramo 5', byRank[1] === expected.p1, `${byRank[1]} vs ${expected.p1}`)
  check('premio 2° = tramo 5', byRank[2] === expected.p2, `${byRank[2]} vs ${expected.p2}`)
  check('premio 3° = tramo 5', byRank[3] === expected.p3, `${byRank[3]} vs ${expected.p3}`)

  const { data: credits } = await sb.from('wallet_transactions')
    .select('user_id, amount_cents, type').eq('reference_id', tournamentId).eq('type', 'prize_credit')
  const creditSum = (credits ?? []).reduce((s, c) => s + c.amount_cents, 0)
  check('wallet acreditó la bolsa del tramo 5', creditSum === expected.fund,
    `acreditado ${creditSum} vs ${expected.fund}`)
}

async function cleanup() {
  if (!tournamentId) return
  await sb.from('wallet_transactions').delete().eq('reference_id', tournamentId)
  await sb.from('tournament_results').delete().eq('tournament_id', tournamentId)
  await sb.from('games').delete().eq('tournament_id', tournamentId)
  await sb.from('registrations').delete().eq('tournament_id', tournamentId)
  await sb.from('tournaments').delete().eq('id', tournamentId) // cascada borra los tramos
  console.log('Limpieza OK (torneo de prueba eliminado).')
}

main()
  .then(cleanup)
  .then(() => {
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} verificaciones OK`)
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch(async (e) => {
    console.error('ERROR:', e.message)
    await cleanup().catch(() => {})
    process.exit(1)
  })

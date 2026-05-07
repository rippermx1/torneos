import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

loadEnvConfig(rootDir)

export const baseUrl = process.env.E2E_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3001'
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
export const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
export const cronSecret = process.env.CRON_SECRET
export const password = process.env.SUPABASE_E2E_PASSWORD ?? 'Torneos2048!Local'
export const emailDomain = process.env.SIM_TOURNAMENT_EMAIL_DOMAIN ?? 'mailinator.com'
export const outputDir = process.env.SIM_TOURNAMENT_OUTPUT_DIR ?? path.join(rootDir, 'artifacts')
export const concurrency = Number(process.env.SIM_TOURNAMENT_CONCURRENCY ?? '12')
export const authConcurrency = Number(process.env.SIM_AUTH_CONCURRENCY ?? '2')
export const thinkMinMs = Number(process.env.SIM_TOURNAMENT_THINK_MIN_MS ?? '5')
export const thinkMaxMs = Number(process.env.SIM_TOURNAMENT_THINK_MAX_MS ?? '25')
export const authRetryBaseMs = Number(process.env.SIM_AUTH_RETRY_BASE_MS ?? '2000')
export const authMaxRetries = Number(process.env.SIM_AUTH_MAX_RETRIES ?? '8')

const BPS = 10000
const DEFAULT_PRIZE_FUND_BPS = 8500
const FLOW_CARD_NEXT_DAY_FEE_RATE = 0.0319
const PLATFORM_FEE_NET_SHARE = 1 / 1.19
const USER_FEE_RATE =
  FLOW_CARD_NEXT_DAY_FEE_RATE / (PLATFORM_FEE_NET_SHARE - FLOW_CARD_NEXT_DAY_FEE_RATE)
const USER_FEE_MIN_CENTS = 15000

if (!supabaseUrl || !supabaseBrowserKey || !supabaseServiceKey || !cronSecret) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY o CRON_SECRET.'
  )
  process.exit(1)
}

export const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const scenarios = [
  {
    slug: 'standard-max-paid',
    label: 'Standard pago al maximo',
    playerCount: Number(process.env.SIM_STANDARD_MAX_PLAYERS ?? '100'),
    tournamentType: 'standard',
    entryFee: 100000,
    minPlayers: Number(process.env.SIM_STANDARD_MAX_PLAYERS ?? '100'),
    movePlan: {
      aggressive: [36, 60],
      steady: [22, 38],
      casual: [10, 18],
      dropout: [1, 5],
      sprinter: [28, 50],
    },
  },
  {
    slug: 'freeroll-max',
    label: 'Freeroll al maximo',
    playerCount: Number(process.env.SIM_FREEROLL_MAX_PLAYERS ?? '200'),
    tournamentType: 'freeroll',
    entryFee: 0,
    prize1: 1500000,
    prize2: 800000,
    prize3: 400000,
    minPlayers: Number(process.env.SIM_FREEROLL_MAX_PLAYERS ?? '200'),
    movePlan: {
      aggressive: [28, 46],
      steady: [18, 32],
      casual: [8, 16],
      dropout: [0, 3],
      sprinter: [24, 42],
    },
  },
]

export function resolveScenarioConfig(scenario) {
  if (scenario.entryFee <= 0) {
    return { ...scenario }
  }

  const projectedRevenue = scenario.entryFee * scenario.minPlayers
  const targetPrizeFund = Math.max(300000, Math.floor(projectedRevenue * 0.72))
  const prize1 = Math.max(100000, Math.floor(targetPrizeFund * 0.6))
  const prize2 = Math.max(50000, Math.floor(targetPrizeFund * 0.25))
  const prize3 = Math.max(0, targetPrizeFund - prize1 - prize2)

  return {
    ...scenario,
    prize1,
    prize2,
    prize3,
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function computeSyntheticFlowBreakdown(netCents) {
  const rawFee = Math.ceil(netCents * USER_FEE_RATE)
  const userFeeCents = Math.max(USER_FEE_MIN_CENTS, rawFee)
  const chargedCents = Math.ceil((netCents + userFeeCents) / 100) * 100

  return {
    netCents,
    chargedCents,
    userFeeCents: chargedCents - netCents,
  }
}

export function expectedPrizeFundCents(tournament, playerCount) {
  if (!tournament || tournament.entry_fee_cents <= 0) {
    return null
  }

  const prizeFundBps = tournament.prize_fund_bps ?? DEFAULT_PRIZE_FUND_BPS
  return Math.round((tournament.entry_fee_cents * playerCount * prizeFundBps) / BPS)
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFloat(min, max) {
  return min + Math.random() * (max - min)
}

export function sample(array) {
  return array[Math.floor(Math.random() * array.length)]
}

export async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let index = 0

  async function runNext() {
    while (true) {
      const currentIndex = index
      if (currentIndex >= items.length) return
      index += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => runNext())
  )

  return results
}

export function createCookieJar() {
  return new Map()
}

export function createAuthClient(cookieJar) {
  return createServerClient(supabaseUrl, supabaseBrowserKey, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, cookie]) => ({
          name,
          value: cookie.value,
        }))
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          cookieJar.set(cookie.name, {
            value: cookie.value,
            options: cookie.options ?? {},
          })
        }
      },
    },
  })
}

export function getCookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join('; ')
}

export function updateJarFromResponse(cookieJar, response) {
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : []

  for (const headerValue of setCookies) {
    const [pair] = headerValue.split(';', 1)
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue

    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()
    cookieJar.set(name, { value, options: {} })
  }
}

export async function fetchWithJar(cookieJar, url, init = {}) {
  const headers = new Headers(init.headers ?? {})
  const cookieHeader = getCookieHeader(cookieJar)
  if (cookieHeader) {
    headers.set('cookie', cookieHeader)
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
  })

  updateJarFromResponse(cookieJar, response)
  return response
}

export async function callJson(url, init = {}, cookieJar) {
  const headers = new Headers(init.headers ?? {})
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetchWithJar(cookieJar ?? createCookieJar(), url, {
    ...init,
    headers,
  })

  const payload = await response.json().catch(() => null)
  return { response, payload }
}

export function parseServerActionInputs(html) {
  const inputs = []
  const pattern = /<input[^>]+type="hidden"[^>]+name="([^"]+)"(?:[^>]+value="([^"]*)")?[^>]*>/g

  for (const match of html.matchAll(pattern)) {
    const [, name, value = ''] = match
    if (name.startsWith('$ACTION_')) {
      inputs.push({ name, value })
    }
  }

  return inputs
}

export function toLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

export async function runCron() {
  const response = await fetch(`${baseUrl}/api/cron/process-tournaments`, {
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
  })

  const payload = await response.json()
  assert(response.status === 200, `El cron local respondió ${response.status}`)
  assert(payload?.ok === true, 'El cron local no respondió ok=true.')
  return payload
}

export async function findUsersByEmails(emails) {
  const emailSet = new Set(emails)
  const found = new Map()
  let page = 1

  while (found.size < emailSet.size) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) throw error
    if (data.users.length === 0) break

    for (const user of data.users) {
      if (user.email && emailSet.has(user.email)) {
        found.set(user.email, user)
      }
    }

    if (data.users.length < 200) break
    page += 1
  }

  return found
}

export function buildSimFixtures(totalPlayers) {
  const fixtures = []

  for (let index = 1; index <= totalPlayers; index += 1) {
    const padded = String(index).padStart(3, '0')
    fixtures.push({
      email: `sim.player.${padded}@${emailDomain}`,
      username: `sim_player_${padded}`,
      fullName: `Sim Player ${padded}`,
      isAdmin: false,
      birthDate: `199${index % 10}-0${(index % 8) + 1}-15`,
      balanceTarget: 25000,
    })
  }

  fixtures.push({
    email: `sim.overflow.001@${emailDomain}`,
    username: 'sim_overflow_001',
    fullName: 'Sim Overflow 001',
    isAdmin: false,
    birthDate: '1992-06-10',
    balanceTarget: 25000,
  })

  return fixtures
}

export async function ensureUser(fixture, existingUsers) {
  const existingUser = existingUsers.get(fixture.email)

  if (!existingUser) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email: fixture.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fixture.fullName },
    })

    if (error || !data.user) {
      throw error ?? new Error(`No se pudo crear el usuario ${fixture.email}`)
    }

    return data.user
  }

  const { data, error } = await adminSupabase.auth.admin.updateUserById(existingUser.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(existingUser.user_metadata ?? {}),
      full_name: fixture.fullName,
    },
  })

  if (error || !data.user) {
    throw error ?? new Error(`No se pudo actualizar el usuario ${fixture.email}`)
  }

  return data.user
}

export async function ensureProfile(user, fixture) {
  const { error } = await adminSupabase.from('profiles').upsert({
    id: user.id,
    username: fixture.username,
    full_name: fixture.fullName,
    birth_date: fixture.birthDate,
    is_admin: fixture.isAdmin,
    is_banned: false,
    kyc_status: 'approved',
    kyc_verified_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
  })

  if (error) throw error
}

export async function ensureBalance(userId, balanceTarget) {
  const { data, error } = await adminSupabase
    .from('wallet_transactions')
    .select('balance_after_cents')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error

  const currentBalance = data?.[0]?.balance_after_cents ?? 0
  if (currentBalance >= balanceTarget) {
    return currentBalance
  }

  const nextBalance = balanceTarget
  const { error: insertError } = await adminSupabase
    .from('wallet_transactions')
    .insert({
      user_id: userId,
      type: 'adjustment',
      amount_cents: nextBalance - currentBalance,
      balance_after_cents: nextBalance,
      reference_type: 'simulation_topup',
      reference_id: null,
      metadata: { source: 'simulate-tournaments' },
    })

  if (insertError) throw insertError
  return nextBalance
}

export async function signIn(email) {
  const cookieJar = createCookieJar()
  const authClient = createAuthClient(cookieJar)
  let attempt = 0

  while (attempt <= authMaxRetries) {
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (!error && data.session && data.user) {
      return {
        email,
        userId: data.user.id,
        cookieJar,
      }
    }

    const isRateLimited =
      error?.status === 429 || error?.code === 'over_request_rate_limit'

    if (!isRateLimited || attempt === authMaxRetries) {
      throw error ?? new Error(`No se pudo iniciar sesión con ${email}`)
    }

    const backoffMs = authRetryBaseMs * (attempt + 1) + randomInt(0, 750)
    await sleep(backoffMs)
    attempt += 1
  }

  throw new Error(`No se pudo iniciar sesión con ${email}`)
}

export async function ensureSimulationUsers(totalPlayers) {
  const fixtures = buildSimFixtures(totalPlayers)
  const existing = await findUsersByEmails(fixtures.map((fixture) => fixture.email))

  return runPool(fixtures, Math.min(8, concurrency), async (fixture) => {
    const user = await ensureUser(fixture, existing)
    await ensureProfile(user, fixture)

    return {
      ...fixture,
      userId: user.id,
    }
  })
}

export async function createTournamentAsAdmin(cookieJar, scenario) {
  const getResponse = await fetchWithJar(cookieJar, `${baseUrl}/admin/tournaments/new`)
  const html = await getResponse.text()

  assert(getResponse.status === 200, 'La ruta /admin/tournaments/new no respondió 200 para admin.')
  const hiddenInputs = parseServerActionInputs(html)
  assert(hiddenInputs.length > 0, 'No encontré el input oculto de la server action.')

  const now = new Date()
  const registrationOpensAt = new Date(now.getTime() - 10 * 60 * 1000)
  const playWindowStart = new Date(now.getTime() + 15 * 60 * 1000)
  const playWindowEnd = new Date(now.getTime() + 45 * 60 * 1000)
  const formData = new FormData()

  for (const input of hiddenInputs) {
    formData.append(input.name, input.value)
  }

  const tournamentName = `${scenario.label} ${Date.now()}`
  formData.append('tournament_type', scenario.tournamentType)
  formData.append('name', tournamentName)
  formData.append('description', `Simulación automatizada ${scenario.slug}`)
  formData.append('entry_fee', String(Math.round(scenario.entryFee / 100)))
  formData.append('prize_1st', String(Math.round(scenario.prize1 / 100)))
  formData.append('prize_2nd', String(Math.round(scenario.prize2 / 100)))
  formData.append('prize_3rd', String(Math.round(scenario.prize3 / 100)))
  formData.append('min_players', String(scenario.minPlayers))
  formData.append('max_players', String(scenario.playerCount))
  formData.append('registration_opens_at', toLocalDateTimeInput(registrationOpensAt))
  formData.append('play_window_start', toLocalDateTimeInput(playWindowStart))
  formData.append('play_window_end', toLocalDateTimeInput(playWindowEnd))
  formData.append('max_game_duration_minutes', '12')

  const postResponse = await fetchWithJar(cookieJar, `${baseUrl}/admin/tournaments/new`, {
    method: 'POST',
    body: formData,
  })

  assert([303, 307].includes(postResponse.status), `Crear torneo devolvió ${postResponse.status}`)
  const location = postResponse.headers.get('location')
  assert(location, 'La creación del torneo no devolvió location.')

  return {
    id: location.split('/').pop(),
    name: tournamentName,
  }
}

export function emptyBoard() {
  return Array.from({ length: 4 }, () => Array(4).fill(0))
}

export function deepCopy(board) {
  return board.map((row) => [...row])
}

export function rotateCCW(board) {
  const result = emptyBoard()
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      result[3 - col][row] = board[row][col]
    }
  }
  return result
}

export function rotateBoard(board, times) {
  let result = deepCopy(board)
  const normalized = ((times % 4) + 4) % 4
  for (let step = 0; step < normalized; step += 1) {
    result = rotateCCW(result)
  }
  return result
}

export function slideRowLeft(row) {
  const tiles = row.filter((value) => value !== 0)
  let index = 0
  let scoreGained = 0
  const merged = []

  while (index < tiles.length) {
    if (index + 1 < tiles.length && tiles[index] === tiles[index + 1]) {
      const mergedValue = tiles[index] * 2
      merged.push(mergedValue)
      scoreGained += mergedValue
      index += 2
    } else {
      merged.push(tiles[index])
      index += 1
    }
  }

  while (merged.length < 4) {
    merged.push(0)
  }

  const changed = row.some((value, rowIndex) => value !== merged[rowIndex])
  return { newRow: merged, scoreGained, changed }
}

export function simulateMove(board, direction) {
  const rotations = { left: 0, up: 1, right: 2, down: 3 }
  const times = rotations[direction]
  const working = rotateBoard(board, times)
  let moved = false
  let scoreGained = 0

  for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
    const { newRow, scoreGained: gained, changed } = slideRowLeft(working[rowIndex])
    working[rowIndex] = newRow
    scoreGained += gained
    if (changed) moved = true
  }

  return {
    moved,
    scoreGained,
    boardAfter: rotateBoard(working, 4 - times),
  }
}

export function countEmpty(board) {
  return board.flat().filter((value) => value === 0).length
}

export function highestTile(board) {
  return Math.max(...board.flat())
}

export function cornerBonus(board) {
  const maxTile = highestTile(board)
  return board[0][0] === maxTile || board[0][3] === maxTile || board[3][0] === maxTile || board[3][3] === maxTile
    ? maxTile * 2
    : 0
}

export function monotonicityScore(board) {
  let score = 0
  for (const row of board) {
    for (let column = 0; column < 3; column += 1) {
      if (row[column] >= row[column + 1]) score += row[column] - row[column + 1]
    }
  }
  return score / 4
}

export const behaviorProfiles = {
  aggressive: {
    name: 'aggressive',
    mistakeRate: 0.08,
    noise: 120,
    weights: { empty: 18, score: 1.4, monotonicity: 0.4, corner: 0.2 },
    directionBias: { up: 25, left: 18, right: -5, down: -14 },
  },
  steady: {
    name: 'steady',
    mistakeRate: 0.04,
    noise: 70,
    weights: { empty: 16, score: 1.0, monotonicity: 0.55, corner: 0.35 },
    directionBias: { up: 20, left: 16, right: -8, down: -16 },
  },
  casual: {
    name: 'casual',
    mistakeRate: 0.15,
    noise: 160,
    weights: { empty: 12, score: 0.9, monotonicity: 0.25, corner: 0.15 },
    directionBias: { up: 8, left: 6, right: 0, down: -4 },
  },
  dropout: {
    name: 'dropout',
    mistakeRate: 0.22,
    noise: 190,
    weights: { empty: 8, score: 0.7, monotonicity: 0.1, corner: 0.05 },
    directionBias: { up: 5, left: 3, right: 1, down: -2 },
  },
  sprinter: {
    name: 'sprinter',
    mistakeRate: 0.12,
    noise: 110,
    weights: { empty: 14, score: 1.25, monotonicity: 0.2, corner: 0.2 },
    directionBias: { up: 10, left: 14, right: -2, down: -6 },
  },
}

export function assignBehavior(index) {
  const cycle = ['steady', 'aggressive', 'casual', 'sprinter', 'dropout']
  return behaviorProfiles[cycle[index % cycle.length]]
}

export function getTargetMoves(scenario, behaviorName) {
  const [min, max] = scenario.movePlan[behaviorName]
  return randomInt(min, max)
}

export function chooseMove(board, behavior) {
  const candidates = ['up', 'left', 'right', 'down']
    .map((direction) => {
      const simulated = simulateMove(board, direction)
      if (!simulated.moved) return null

      const heuristic =
        countEmpty(simulated.boardAfter) * behavior.weights.empty +
        simulated.scoreGained * behavior.weights.score +
        monotonicityScore(simulated.boardAfter) * behavior.weights.monotonicity +
        cornerBonus(simulated.boardAfter) * behavior.weights.corner +
        behavior.directionBias[direction] +
        randomFloat(0, behavior.noise)

      return {
        direction,
        heuristic,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) return null

  candidates.sort((left, right) => right.heuristic - left.heuristic)

  if (Math.random() < behavior.mistakeRate) {
    return sample(candidates).direction
  }

  return candidates[0].direction
}

export async function registerPlayer(session, tournamentId) {
  const { data: tournament, error: tournamentError } = await adminSupabase
    .from('tournaments')
    .select('id, entry_fee_cents')
    .eq('id', tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return {
      email: session.email,
      userId: session.userId,
      status: 500,
      ok: false,
      error: tournamentError?.message ?? 'Torneo no encontrado',
    }
  }

  if (tournament.entry_fee_cents > 0) {
    return settlePaidRegistrationForSimulation(session, tournament)
  }

  const { response, payload } = await callJson(
    `${baseUrl}/api/tournaments/${tournamentId}/register`,
    { method: 'POST' },
    session.cookieJar
  )

  return {
    email: session.email,
    userId: session.userId,
    status: response.status,
    ok: response.status === 200 && payload?.ok === true,
    error: payload?.error ?? null,
  }
}

export async function settlePaidRegistrationForSimulation(session, tournament) {
  const commerceOrder = `sim-tour-${randomUUID()}`
  const flowToken = `sim-token-${randomUUID()}`
  const breakdown = computeSyntheticFlowBreakdown(tournament.entry_fee_cents)

  const { data: attempt, error: insertError } = await adminSupabase
    .from('flow_payment_attempts')
    .insert({
      user_id: session.userId,
      tournament_id: tournament.id,
      commerce_order: commerceOrder,
      net_amount_cents: breakdown.netCents,
      charged_amount_cents: breakdown.chargedCents,
      user_fee_cents: breakdown.userFeeCents,
      status: 'pending',
      intent: 'tournament_registration',
      flow_token: flowToken,
      flow_order: Math.floor(Date.now() % 1_000_000_000),
    })
    .select('id')
    .single()

  if (insertError || !attempt) {
    return {
      email: session.email,
      userId: session.userId,
      status: insertError?.code === '23505' ? 409 : 500,
      ok: false,
      error: insertError?.message ?? 'No se pudo crear flow_payment_attempt',
    }
  }

  const { error: settleError } = await adminSupabase.rpc('settle_tournament_registration', {
    p_commerce_order: commerceOrder,
    p_flow_token: flowToken,
    p_flow_order: Math.floor(Date.now() % 1_000_000_000),
    p_amount_cents: breakdown.chargedCents,
    p_payment_method: 'simulation',
    p_payer_email: session.email,
    p_raw: {
      source: 'simulate-tournaments',
      synthetic: true,
      status: 2,
      amount: breakdown.chargedCents / 100,
    },
  })

  if (settleError) {
    await adminSupabase
      .from('flow_payment_attempts')
      .update({ status: 'rejected', settled_at: new Date().toISOString() })
      .eq('id', attempt.id)

    const isBusinessRejection =
      settleError.message.includes('lleno') ||
      settleError.message.includes('inscrito') ||
      settleError.message.includes('no esta abierto') ||
      settleError.message.includes('ventana')

    return {
      email: session.email,
      userId: session.userId,
      status: isBusinessRejection ? 400 : 500,
      ok: false,
      error: settleError.message,
    }
  }

  return {
    email: session.email,
    userId: session.userId,
    status: 200,
    ok: true,
    error: null,
  }
}

export async function startGame(session, tournamentId) {
  const { response, payload } = await callJson(
    `${baseUrl}/api/tournaments/${tournamentId}/game/start`,
    { method: 'POST' },
    session.cookieJar
  )

  return {
    email: session.email,
    userId: session.userId,
    status: response.status,
    payload,
  }
}

export async function playGame(session, scenario, tournamentId, gameStartPayload, behavior) {
  let moveNumber = gameStartPayload.moveNumber
  let board = gameStartPayload.board
  let totalMoves = 0
  let successfulMoves = 0
  let latestScore = gameStartPayload.score ?? 0
  const targetMoves = getTargetMoves(scenario, behavior.name)
  const errors = []

  while (totalMoves < targetMoves) {
    const direction = chooseMove(board, behavior)
    if (!direction) break

    await sleep(randomInt(thinkMinMs, thinkMaxMs))

    const { response, payload } = await callJson(
      `${baseUrl}/api/tournaments/${tournamentId}/game/move`,
      {
        method: 'POST',
        body: JSON.stringify({
          gameId: gameStartPayload.gameId,
          direction,
          moveNumber,
          clientTimestamp: Date.now(),
        }),
      },
      session.cookieJar
    )

    totalMoves += 1

    if (response.status !== 200) {
      errors.push(payload?.error ?? `HTTP ${response.status}`)
      break
    }

    if (payload?.moved) {
      successfulMoves += 1
      board = payload.board
      moveNumber = payload.moveNumber
      latestScore = payload.score
    }

    if (payload?.gameOver) break
  }

  return {
    email: session.email,
    userId: session.userId,
    behavior: behavior.name,
    targetMoves,
    totalMoves,
    successfulMoves,
    finalScore: latestScore,
    gameId: gameStartPayload.gameId,
    errors,
  }
}

export async function collectScenarioSummary(scenario, tournament, playerIds) {
  const [
    tournamentResult,
    registrationsResult,
    gamesResult,
    leaderboardResult,
    walletResult,
    flowAttemptsResult,
  ] = await Promise.all([
    adminSupabase.from('tournaments').select('*').eq('id', tournament.id).single(),
    adminSupabase.from('registrations').select('id, user_id').eq('tournament_id', tournament.id),
    adminSupabase.from('games').select('id, user_id, status, final_score, highest_tile, move_count, end_reason').eq('tournament_id', tournament.id),
    adminSupabase.from('tournament_results').select('id, user_id, rank, final_score, prize_awarded_cents').eq('tournament_id', tournament.id).order('rank', { ascending: true }),
    adminSupabase.from('wallet_transactions').select('type, amount_cents, user_id, reference_type, reference_id').eq('reference_id', tournament.id),
    adminSupabase.from('flow_payment_attempts').select('id, status').eq('tournament_id', tournament.id),
  ])

  const registrations = registrationsResult.data ?? []
  const games = gamesResult.data ?? []
  const leaderboard = leaderboardResult.data ?? []
  const walletTransactions = walletResult.data ?? []
  const flowAttempts = flowAttemptsResult.data ?? []
  const tournamentRow = tournamentResult.data

  const statuses = Object.fromEntries(
    Object.entries(
      games.reduce((accumulator, game) => {
        accumulator[game.status] = (accumulator[game.status] ?? 0) + 1
        return accumulator
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  )

  const timeoutGames = games.filter((game) => game.end_reason === 'timeout').length
  const ticketDebits = walletTransactions.filter((transaction) => transaction.type === 'ticket_debit')
  const prizeCredits = walletTransactions.filter((transaction) => transaction.type === 'prize_credit')
  const refunds = walletTransactions.filter((transaction) => transaction.type === 'refund')
  const paidFlowAttempts = flowAttempts.filter((attempt) => attempt.status === 'paid')
  const ranks = leaderboard.map((row) => row.rank)
  const contiguousRanks = ranks.every((rank, index) => rank === index + 1)
  const uniqueRegistrants = new Set(registrations.map((registration) => registration.user_id))
  const uniqueGameUsers = new Set(games.map((game) => game.user_id))

  const anomalies = []

  if (registrations.length !== scenario.playerCount) {
    anomalies.push(`registrations=${registrations.length} expected=${scenario.playerCount}`)
  }

  if (uniqueRegistrants.size !== registrations.length) {
    anomalies.push('hay usuarios duplicados en registrations')
  }

  if (games.length !== scenario.playerCount) {
    anomalies.push(`games=${games.length} expected=${scenario.playerCount}`)
  }

  if (uniqueGameUsers.size !== games.length) {
    anomalies.push('hay mas de una partida por usuario en games')
  }

  if (leaderboard.length !== scenario.playerCount) {
    anomalies.push(`tournament_results=${leaderboard.length} expected=${scenario.playerCount}`)
  }

  if (!contiguousRanks) {
    anomalies.push('los ranks de tournament_results no son contiguos')
  }

  if (tournamentRow?.status !== 'completed') {
    anomalies.push(`estado final del torneo=${tournamentRow?.status ?? 'null'}`)
  }

  if (scenario.entryFee > 0 && paidFlowAttempts.length !== scenario.playerCount) {
    anomalies.push(`flow_paid_attempts=${paidFlowAttempts.length} expected=${scenario.playerCount}`)
  }

  if (scenario.entryFee > 0 && ticketDebits.length > 0) {
    anomalies.push(`ticket_debits_legados=${ticketDebits.length}`)
  }

  if (refunds.length > 0) {
    anomalies.push(`refunds inesperados=${refunds.length}`)
  }

  const expectedPrizeSum =
    expectedPrizeFundCents(tournamentRow, registrations.length) ??
    scenario.prize1 + scenario.prize2 + scenario.prize3
  const actualPrizeSum = prizeCredits.reduce((sum, transaction) => sum + transaction.amount_cents, 0)
  if (actualPrizeSum !== expectedPrizeSum) {
    anomalies.push(`prize_sum=${actualPrizeSum} expected=${expectedPrizeSum}`)
  }

  if (!playerIds.every((userId) => uniqueRegistrants.has(userId))) {
    anomalies.push('faltan usuarios esperados en registrations')
  }

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    finalStatus: tournamentRow?.status ?? null,
    registrations: registrations.length,
    games: games.length,
    leaderboardRows: leaderboard.length,
    timeoutGames,
    ticketDebits: ticketDebits.length,
    paidFlowAttempts: paidFlowAttempts.length,
    prizeCredits: prizeCredits.length,
    refundCount: refunds.length,
    averageScore:
      games.length > 0
        ? Math.round(games.reduce((sum, game) => sum + Number(game.final_score), 0) / games.length)
        : 0,
    topScore: games.length > 0 ? Math.max(...games.map((game) => Number(game.final_score))) : 0,
    gameStatuses: statuses,
    anomalies,
  }
}

async function runScenario(adminSession, sessions, scenario, overflowSession) {
  const resolvedScenario = resolveScenarioConfig(scenario)
  const report = {
    scenario: resolvedScenario.label,
    slug: resolvedScenario.slug,
    requestedPlayers: resolvedScenario.playerCount,
    registration: {},
    gameplay: {},
    summary: {},
    errors: [],
  }

  const playerSessions = sessions.slice(0, resolvedScenario.playerCount)
  const playerIds = playerSessions.map((session) => session.userId)
  const tournament = await createTournamentAsAdmin(adminSession.cookieJar, resolvedScenario)

  console.log(`\n[${resolvedScenario.label}] torneo creado: ${tournament.name} (${tournament.id})`)

  const openedTournament = await runCron()
  assert(
    openedTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'opened'
    ),
    `[${resolvedScenario.label}] el cron no abrió el torneo`
  )

  const registrationResults = await runPool(playerSessions, concurrency, (session) =>
    registerPlayer(session, tournament.id)
  )

  const successfulRegistrations = registrationResults.filter((result) => result.ok)
  const failedRegistrations = registrationResults.filter((result) => !result.ok)

  report.registration = {
    successful: successfulRegistrations.length,
    failed: failedRegistrations.length,
    failures: failedRegistrations.slice(0, 10),
  }

  const overflowAttempt = await registerPlayer(overflowSession, tournament.id)
  report.registration.overflowAttempt = overflowAttempt

  if (!overflowAttempt.error || overflowAttempt.status !== 400) {
    report.errors.push('el usuario overflow no fue bloqueado correctamente')
  }

  const { error: startWindowError } = await adminSupabase
    .from('tournaments')
    .update({
      play_window_start: new Date(Date.now() - 60 * 1000).toISOString(),
      play_window_end: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .eq('id', tournament.id)
  assert(!startWindowError, `No se pudo adelantar ventana de juego: ${startWindowError?.message}`)

  const startedTournament = await runCron()
  assert(
    startedTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'started'
    ),
    `[${resolvedScenario.label}] el cron no pasó el torneo a live`
  )

  const startResults = await runPool(playerSessions, concurrency, (session) =>
    startGame(session, tournament.id)
  )

  const failedStarts = startResults.filter((result) => result.status !== 200 || !result.payload?.gameId)
  report.gameplay.startsOk = startResults.length - failedStarts.length
  report.gameplay.startsFailed = failedStarts.length
  report.gameplay.startFailures = failedStarts.slice(0, 10)

  const playResults = await runPool(startResults, concurrency, async (startResult, index) => {
    if (startResult.status !== 200 || !startResult.payload?.gameId) {
      return {
        email: startResult.email,
        userId: startResult.userId,
        behavior: 'not_started',
        targetMoves: 0,
        totalMoves: 0,
        successfulMoves: 0,
        finalScore: 0,
        gameId: null,
        errors: ['start_failed'],
      }
    }

    const behavior = assignBehavior(index)
    const session = playerSessions[index]
    return playGame(session, resolvedScenario, tournament.id, startResult.payload, behavior)
  })

  const { error: closeWindowError } = await adminSupabase
    .from('tournaments')
    .update({
      registration_opens_at: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
      play_window_start: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      play_window_end: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    })
    .eq('id', tournament.id)
  assert(!closeWindowError, `No se pudo cerrar ventana de juego: ${closeWindowError?.message}`)

  const finalizingTournament = await runCron()
  assert(
    finalizingTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'set_finalizing'
    ),
    `[${resolvedScenario.label}] el cron no pasó el torneo a finalizing`
  )

  const finalizedTournament = await runCron()
  assert(
    finalizedTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'finalized'
    ),
    `[${resolvedScenario.label}] el cron no finalizó el torneo`
  )

  const erroredGames = playResults.filter((result) => result.errors.length > 0)
  report.gameplay.played = playResults.length
  report.gameplay.errors = erroredGames.length
  report.gameplay.sampleErrors = erroredGames.slice(0, 10)
  report.gameplay.averageSuccessfulMoves =
    playResults.length > 0
      ? Math.round(
          playResults.reduce((sum, result) => sum + result.successfulMoves, 0) / playResults.length
        )
      : 0

  report.summary = await collectScenarioSummary(resolvedScenario, tournament, playerIds)

  if (failedRegistrations.length > 0) {
    report.errors.push(`fallaron ${failedRegistrations.length} inscripciones`)
  }
  if (failedStarts.length > 0) {
    report.errors.push(`fallaron ${failedStarts.length} inicios de partida`)
  }
  if (erroredGames.length > 0) {
    report.errors.push(`hubo ${erroredGames.length} partidas con errores de move`)
  }
  if (report.summary.anomalies.length > 0) {
    report.errors.push(...report.summary.anomalies)
  }

  console.log(
    `[${resolvedScenario.label}] registros=${report.summary.registrations}, juegos=${report.summary.games}, resultados=${report.summary.leaderboardRows}, timeouts=${report.summary.timeoutGames}, errores=${report.errors.length}`
  )

  return report
}

export async function main() {
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Concurrencia: ${concurrency}`)
  console.log(`Concurrencia auth: ${authConcurrency}`)

  const adminSession = await signIn('admin.local.e2e@example.com')
  const maxPlayersNeeded = Math.max(...scenarios.map((scenario) => scenario.playerCount))
  const users = await ensureSimulationUsers(maxPlayersNeeded, Math.max(...scenarios.map((scenario) => scenario.entryFee)))
  const playerUsers = users.slice(0, maxPlayersNeeded)
  const overflowUser = users[maxPlayersNeeded]

  console.log(`Usuarios simulados preparados: ${playerUsers.length} + 1 overflow`)

  const sessions = await runPool(playerUsers, authConcurrency, (user) => signIn(user.email))
  const overflowSession = await signIn(overflowUser.email)

  const reports = []
  for (const scenario of scenarios) {
    const scenarioReport = await runScenario(adminSession, sessions, scenario, overflowSession)
    reports.push(scenarioReport)
  }

  const overall = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    scenarios: reports,
    anomalies: reports.flatMap((report) => report.errors.map((error) => `[${report.slug}] ${error}`)),
  }

  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `tournament-simulation-${Date.now()}.json`)
  await fs.writeFile(outputPath, JSON.stringify(overall, null, 2))

  console.log(`\nReporte escrito en ${outputPath}`)
  for (const report of reports) {
    console.log(JSON.stringify({
      scenario: report.scenario,
      registration: report.registration.successful,
      games: report.summary.games,
      leaderboard: report.summary.leaderboardRows,
      timeouts: report.summary.timeoutGames,
      topScore: report.summary.topScore,
      errors: report.errors,
    }, null, 2))
  }

  if (overall.anomalies.length > 0) {
    console.error('\nAnomalias detectadas:')
    for (const anomaly of overall.anomalies) {
      console.error(`- ${anomaly}`)
    }
    process.exit(1)
  }

  console.log('\nSimulación masiva OK')
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

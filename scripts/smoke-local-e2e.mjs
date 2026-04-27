import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

loadEnvConfig(rootDir)

const baseUrl = process.env.E2E_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3001'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const cronSecret = process.env.CRON_SECRET
const fixturePassword = process.env.SUPABASE_E2E_PASSWORD ?? 'Torneos2048!Local'
const smokePassword = process.env.SUPABASE_SMOKE_PASSWORD ?? fixturePassword
const smokeEmailDomain = process.env.SUPABASE_SMOKE_EMAIL_DOMAIN ?? 'mailinator.com'

if (!supabaseUrl || !supabaseBrowserKey || !supabaseServiceKey) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.'
  )
  process.exit(1)
}

if (!cronSecret) {
  console.error('Falta CRON_SECRET para probar las transiciones locales del torneo.')
  process.exit(1)
}

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const smokeEmail = `smoke.local.${Date.now()}@${smokeEmailDomain}`

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function createCookieJar() {
  return new Map()
}

function createAuthClient(cookieJar) {
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

function getCookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join('; ')
}

function updateJarFromResponse(cookieJar, response) {
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

async function fetchWithJar(cookieJar, url, init = {}) {
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

async function fetchFollowingRedirects(cookieJar, url, init = {}, maxRedirects = 10) {
  let nextUrl = new URL(url, baseUrl).toString()
  let method = init.method ?? 'GET'
  let body = init.body
  let headers = init.headers ?? {}

  for (let step = 0; step <= maxRedirects; step += 1) {
    const response = await fetchWithJar(cookieJar, nextUrl, {
      ...init,
      method,
      headers,
      body,
    })

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    assert(location, `Redirect sin location en ${nextUrl}`)

    nextUrl = new URL(location, nextUrl).toString()

    if (response.status === 303) {
      method = 'GET'
      body = undefined
      headers = {}
    }
  }

  throw new Error(`Demasiados redirects al navegar hacia ${url}`)
}

async function expectPage(url, { cookieJar, text, status = 200 } = {}) {
  const response = await fetchFollowingRedirects(cookieJar ?? createCookieJar(), url)
  const html = await response.text()

  assert(
    response.status === status,
    `Esperaba ${status} en ${url}, obtuve ${response.status}`
  )

  if (text) {
    assert(html.includes(text), `No encontré "${text}" en ${url}`)
  }

  return { response, html }
}

async function signIn(email, password) {
  const cookieJar = createCookieJar()
  const authClient = createAuthClient(cookieJar)
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    throw error ?? new Error(`No se pudo iniciar sesión con ${email}`)
  }

  return { cookieJar, authClient, user: data.user }
}

async function callJson(url, init = {}, cookieJar) {
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

function parseServerActionInputs(html) {
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

async function createTournamentAsAdmin(cookieJar) {
  const getResponse = await fetchWithJar(cookieJar, `${baseUrl}/admin/tournaments/new`)
  const html = await getResponse.text()

  assert(getResponse.status === 200, 'La ruta /admin/tournaments/new no respondió 200 para admin.')
  assert(html.includes('Crear torneo'), 'La pantalla admin de creación no contiene el formulario esperado.')

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

  const tournamentName = `Smoke Local ${Date.now()}`
  formData.append('tournament_type', 'freeroll')
  formData.append('name', tournamentName)
  formData.append('description', 'Smoke test local end-to-end')
  formData.append('entry_fee', '0')
  formData.append('prize_1st', '100')
  formData.append('prize_2nd', '50')
  formData.append('prize_3rd', '0')
  formData.append('min_players', '2')
  formData.append('max_players', '4')
  formData.append('registration_opens_at', toLocalDateTimeInput(registrationOpensAt))
  formData.append('play_window_start', toLocalDateTimeInput(playWindowStart))
  formData.append('play_window_end', toLocalDateTimeInput(playWindowEnd))
  formData.append('max_game_duration_minutes', '10')

  const postResponse = await fetchWithJar(cookieJar, `${baseUrl}/admin/tournaments/new`, {
    method: 'POST',
    body: formData,
  })

  assert(
    [303, 307].includes(postResponse.status),
    `Crear torneo debía redirigir, obtuve ${postResponse.status}`
  )

  const location = postResponse.headers.get('location')
  assert(location, 'La creación del torneo no devolvió location.')

  const tournamentId = location.split('/').pop()
  assert(tournamentId, 'No pude extraer el id del torneo creado.')

  return { tournamentId, tournamentName }
}

function toLocalDateTimeInput(date) {
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

async function runCron() {
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

async function registerPlayer(cookieJar, tournamentId) {
  const { response, payload } = await callJson(
    `${baseUrl}/api/tournaments/${tournamentId}/register`,
    { method: 'POST' },
    cookieJar
  )

  assert(response.status === 200, `Falló la inscripción al torneo: ${payload?.error ?? response.status}`)
  assert(payload?.ok === true, 'La inscripción no devolvió ok=true.')
}

async function startGame(cookieJar, tournamentId) {
  const { response, payload } = await callJson(
    `${baseUrl}/api/tournaments/${tournamentId}/game/start`,
    { method: 'POST' },
    cookieJar
  )

  assert(response.status === 200, `No se pudo iniciar la partida: ${payload?.error ?? response.status}`)
  assert(payload?.gameId, 'La partida no devolvió gameId.')
  assert(Array.isArray(payload?.board), 'La partida no devolvió board.')

  return payload
}

async function playSomeMoves(cookieJar, tournamentId, gameId, initialMoveNumber, minSuccessfulMoves) {
  const directions = ['up', 'left', 'down', 'right']
  let moveNumber = initialMoveNumber
  let attempts = 0
  let successfulMoves = 0
  let lastPayload = null

  while (successfulMoves < minSuccessfulMoves && attempts < 80) {
    const direction = directions[attempts % directions.length]
    const { response, payload } = await callJson(
      `${baseUrl}/api/tournaments/${tournamentId}/game/move`,
      {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          direction,
          moveNumber,
          clientTimestamp: Date.now(),
        }),
      },
      cookieJar
    )

    assert(response.status === 200, `Movimiento rechazado: ${payload?.error ?? response.status}`)

    if (payload?.moved) {
      successfulMoves += 1
      moveNumber = payload.moveNumber
      lastPayload = payload
    }

    attempts += 1
  }

  assert(
    successfulMoves >= minSuccessfulMoves,
    `No se alcanzaron ${minSuccessfulMoves} movimientos válidos para ${gameId}.`
  )

  return {
    successfulMoves,
    score: lastPayload?.score ?? 0,
    moveNumber,
  }
}

async function main() {
  console.log(`Base URL: ${baseUrl}`)

  await expectPage(`${baseUrl}/sign-up`, { text: 'Crear cuenta' })
  await expectPage(`${baseUrl}/sign-in`, { text: 'Iniciar sesión' })

  const { data: signUpData, error: signUpError } = await adminSupabase.auth.admin.generateLink({
    type: 'signup',
    email: smokeEmail,
    password: smokePassword,
    options: {
      redirectTo: `${baseUrl}/auth/confirm?next=/onboarding`,
    },
  })

  if (signUpError || !signUpData?.user || !signUpData.properties.hashed_token) {
    throw signUpError ?? new Error('No se pudo generar el registro para validar /auth/confirm.')
  }

  console.log(`Registro OK: ${smokeEmail}`)

  const confirmJar = createCookieJar()
  const confirmUrl = new URL(`${baseUrl}/auth/confirm`)
  confirmUrl.searchParams.set('token_hash', signUpData.properties.hashed_token)
  confirmUrl.searchParams.set('type', signUpData.properties.verification_type)
  confirmUrl.searchParams.set('next', '/onboarding')

  const confirmResponse = await fetchFollowingRedirects(confirmJar, confirmUrl.toString())
  const confirmHtml = await confirmResponse.text()
  assert(confirmResponse.status === 200, `La confirmación local devolvió ${confirmResponse.status}`)
  assert(
    confirmHtml.includes('Bienvenido/a') || confirmHtml.includes('Nombre de usuario'),
    'La confirmación local no aterrizó en onboarding.'
  )

  const { data: syncedProfile } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('id', signUpData.user.id)
    .single()

  assert(syncedProfile?.id === signUpData.user.id, 'La confirmación no creó el perfil en public.profiles.')

  const smokeSession = await signIn(smokeEmail, smokePassword)
  const walletPage = await expectPage(`${baseUrl}/wallet`, {
    cookieJar: smokeSession.cookieJar,
    text: 'Mi billetera',
  })
  assert(walletPage.response.status === 200, 'La sesión normal no pudo entrar a /wallet.')

  const nonAdminResponse = await fetchWithJar(smokeSession.cookieJar, `${baseUrl}/admin/tournaments/new`)
  assert(
    [303, 307].includes(nonAdminResponse.status),
    `Un usuario normal no debería entrar a admin, obtuve ${nonAdminResponse.status}`
  )

  const adminSession = await signIn('admin.local.e2e@example.com', fixturePassword)
  await expectPage(`${baseUrl}/admin/tournaments`, {
    cookieJar: adminSession.cookieJar,
    text: 'Torneos',
  })

  const { tournamentId, tournamentName } = await createTournamentAsAdmin(adminSession.cookieJar)
  console.log(`Torneo creado: ${tournamentName} (${tournamentId})`)

  const openedTournament = await runCron()
  assert(
    openedTournament.results.some(
      (result) => result.tournamentId === tournamentId && result.action === 'opened'
    ),
    'El cron no abrió el torneo recién creado.'
  )

  const player1 = await signIn('jugador1.local.e2e@example.com', fixturePassword)
  const player2 = await signIn('jugador2.local.e2e@example.com', fixturePassword)

  await registerPlayer(player1.cookieJar, tournamentId)
  await registerPlayer(player2.cookieJar, tournamentId)

  await adminSupabase
    .from('tournaments')
    .update({
      play_window_start: new Date(Date.now() - 60 * 1000).toISOString(),
      play_window_end: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .eq('id', tournamentId)

  const startedTournament = await runCron()
  assert(
    startedTournament.results.some(
      (result) => result.tournamentId === tournamentId && result.action === 'started'
    ),
    'El cron no pasó el torneo a live.'
  )

  await expectPage(`${baseUrl}/tournaments/${tournamentId}/play`, {
    cookieJar: player1.cookieJar,
    text: tournamentName,
  })

  const game1 = await startGame(player1.cookieJar, tournamentId)
  const game2 = await startGame(player2.cookieJar, tournamentId)

  const result1 = await playSomeMoves(player1.cookieJar, tournamentId, game1.gameId, game1.moveNumber, 8)
  const result2 = await playSomeMoves(player2.cookieJar, tournamentId, game2.gameId, game2.moveNumber, 3)

  console.log(`Partidas iniciadas. Scores parciales: jugador1=${result1.score}, jugador2=${result2.score}`)

  await adminSupabase
    .from('tournaments')
    .update({
      play_window_end: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    .eq('id', tournamentId)

  const finalizingTournament = await runCron()
  assert(
    finalizingTournament.results.some(
      (result) => result.tournamentId === tournamentId && result.action === 'set_finalizing'
    ),
    'El cron no pasó el torneo a finalizing.'
  )

  const finalizedTournament = await runCron()
  assert(
    finalizedTournament.results.some(
      (result) => result.tournamentId === tournamentId && result.action === 'finalized'
    ),
    'El cron no finalizó el torneo.'
  )

  const { data: tournament } = await adminSupabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single()

  assert(tournament?.status === 'completed', 'El torneo no quedó en completed.')

  const { data: results } = await adminSupabase
    .from('tournament_results')
    .select('user_id, rank, final_score, prize_awarded_cents')
    .eq('tournament_id', tournamentId)
    .order('rank', { ascending: true })

  assert((results ?? []).length >= 2, 'No se generaron resultados suficientes del torneo.')

  await expectPage(`${baseUrl}/tournaments/${tournamentId}/leaderboard`, {
    text: tournamentName,
  })

  console.table(
    (results ?? []).map((row) => ({
      rank: row.rank,
      user_id: row.user_id,
      final_score: row.final_score,
      prize_awarded_cents: row.prize_awarded_cents,
    }))
  )

  console.log('Smoke local OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

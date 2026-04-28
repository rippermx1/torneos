import fs from 'node:fs/promises'
import path from 'node:path'
import {
  adminSupabase,
  authConcurrency,
  baseUrl,
  behaviorProfiles,
  chooseMove,
  concurrency,
  createTournamentAsAdmin,
  ensureSimulationUsers,
  fetchWithJar,
  outputDir,
  randomInt,
  registerPlayer,
  resolveScenarioConfig,
  runCron,
  runPool,
  signIn,
  sleep,
  startGame,
  assert,
  callJson,
} from './simulate-tournaments.mjs'

const moveConcurrency = Number(process.env.SIM_BEHAVIORAL_CONCURRENCY ?? String(Math.min(concurrency, 8)))
const minThinkMs = Number(process.env.SIM_BEHAVIORAL_THINK_MIN_MS ?? '95')
const maxThinkMs = Number(process.env.SIM_BEHAVIORAL_THINK_MAX_MS ?? '220')

const scenarios = [
  {
    slug: 'behavioral-paid-standard',
    label: 'Behavioral pago',
    playerCount: Number(process.env.SIM_BEHAVIORAL_STANDARD_PLAYERS ?? '18'),
    tournamentType: 'standard',
    entryFee: 100000,
    minPlayers: Number(process.env.SIM_BEHAVIORAL_STANDARD_MIN_PLAYERS ?? '14'),
  },
  {
    slug: 'behavioral-freeroll',
    label: 'Behavioral freeroll',
    playerCount: Number(process.env.SIM_BEHAVIORAL_FREEROLL_PLAYERS ?? '24'),
    tournamentType: 'freeroll',
    entryFee: 0,
    prize1: 600000,
    prize2: 300000,
    prize3: 150000,
    minPlayers: Number(process.env.SIM_BEHAVIORAL_FREEROLL_MIN_PLAYERS ?? '18'),
  },
]

const planTemplates = [
  { kind: 'grinder', behavior: behaviorProfiles.steady },
  { kind: 'steady', behavior: behaviorProfiles.casual },
  { kind: 'resumer', behavior: behaviorProfiles.sprinter },
  { kind: 'timeout', behavior: behaviorProfiles.dropout },
  { kind: 'no_show', behavior: null },
  { kind: 'steady', behavior: behaviorProfiles.casual },
  { kind: 'timeout', behavior: behaviorProfiles.dropout },
  { kind: 'resumer', behavior: behaviorProfiles.aggressive },
]

function assignPlan(index) {
  const template = planTemplates[index % planTemplates.length]

  switch (template.kind) {
    case 'grinder':
      return {
        kind: 'grinder',
        behavior: template.behavior,
        thinkRange: [minThinkMs, maxThinkMs],
        moveLimit: randomInt(180, 260),
      }
    case 'steady':
      return {
        kind: 'steady',
        behavior: template.behavior,
        thinkRange: [minThinkMs + 20, maxThinkMs + 40],
        moveLimit: randomInt(120, 180),
      }
    case 'resumer':
      return {
        kind: 'resumer',
        behavior: template.behavior,
        thinkRange: [minThinkMs + 10, maxThinkMs + 20],
        firstBurst: randomInt(12, 22),
        secondBurst: randomInt(80, 150),
        finalBurst: randomInt(50, 110),
      }
    case 'timeout':
      return {
        kind: 'timeout',
        behavior: template.behavior,
        thinkRange: [minThinkMs + 40, maxThinkMs + 80],
        moveLimit: randomInt(6, 18),
      }
    default:
      return {
        kind: 'no_show',
        behavior: null,
        thinkRange: [0, 0],
        moveLimit: 0,
      }
  }
}

async function expectPage(url, { cookieJar, status = 200, text } = {}) {
  const response = await fetchWithJar(cookieJar ?? new Map(), url)
  const html = await response.text()

  assert(response.status === status, `Esperaba ${status} en ${url}, obtuve ${response.status}`)
  if (text) {
    assert(html.includes(text), `No encontré "${text}" en ${url}`)
  }

  return { response, html }
}

async function resumeGame(session, tournamentId, expectedGameId) {
  const resumed = await startGame(session, tournamentId)
  assert(resumed.status === 200, `Reanudar partida devolvió ${resumed.status} para ${session.email}`)
  assert(resumed.payload?.resuming === true, `La partida no quedó marcada como resuming para ${session.email}`)
  assert(
    resumed.payload?.gameId === expectedGameId,
    `La reanudación devolvió gameId inesperado para ${session.email}`
  )
  return resumed.payload
}

async function playBurst(session, tournamentId, initialState, plan, maxSuccessfulMoves) {
  let board = initialState.board
  let moveNumber = initialState.moveNumber
  let latestScore = initialState.score ?? 0
  let successfulMoves = 0
  let totalAttempts = 0
  let completedNaturally = false
  const errors = []

  while (successfulMoves < maxSuccessfulMoves) {
    const direction = chooseMove(board, plan.behavior)
    if (!direction) {
      errors.push('sin_direccion_valida')
      break
    }

    const [thinkStart, thinkEnd] = plan.thinkRange
    await sleep(randomInt(thinkStart, thinkEnd))

    const { response, payload } = await callJson(
      `${baseUrl}/api/tournaments/${tournamentId}/game/move`,
      {
        method: 'POST',
        body: JSON.stringify({
          gameId: initialState.gameId,
          direction,
          moveNumber,
          clientTimestamp: Date.now(),
        }),
      },
      session.cookieJar
    )

    totalAttempts += 1

    if (response.status !== 200) {
      errors.push(payload?.error ?? `HTTP ${response.status}`)
      break
    }

    if (!payload?.moved) {
      continue
    }

    successfulMoves += 1
    board = payload.board
    moveNumber = payload.moveNumber
    latestScore = payload.score

    if (payload.gameOver) {
      completedNaturally = true
      break
    }
  }

  return {
    gameId: initialState.gameId,
    board,
    moveNumber,
    latestScore,
    successfulMoves,
    totalAttempts,
    completedNaturally,
    errors,
  }
}

async function executePlan(session, tournamentId, plan) {
  if (plan.kind === 'no_show') {
    return {
      email: session.email,
      userId: session.userId,
      plan: plan.kind,
      started: false,
      resumeVerified: false,
      completedNaturally: false,
      stoppedForTimeout: false,
      successfulMoves: 0,
      totalAttempts: 0,
      finalScore: 0,
      errors: [],
    }
  }

  const firstStart = await startGame(session, tournamentId)
  if (firstStart.status !== 200 || !firstStart.payload?.gameId) {
    return {
      email: session.email,
      userId: session.userId,
      plan: plan.kind,
      started: false,
      resumeVerified: false,
      completedNaturally: false,
      stoppedForTimeout: false,
      successfulMoves: 0,
      totalAttempts: 0,
      finalScore: 0,
      errors: [firstStart.payload?.error ?? `start_http_${firstStart.status}`],
    }
  }

  if (plan.kind === 'timeout') {
    const partial = await playBurst(session, tournamentId, firstStart.payload, plan, plan.moveLimit)
    return {
      email: session.email,
      userId: session.userId,
      plan: plan.kind,
      started: true,
      resumeVerified: false,
      completedNaturally: false,
      stoppedForTimeout: true,
      successfulMoves: partial.successfulMoves,
      totalAttempts: partial.totalAttempts,
      finalScore: partial.latestScore,
      errors: partial.errors,
    }
  }

  if (plan.kind === 'resumer') {
    const firstBurst = await playBurst(session, tournamentId, firstStart.payload, plan, plan.firstBurst)
    if (firstBurst.errors.length > 0 || firstBurst.completedNaturally) {
      return {
        email: session.email,
        userId: session.userId,
        plan: plan.kind,
        started: true,
        resumeVerified: false,
        completedNaturally: firstBurst.completedNaturally,
        stoppedForTimeout: !firstBurst.completedNaturally,
        successfulMoves: firstBurst.successfulMoves,
        totalAttempts: firstBurst.totalAttempts,
        finalScore: firstBurst.latestScore,
        errors: firstBurst.errors,
      }
    }

    const resumedPayload = await resumeGame(session, tournamentId, firstBurst.gameId)
    const secondBurst = await playBurst(session, tournamentId, resumedPayload, plan, plan.secondBurst)

    if (secondBurst.errors.length > 0 || secondBurst.completedNaturally) {
      return {
        email: session.email,
        userId: session.userId,
        plan: plan.kind,
        started: true,
        resumeVerified: true,
        completedNaturally: secondBurst.completedNaturally,
        stoppedForTimeout: !secondBurst.completedNaturally,
        successfulMoves: firstBurst.successfulMoves + secondBurst.successfulMoves,
        totalAttempts: firstBurst.totalAttempts + secondBurst.totalAttempts,
        finalScore: secondBurst.latestScore,
        errors: [...firstBurst.errors, ...secondBurst.errors],
      }
    }

    const resumedAgainPayload = await resumeGame(session, tournamentId, firstBurst.gameId)
    const finalBurst = await playBurst(session, tournamentId, resumedAgainPayload, plan, plan.finalBurst)

    return {
      email: session.email,
      userId: session.userId,
      plan: plan.kind,
      started: true,
      resumeVerified: true,
      completedNaturally: finalBurst.completedNaturally,
      stoppedForTimeout: !finalBurst.completedNaturally,
      successfulMoves:
        firstBurst.successfulMoves + secondBurst.successfulMoves + finalBurst.successfulMoves,
      totalAttempts:
        firstBurst.totalAttempts + secondBurst.totalAttempts + finalBurst.totalAttempts,
      finalScore: finalBurst.latestScore,
      errors: [...firstBurst.errors, ...secondBurst.errors, ...finalBurst.errors],
    }
  }

  const naturalRun = await playBurst(session, tournamentId, firstStart.payload, plan, plan.moveLimit)

  return {
    email: session.email,
    userId: session.userId,
    plan: plan.kind,
    started: true,
    resumeVerified: false,
    completedNaturally: naturalRun.completedNaturally,
    stoppedForTimeout: !naturalRun.completedNaturally,
    successfulMoves: naturalRun.successfulMoves,
    totalAttempts: naturalRun.totalAttempts,
    finalScore: naturalRun.latestScore,
    errors: naturalRun.errors,
  }
}

async function collectBehavioralSummary(scenario, tournament, plannedOutcomes) {
  const [
    tournamentResult,
    registrationsResult,
    gamesResult,
    leaderboardResult,
    walletResult,
  ] = await Promise.all([
    adminSupabase.from('tournaments').select('*').eq('id', tournament.id).single(),
    adminSupabase.from('registrations').select('id, user_id').eq('tournament_id', tournament.id),
    adminSupabase
      .from('games')
      .select('id, user_id, status, final_score, move_count, end_reason')
      .eq('tournament_id', tournament.id),
    adminSupabase
      .from('tournament_results')
      .select('id, user_id, rank, final_score, prize_awarded_cents')
      .eq('tournament_id', tournament.id)
      .order('rank', { ascending: true }),
    adminSupabase
      .from('wallet_transactions')
      .select('type, amount_cents, user_id, reference_type, reference_id')
      .eq('reference_id', tournament.id),
  ])

  const registrations = registrationsResult.data ?? []
  const games = gamesResult.data ?? []
  const leaderboard = leaderboardResult.data ?? []
  const walletTransactions = walletResult.data ?? []
  const tournamentRow = tournamentResult.data

  const statuses = Object.fromEntries(
    Object.entries(
      games.reduce((accumulator, game) => {
        accumulator[game.status] = (accumulator[game.status] ?? 0) + 1
        return accumulator
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  )

  const endReasons = Object.fromEntries(
    Object.entries(
      games.reduce((accumulator, game) => {
        const key = game.end_reason ?? 'null'
        accumulator[key] = (accumulator[key] ?? 0) + 1
        return accumulator
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  )

  const ticketDebits = walletTransactions.filter((transaction) => transaction.type === 'ticket_debit')
  const prizeCredits = walletTransactions.filter((transaction) => transaction.type === 'prize_credit')
  const refunds = walletTransactions.filter((transaction) => transaction.type === 'refund')

  const startedPlans = plannedOutcomes.filter((outcome) => outcome.started)
  const plannedNoShows = plannedOutcomes.filter((outcome) => outcome.plan === 'no_show').length
  const plannedResumers = plannedOutcomes.filter((outcome) => outcome.plan === 'resumer').length
  const verifiedResumes = plannedOutcomes.filter((outcome) => outcome.resumeVerified).length
  const naturalPlans = plannedOutcomes.filter((outcome) => outcome.completedNaturally).length
  const timeoutPlans = plannedOutcomes.filter((outcome) => outcome.stoppedForTimeout).length
  const actualNoMoves = games.filter((game) => game.end_reason === 'no_moves').length
  const actualTimeouts = games.filter((game) => game.end_reason === 'timeout').length

  const anomalies = []

  if (registrations.length !== scenario.playerCount) {
    anomalies.push(`registrations=${registrations.length} expected=${scenario.playerCount}`)
  }
  if (games.length !== startedPlans.length) {
    anomalies.push(`games=${games.length} expected_started=${startedPlans.length}`)
  }
  if (leaderboard.length !== startedPlans.length) {
    anomalies.push(`tournament_results=${leaderboard.length} expected_started=${startedPlans.length}`)
  }
  if (tournamentRow?.status !== 'completed') {
    anomalies.push(`estado_final=${tournamentRow?.status ?? 'null'}`)
  }
  if ((statuses.active ?? 0) > 0) {
    anomalies.push(`active_games_restantes=${statuses.active}`)
  }
  if ((statuses.invalid ?? 0) > 0) {
    anomalies.push(`invalid_games=${statuses.invalid}`)
  }
  if (actualNoMoves === 0) {
    anomalies.push('no_hubo_cierres_por_no_moves')
  }
  if (actualTimeouts === 0) {
    anomalies.push('no_hubo_cierres_por_timeout')
  }
  if (verifiedResumes < plannedResumers) {
    anomalies.push(`resume_verificados=${verifiedResumes} expected=${plannedResumers}`)
  }
  if (scenario.entryFee > 0 && ticketDebits.length !== registrations.length) {
    anomalies.push(`ticket_debits=${ticketDebits.length} expected=${registrations.length}`)
  }
  if (refunds.length > 0) {
    anomalies.push(`refunds_inesperados=${refunds.length}`)
  }

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    finalStatus: tournamentRow?.status ?? null,
    registrations: registrations.length,
    games: games.length,
    leaderboardRows: leaderboard.length,
    plannedNoShows,
    plannedNaturalClosures: naturalPlans,
    plannedTimeoutClosures: timeoutPlans,
    actualNoMoves,
    actualTimeouts,
    resumeChecks: {
      planned: plannedResumers,
      verified: verifiedResumes,
    },
    ticketDebits: ticketDebits.length,
    prizeCredits: prizeCredits.length,
    refundCount: refunds.length,
    averageScore:
      games.length > 0
        ? Math.round(games.reduce((sum, game) => sum + Number(game.final_score), 0) / games.length)
        : 0,
    topScore: games.length > 0 ? Math.max(...games.map((game) => Number(game.final_score))) : 0,
    gameStatuses: statuses,
    endReasons,
    anomalies,
  }
}

async function runScenario(adminSession, sessions, overflowSession, scenario) {
  const resolvedScenario = resolveScenarioConfig(scenario)
  const playerSessions = sessions.slice(0, resolvedScenario.playerCount)
  const plans = playerSessions.map((_, index) => assignPlan(index))
  const tournament = await createTournamentAsAdmin(adminSession.cookieJar, resolvedScenario)

  console.log(`\n[${resolvedScenario.label}] torneo creado: ${tournament.name} (${tournament.id})`)

  const openedTournament = await runCron()
  assert(
    openedTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'opened'
    ),
    `[${resolvedScenario.label}] el cron no abrió el torneo`
  )

  const registrationResults = await runPool(playerSessions, moveConcurrency, (session) =>
    registerPlayer(session, tournament.id)
  )
  const registrationFailures = registrationResults.filter((result) => !result.ok)

  const overflowAttempt = await registerPlayer(overflowSession, tournament.id)

  await adminSupabase
    .from('tournaments')
    .update({
      play_window_start: new Date(Date.now() - 60 * 1000).toISOString(),
      play_window_end: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .eq('id', tournament.id)

  const startedTournament = await runCron()
  assert(
    startedTournament.results.some(
      (result) => result.tournamentId === tournament.id && result.action === 'started'
    ),
    `[${resolvedScenario.label}] el cron no pasó el torneo a live`
  )

  const samplePlayableSession = playerSessions.find((_, index) => plans[index].kind !== 'no_show')
  if (samplePlayableSession) {
    await expectPage(`${baseUrl}/tournaments/${tournament.id}/play`, {
      cookieJar: samplePlayableSession.cookieJar,
      text: tournament.name,
    })
  }

  await expectPage(`${baseUrl}/tournaments/${tournament.id}/leaderboard`, {
    text: tournament.name,
  })
  await expectPage(`${baseUrl}/admin/tournaments/${tournament.id}/games`, {
    cookieJar: adminSession.cookieJar,
    text: tournament.name,
  })

  const outcomes = await runPool(playerSessions, moveConcurrency, (session, index) =>
    executePlan(session, tournament.id, plans[index])
  )

  await adminSupabase
    .from('tournaments')
    .update({
      play_window_end: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    .eq('id', tournament.id)

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

  await expectPage(`${baseUrl}/tournaments/${tournament.id}/leaderboard`, {
    text: tournament.name,
  })
  await expectPage(`${baseUrl}/admin/tournaments/${tournament.id}/games`, {
    cookieJar: adminSession.cookieJar,
    text: tournament.name,
  })

  const summary = await collectBehavioralSummary(resolvedScenario, tournament, outcomes)
  const erroredOutcomes = outcomes.filter((outcome) => outcome.errors.length > 0)

  const errors = []
  if (registrationFailures.length > 0) {
    errors.push(`fallaron ${registrationFailures.length} inscripciones`)
  }
  if (overflowAttempt.status !== 400 || overflowAttempt.error !== 'El torneo está lleno') {
    errors.push('overflow no fue bloqueado correctamente')
  }
  if (erroredOutcomes.length > 0) {
    errors.push(`hubo ${erroredOutcomes.length} jugadores con errores de juego`)
  }
  if (summary.anomalies.length > 0) {
    errors.push(...summary.anomalies)
  }

  console.log(
    `[${resolvedScenario.label}] regs=${summary.registrations}, games=${summary.games}, no_moves=${summary.actualNoMoves}, timeout=${summary.actualTimeouts}, resumes=${summary.resumeChecks.verified}/${summary.resumeChecks.planned}, errores=${errors.length}`
  )

  return {
    scenario: resolvedScenario.label,
    slug: resolvedScenario.slug,
    requestedPlayers: resolvedScenario.playerCount,
    registration: {
      successful: registrationResults.filter((result) => result.ok).length,
      failed: registrationFailures.length,
      failures: registrationFailures.slice(0, 10),
      overflowAttempt,
    },
    gameplay: {
      started: outcomes.filter((outcome) => outcome.started).length,
      noShows: outcomes.filter((outcome) => outcome.plan === 'no_show').length,
      naturalClosures: outcomes.filter((outcome) => outcome.completedNaturally).length,
      timeoutClosures: outcomes.filter((outcome) => outcome.stoppedForTimeout).length,
      resumeVerified: outcomes.filter((outcome) => outcome.resumeVerified).length,
      averageSuccessfulMoves:
        outcomes.length > 0
          ? Math.round(
              outcomes.reduce((sum, outcome) => sum + outcome.successfulMoves, 0) / outcomes.length
            )
          : 0,
      sampleErrors: erroredOutcomes.slice(0, 10),
    },
    summary,
    errors,
  }
}

async function main() {
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Concurrencia gameplay: ${moveConcurrency}`)
  console.log(`Concurrencia auth: ${authConcurrency}`)

  const adminSession = await signIn('admin.local.e2e@example.com')
  const maxPlayersNeeded = Math.max(...scenarios.map((scenario) => scenario.playerCount))
  const maxEntryFee = Math.max(...scenarios.map((scenario) => scenario.entryFee))
  const users = await ensureSimulationUsers(maxPlayersNeeded, maxEntryFee)
  const playerUsers = users.slice(0, maxPlayersNeeded)
  const overflowUser = users[maxPlayersNeeded]

  console.log(`Usuarios simulados preparados: ${playerUsers.length} + 1 overflow`)

  const sessions = await runPool(playerUsers, authConcurrency, (user) => signIn(user.email))
  const overflowSession = await signIn(overflowUser.email)

  const reports = []
  for (const scenario of scenarios) {
    reports.push(await runScenario(adminSession, sessions, overflowSession, scenario))
  }

  const overall = {
    generatedAt: new Date().toISOString(),
    suite: 'behavioral',
    baseUrl,
    scenarios: reports,
    anomalies: reports.flatMap((report) => report.errors.map((error) => `[${report.slug}] ${error}`)),
  }

  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `behavioral-tournament-simulation-${Date.now()}.json`)
  await fs.writeFile(outputPath, JSON.stringify(overall, null, 2))

  console.log(`\nReporte escrito en ${outputPath}`)
  for (const report of reports) {
    console.log(
      JSON.stringify(
        {
          scenario: report.scenario,
          registrations: report.registration.successful,
          games: report.summary.games,
          noMoves: report.summary.actualNoMoves,
          timeouts: report.summary.actualTimeouts,
          resumeVerified: report.summary.resumeChecks,
          errors: report.errors,
        },
        null,
        2
      )
    )
  }

  if (overall.anomalies.length > 0) {
    console.error('\nAnomalias detectadas:')
    for (const anomaly of overall.anomalies) {
      console.error(`- ${anomaly}`)
    }
    process.exit(1)
  }

  console.log('\nSimulación conductual OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

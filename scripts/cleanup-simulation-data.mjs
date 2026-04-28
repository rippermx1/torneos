import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

loadEnvConfig(rootDir)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const tournamentPrefixes = [
  'Standard pago al maximo ',
  'Freeroll al maximo ',
  'Smoke Local ',
  'Debug Sim ',
  'Behavioral ',
]

const simulationEmailPrefixes = [
  'sim.player.',
  'sim.overflow.',
  'smoke.local.',
]

function chunk(array, size) {
  const chunks = []
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size))
  }
  return chunks
}

async function deleteInBatches(table, column, values, extraFilters) {
  if (values.length === 0) return 0

  let deleted = 0
  for (const batch of chunk(values, 200)) {
    let query = supabase.from(table).delete().in(column, batch)
    if (typeof extraFilters === 'function') {
      query = extraFilters(query)
    }

    const { error } = await query
    if (error) throw error
    deleted += batch.length
  }

  return deleted
}

async function listAllAuthUsers() {
  const users = []
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) throw error

    users.push(...data.users)
    if (data.users.length < 200) break
    page += 1
  }

  return users
}

async function cleanupTournaments() {
  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id, name')

  if (error) throw error

  const targetTournaments = (tournaments ?? []).filter((tournament) =>
    tournamentPrefixes.some((prefix) => tournament.name.startsWith(prefix))
  )

  const tournamentIds = targetTournaments.map((tournament) => tournament.id)
  if (tournamentIds.length === 0) {
    return {
      tournamentIds: [],
      tournamentNames: [],
      gameIds: [],
    }
  }

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id')
    .in('tournament_id', tournamentIds)

  if (gamesError) throw gamesError

  const gameIds = (games ?? []).map((game) => game.id)

  await deleteInBatches('game_moves', 'game_id', gameIds)
  await deleteInBatches('tournament_results', 'tournament_id', tournamentIds)
  await deleteInBatches('games', 'tournament_id', tournamentIds)
  await deleteInBatches('registrations', 'tournament_id', tournamentIds)
  await deleteInBatches('disputes', 'tournament_id', tournamentIds)
  await deleteInBatches('wallet_transactions', 'reference_id', tournamentIds, (query) =>
    query.eq('reference_type', 'tournament')
  )
  await deleteInBatches('tournaments', 'id', tournamentIds)

  return {
    tournamentIds,
    tournamentNames: targetTournaments.map((tournament) => tournament.name),
    gameIds,
  }
}

async function cleanupUsers() {
  const authUsers = await listAllAuthUsers()
  const targetUsers = authUsers.filter((user) => {
    const email = user.email ?? ''
    return simulationEmailPrefixes.some((prefix) => email.startsWith(prefix))
  })

  const userIds = targetUsers.map((user) => user.id)
  if (userIds.length === 0) {
    return {
      userIds: [],
      emails: [],
      gameIds: [],
    }
  }

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id')
    .in('user_id', userIds)

  if (gamesError) throw gamesError

  const gameIds = (games ?? []).map((game) => game.id)

  await deleteInBatches('game_moves', 'game_id', gameIds)
  await deleteInBatches('tournament_results', 'user_id', userIds)
  await deleteInBatches('games', 'user_id', userIds)
  await deleteInBatches('registrations', 'user_id', userIds)
  await deleteInBatches('wallet_transactions', 'user_id', userIds)
  await deleteInBatches('withdrawal_requests', 'user_id', userIds)
  await deleteInBatches('disputes', 'user_id', userIds)
  await deleteInBatches('profiles', 'id', userIds)

  for (const user of targetUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) throw error
  }

  return {
    userIds,
    emails: targetUsers.map((user) => user.email),
    gameIds,
  }
}

async function main() {
  const tournamentCleanup = await cleanupTournaments()
  const userCleanup = await cleanupUsers()

  console.log(
    JSON.stringify(
      {
        cleanedAt: new Date().toISOString(),
        tournamentsDeleted: tournamentCleanup.tournamentIds.length,
        usersDeleted: userCleanup.userIds.length,
        sampleTournamentNames: tournamentCleanup.tournamentNames.slice(0, 10),
        sampleUserEmails: userCleanup.emails.slice(0, 10),
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

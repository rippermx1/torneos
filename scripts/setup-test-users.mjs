import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { requireNonProductionProject } from './supabase-safety.mjs'

const CURRENT_TERMS_VERSION = '1.3'

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

const targetProjectRef = requireNonProductionProject(
  supabaseUrl,
  'Creación de usuarios de prueba'
)
const password = process.env.SUPABASE_E2E_PASSWORD
if (!password) {
  console.error('Falta SUPABASE_E2E_PASSWORD; no se usan contraseñas de prueba predeterminadas.')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const fixtures = [
  {
    email: 'admin.local.e2e@example.com',
    username: 'admin_local',
    fullName: 'Admin Local',
    isAdmin: true,
    balanceTarget: 250_000,
  },
  {
    email: 'jugador1.local.e2e@example.com',
    username: 'jugador1_local',
    fullName: 'Jugador Local 1',
    isAdmin: false,
    balanceTarget: 50_000,
  },
  {
    email: 'jugador2.local.e2e@example.com',
    username: 'jugador2_local',
    fullName: 'Jugador Local 2',
    isAdmin: false,
    balanceTarget: 50_000,
  },
]

async function findUserByEmail(email) {
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) throw error

    const user = data.users.find((candidate) => candidate.email === email)
    if (user) return user
    if (data.users.length < 200) return null

    page += 1
  }
}

async function ensureUser(fixture) {
  const existingUser = await findUserByEmail(fixture.email)

  if (!existingUser) {
    const { data, error } = await supabase.auth.admin.createUser({
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

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
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

async function ensureProfile(user, fixture) {
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username: fixture.username,
    full_name: fixture.fullName,
    birth_date: '1994-01-01',
    is_admin: fixture.isAdmin,
    is_banned: false,
    kyc_status: 'approved',
    kyc_verified_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: CURRENT_TERMS_VERSION,
  })

  if (error) throw error

  const roles = [
    {
      profile_id: user.id,
      role: 'user',
      granted_by: user.id,
    },
  ]

  if (fixture.isAdmin) {
    roles.push({
      profile_id: user.id,
      role: 'admin',
      granted_by: user.id,
    })
  }

  const { error: rolesError } = await supabase
    .from('profile_roles')
    .upsert(roles, { onConflict: 'profile_id,role' })

  if (rolesError) throw rolesError
}

async function resetTestAdminMfa(user, fixture) {
  if (!fixture.isAdmin) return

  const { data, error } = await supabase.auth.admin.mfa.listFactors({
    userId: user.id,
  })
  if (error) throw error

  for (const factor of data.factors) {
    const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({
      userId: user.id,
      id: factor.id,
    })
    if (deleteError) throw deleteError
  }
}

async function ensureBalance(userId, balanceTarget) {
  const { data, error } = await supabase
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
  const { error: insertError } = await supabase
    .from('wallet_transactions')
    .insert({
      user_id: userId,
      type: 'adjustment',
      amount_cents: nextBalance - currentBalance,
      balance_after_cents: nextBalance,
      reference_type: 'fixture_topup',
      reference_id: null,
      metadata: { source: 'setup-test-users' },
    })

  if (insertError) throw insertError

  return nextBalance
}

async function main() {
  console.log(`Proyecto de pruebas confirmado: ${targetProjectRef}`)
  const rows = []

  for (const fixture of fixtures) {
    const user = await ensureUser(fixture)
    await resetTestAdminMfa(user, fixture)
    await ensureProfile(user, fixture)
    const balance = await ensureBalance(user.id, fixture.balanceTarget)

    rows.push({
      email: fixture.email,
      username: fixture.username,
      role: fixture.isAdmin ? 'admin' : 'player',
      balance_cents: balance,
      user_id: user.id,
    })
  }

  console.table(rows)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * Reset completo de la base de datos de producción.
 *
 * Borra (en orden FK-seguro):
 *   - Todas las tablas de aplicación
 *   - Todos los archivos del bucket kyc-documents
 *   - Todos los usuarios de Supabase Auth
 *
 * El schema, funciones, políticas RLS y configuración quedan intactos.
 *
 * Uso:
 *   node scripts/reset-production-db.mjs
 *
 * Lee las credenciales desde .env.local.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnvConfig(path.resolve(__dirname, '..'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Elimina todas las filas de una tabla usando un filtro que siempre matchea.
async function clearTable(table, pkCol = 'id') {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .not(pkCol, 'is', null)

  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`  ✓ ${table.padEnd(26)} ${String(count ?? '?').padStart(4)} filas`)
}

async function main() {
  console.log(`\n⚠️  Reset de producción: ${supabaseUrl}\n`)

  // ── Paso 1: Tablas de aplicación (orden FK) ──────────────────
  console.log('Paso 1 — Tablas de aplicación')
  await clearTable('game_moves')
  await clearTable('admin_actions')
  await clearTable('flow_refund_attempts')
  await clearTable('flow_payment_attempts')
  await clearTable('disputes')
  await clearTable('withdrawal_requests')
  await clearTable('tournament_results')
  await clearTable('games')
  await clearTable('registrations')
  await clearTable('wallet_transactions')
  await clearTable('profile_roles',   'profile_id')  // PK compuesto, NOT NULL
  await clearTable('kyc_audit_events')
  await clearTable('kyc_submissions')
  await clearTable('tournaments')
  await clearTable('profiles')
  await clearTable('rate_limit_buckets', 'key')       // PK text, NOT NULL

  // ── Paso 2: Storage KYC ───────────────────────────────────────
  console.log('\nPaso 2 — Storage (kyc-documents)')
  const { error: storageErr } = await supabase.storage.emptyBucket('kyc-documents')
  if (storageErr && !storageErr.message?.includes('not found')) {
    throw new Error(`kyc-documents: ${storageErr.message}`)
  }
  console.log('  ✓ kyc-documents vaciado')

  // ── Paso 3: Auth users ────────────────────────────────────────
  console.log('\nPaso 3 — Usuarios Auth')
  let deleted = 0
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    if (!data.users.length) break

    for (const user of data.users) {
      const { error: e } = await supabase.auth.admin.deleteUser(user.id)
      if (e) throw new Error(`deleteUser ${user.email}: ${e.message}`)
      deleted++
    }

    if (data.users.length < 200) break
    page++
  }
  console.log(`  ✓ ${deleted} usuario(s) eliminado(s)`)

  // ── Verificación final ────────────────────────────────────────
  console.log('\nVerificación')
  const checks = ['profiles', 'wallet_transactions', 'tournaments', 'games', 'profile_roles']
  for (const t of checks) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    const ok = count === 0 ? '✓' : '✗'
    console.log(`  ${ok} ${t.padEnd(26)} ${count}`)
  }
  const { data: authCheck } = await supabase.auth.admin.listUsers({ page: 1, perPage: 10 })
  const authCount = authCheck?.users?.length ?? '?'
  const authOk = authCount === 0 ? '✓' : '✗'
  console.log(`  ${authOk} auth.users                 ${authCount}`)

  console.log('\nDB reseteada. Ejecuta "npm run create:admin" para recrear el admin.\n')
}

main().catch((err) => {
  console.error('\nERROR:', err.message ?? err)
  process.exit(1)
})

/**
 * Crea (o actualiza) un usuario administrador en producción.
 *
 * Uso:
 *   node scripts/create-admin.mjs
 *
 * Variables de entorno requeridas (en .env.local o .env.production):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY  (o SUPABASE_SERVICE_ROLE_KEY)
 *   ADMIN_EMAIL          email del admin a crear
 *   ADMIN_PASSWORD       contraseña (mín. 8 caracteres)
 *   ADMIN_USERNAME       username visible en la plataforma
 *   ADMIN_FULL_NAME      nombre completo (opcional, default: "Administrador")
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnvConfig(path.resolve(__dirname, '..'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const email    = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
const username = process.env.ADMIN_USERNAME
const fullName = process.env.ADMIN_FULL_NAME ?? 'Administrador'

// ── Validación de entorno ────────────────────────────────────

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY.')
  process.exit(1)
}

if (!email || !password || !username) {
  console.error(
    'ERROR: Faltan variables requeridas:\n' +
    '  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME\n\n' +
    'Ejemplo:\n' +
    '  ADMIN_EMAIL=tu@email.com ADMIN_PASSWORD=MiClave123! ADMIN_USERNAME=carlosv node scripts/create-admin.mjs'
  )
  process.exit(1)
}

if (password.length < 8) {
  console.error('ERROR: ADMIN_PASSWORD debe tener al menos 8 caracteres.')
  process.exit(1)
}

// ── Cliente service_role ─────────────────────────────────────

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ──────────────────────────────────────────────────

async function findUserByEmail(targetEmail) {
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email === targetEmail)
    if (found) return found
    if (data.users.length < 200) return null
    page++
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`\nCreando admin: ${email} (${username})…\n`)

  // 1. Auth user — crear o actualizar
  let authUser = await findUserByEmail(email)

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error || !data.user) throw error ?? new Error('No se pudo crear el usuario en Auth.')
    authUser = data.user
    console.log(`✓ Usuario Auth creado  (id: ${authUser.id})`)
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { ...authUser.user_metadata, full_name: fullName },
    })
    if (error || !data.user) throw error ?? new Error('No se pudo actualizar el usuario en Auth.')
    authUser = data.user
    console.log(`✓ Usuario Auth actualizado (id: ${authUser.id})`)
  }

  // 2. Profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id:               authUser.id,
    username,
    full_name:        fullName,
    birth_date:       '1990-01-01',
    is_admin:         true,
    is_banned:        false,
    kyc_status:       'approved',
    kyc_verified_at:  new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
  })
  if (profileError) throw profileError
  console.log(`✓ Perfil upserted`)

  // 3. Roles
  const { error: rolesError } = await supabase
    .from('profile_roles')
    .upsert(
      [
        { profile_id: authUser.id, role: 'user',  granted_by: authUser.id },
        { profile_id: authUser.id, role: 'admin', granted_by: authUser.id },
      ],
      { onConflict: 'profile_id,role' }
    )
  if (rolesError) throw rolesError
  console.log(`✓ Roles asignados (user, admin)`)

  // 4. Resumen
  console.log('\n─────────────────────────────────')
  console.log('Admin listo para producción:')
  console.log(`  Email:    ${email}`)
  console.log(`  Username: ${username}`)
  console.log(`  User ID:  ${authUser.id}`)
  console.log('─────────────────────────────────\n')
}

main().catch((err) => {
  console.error('\nERROR:', err.message ?? err)
  process.exit(1)
})

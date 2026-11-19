import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { validateCloudDevelopment } from './check-cloud-development.mjs'
const config = JSON.parse(fs.readFileSync(new URL('../config/cloud-development.json', import.meta.url), 'utf8'))
validateCloudDevelopment(process.env, config)
const credentials = new URL('../.env.cloud-test-users.local', import.meta.url)
let password
if (fs.existsSync(credentials)) password = fs.readFileSync(credentials, 'utf8').match(/^SUPABASE_E2E_PASSWORD=(.+)$/m)?.[1]
if (!password) {
  password = randomBytes(24).toString('base64url') + 'aA1!'
  fs.writeFileSync(credentials, `SUPABASE_E2E_PASSWORD=${password}\nPLAYER_EMAIL=jugador.dev@example.com\nOPERATOR_EMAIL=operador.dev@example.com\n`)
}
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: users, error: listError } = await client.auth.admin.listUsers({ perPage: 1000 })
if (listError) throw listError
const report = []
for (const [email, username, admin] of [['jugador.dev@example.com', 'jugador_dev', false], ['operador.dev@example.com', 'operador_dev', true]]) {
  let user = users.users.find(candidate => candidate.email === email)
  if (!user) {
    const result = await client.auth.admin.createUser({ email, password, email_confirm: true })
    if (result.error || !result.data.user) throw result.error ?? new Error('No se pudo crear cuenta de prueba')
    user = result.data.user
    const { error } = await client.from('profiles').upsert({ id: user.id, username, full_name: `Prueba ${username}`, birth_date: '1994-01-01', is_admin: admin, is_banned: false, terms_version: '1.3', terms_accepted_at: new Date().toISOString() })
    if (error) throw error
    const roles = (admin ? ['user', 'admin'] : ['user']).map(role => ({ profile_id: user.id, role, granted_by: user.id }))
    const { error: roleError } = await client.from('profile_roles').upsert(roles, { onConflict: 'profile_id,role' })
    if (roleError) throw roleError
  }
  const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await browser.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`No se pudo autenticar ${email}`)
  const { data: ownProfile, error: profileError } = await browser.from('profiles').select('id,username').eq('id', user.id).single()
  if (profileError || ownProfile?.username !== username) throw new Error('No se pudo leer el perfil propio con RLS')
  await browser.auth.signOut()
  report.push({ email, userId: user.id, admin, authenticated: true, profileRls: true })
}
const result = { projectRef: config.supabaseProjectRef, accounts: report, credentialsFile: '.env.cloud-test-users.local', syntheticWalletFunds: false, kycApproval: false }
fs.writeFileSync(new URL('../artifacts/cloud-development/auth-smoke.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))

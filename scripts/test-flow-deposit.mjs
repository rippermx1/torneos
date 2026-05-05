// ───────────────────────────────────────────────────────────────
// Smoke test manual del flujo de recarga vía Flow sandbox.
//
// Uso:
//   node scripts/test-flow-deposit.mjs <user_id> [amount_clp]
//
// El script:
//   1. Lee credenciales Flow del .env.local
//   2. Crea un payment via API de Flow (NO via app, para aislar el problema)
//   3. Imprime la URL de checkout para que pagues manualmente
//   4. Polea getStatus hasta status=2 (pagado)
//   5. Imprime la respuesta final
//
// Tarjeta de prueba CL: 4051885600446623, cvv 123, banco rut 11.111.111-1, clave 123
// ───────────────────────────────────────────────────────────────

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
const __filename = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(__filename), '..')
loadEnvConfig(rootDir)

const apiKey = process.env.FLOW_API_KEY ?? process.env['FLOW_APÏ_KEY']
const secret = process.env.FLOW_API_SECRET
const base = process.env.FLOW_API_BASE ?? 'https://sandbox.flow.cl/api'
const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.torneosplay.cl').replace(/\/+$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!apiKey || !secret) {
  console.error('Faltan FLOW_API_KEY y FLOW_API_SECRET en .env.local')
  process.exit(1)
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const userId = process.argv[2] ?? 'test-user'
const amountClp = parseInt(process.argv[3] ?? '1000', 10)
const createOnly = process.argv.includes('--create-only')

if (!Number.isInteger(amountClp) || amountClp < 1000) {
  console.error('Monto inválido (neto en pesos enteros, >= 1000)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

const FLOW_CARD_NEXT_DAY_FEE_RATE = 0.0319
const PLATFORM_FEE_NET_SHARE = 1 / 1.19
const USER_FEE_RATE =
  FLOW_CARD_NEXT_DAY_FEE_RATE / (PLATFORM_FEE_NET_SHARE - FLOW_CARD_NEXT_DAY_FEE_RATE)
const USER_FEE_MIN_CENTS = 15000

function computeDepositBreakdown(netCents) {
  const rawFee = Math.ceil(netCents * USER_FEE_RATE)
  const userFeeCents = Math.max(USER_FEE_MIN_CENTS, rawFee)
  const chargedCents = Math.ceil((netCents + userFeeCents) / 100) * 100
  return {
    netCents,
    chargedCents,
    userFeeCents: chargedCents - netCents,
    chargedPesos: chargedCents / 100,
  }
}

function buildSignString(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && k !== 's')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
}

function sign(params) {
  return createHmac('sha256', secret).update(buildSignString(params)).digest('hex')
}

async function flowPost(endpoint, params) {
  const full = { ...params, apiKey }
  full.s = sign(full)
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(full)) {
    if (v !== undefined && v !== null) body.append(k, String(v))
  }
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST ${endpoint} ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function flowGet(endpoint, params) {
  const full = { ...params, apiKey }
  full.s = sign(full)
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(full)) {
    if (v !== undefined && v !== null) search.append(k, String(v))
  }
  const res = await fetch(`${base}${endpoint}?${search.toString()}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${endpoint} ${res.status}: ${text}`)
  return JSON.parse(text)
}

const STATUS = { 1: 'PENDIENTE', 2: 'PAGADO', 3: 'RECHAZADO', 4: 'ANULADO' }

async function postWebhook(token) {
  const res = await fetch(`${appUrl}/api/webhooks/flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${text}`)
  return text
}

async function countDepositTransactions(token) {
  const { count, error } = await supabase
    .from('wallet_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'deposit')
    .eq('metadata->>flow_token', token)

  if (error) throw new Error(`Error consultando wallet_transactions: ${error.message}`)
  return count ?? 0
}

async function main() {
  const commerceOrder = `smoke-${randomUUID()}`
  const breakdown = computeDepositBreakdown(amountClp * 100)

  console.log(`🚀 Creando attempt y pago Flow sandbox`)
  console.log(`   commerceOrder: ${commerceOrder}`)
  console.log(`   neto wallet: $${amountClp.toLocaleString('es-CL')} CLP`)
  console.log(`   cobro Flow: $${breakdown.chargedPesos.toLocaleString('es-CL')} CLP`)

  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
  if (authError || !authUser?.user) {
    throw new Error(`Usuario no encontrado en Supabase Auth: ${authError?.message ?? userId}`)
  }

  const { data: attempt, error: attemptError } = await supabase
    .from('flow_payment_attempts')
    .insert({
      user_id: userId,
      commerce_order: commerceOrder,
      net_amount_cents: breakdown.netCents,
      charged_amount_cents: breakdown.chargedCents,
      user_fee_cents: breakdown.userFeeCents,
      status: 'pending',
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    throw new Error(`No se pudo crear flow_payment_attempt: ${attemptError?.message ?? 'sin data'}`)
  }

  let created
  try {
    created = await flowPost('/payment/create', {
      commerceOrder,
      subject: 'Test sandbox — recarga billetera',
      currency: 'CLP',
      amount: breakdown.chargedPesos,
      email: authUser.user.email ?? 'test@torneosplay.cl',
      paymentMethod: 9,
      urlConfirmation: `${appUrl}/api/webhooks/flow`,
      urlReturn: `${appUrl}/api/wallet/deposit/flow/return`,
      optional: JSON.stringify({ user_id: userId, net_cents: String(breakdown.netCents) }),
      timeout: 600,
    })
  } catch (err) {
    await supabase
      .from('flow_payment_attempts')
      .update({ status: 'rejected', settled_at: new Date().toISOString() })
      .eq('id', attempt.id)
    throw err
  }

  const { error: updateError } = await supabase
    .from('flow_payment_attempts')
    .update({
      flow_token: created.token,
      flow_order: created.flowOrder,
    })
    .eq('id', attempt.id)

  if (updateError) {
    throw new Error(`No se pudo guardar flow_token: ${updateError.message}`)
  }

  console.log()
  console.log(`✓ Pago creado. flowOrder=${created.flowOrder}`)
  console.log()
  console.log(`👉 Abre esta URL en el browser y paga con la tarjeta de prueba:`)
  console.log(`   ${created.url}?token=${created.token}`)
  console.log()
  console.log(`   Tarjeta: 4051885600446623   CVV: 123   Vencimiento: cualquiera`)
  console.log(`   Banco rut: 11.111.111-1     Clave: 123`)
  console.log()

  if (createOnly) {
    console.log('Modo create-only: paga la URL y luego verifica el webhook/wallet en Supabase.')
    process.exit(0)
  }

  console.log(`⏳ Polling de estado cada 5s (Ctrl+C para abortar)...`)
  console.log()

  const startedAt = Date.now()
  const maxWaitMs = 5 * 60 * 1000
  let last = null

  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      const status = await flowGet('/payment/getStatus', { token: created.token })
      const code = status.status
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      if (code !== last) {
        console.log(`[${elapsed}s] status=${code} (${STATUS[code] ?? '?'})`)
        last = code
      }
      if (code !== 1) {
        console.log()
        console.log('Respuesta final de Flow:')
        console.log(JSON.stringify(status, null, 2))

        if (code !== 2) process.exit(1)

        console.log()
        console.log('🔁 Invocando webhook para validar acreditación e idempotencia...')
        await postWebhook(created.token)
        await postWebhook(created.token)

        const { data: settledAttempt, error: settledError } = await supabase
          .from('flow_payment_attempts')
          .select('status, settled_at')
          .eq('id', attempt.id)
          .single()

        if (settledError) throw new Error(`Error consultando attempt final: ${settledError.message}`)
        if (settledAttempt.status !== 'paid') {
          throw new Error(`Attempt no quedó paid; status=${settledAttempt.status}`)
        }

        const depositCount = await countDepositTransactions(created.token)
        if (depositCount !== 1) {
          throw new Error(`Idempotencia falló: se esperaban 1 deposit, hay ${depositCount}`)
        }

        console.log('✓ attempt paid, wallet deposit único, idempotencia OK')
        process.exit(0)
      }
    } catch (err) {
      console.error(`Error consultando estado:`, err.message)
    }
  }

  console.log('⏰ Timeout alcanzado sin pago. Abortar.')
  process.exit(1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

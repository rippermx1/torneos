// Smoke test manual del checkout Flow de inscripcion directa a torneo.
//
// Uso:
//   node scripts/test-flow-tournament-checkout.mjs <tournament_id> <user_id> [--create-only]
//
// Crea un flow_payment_attempt intent=tournament_registration, abre un pago
// Flow sandbox/produccion segun FLOW_API_BASE, y tras el pago invoca el webhook
// dos veces para verificar settlement e idempotencia.

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
const tournamentId = process.argv[2]
const userId = process.argv[3]
const createOnly = process.argv.includes('--create-only')

if (!apiKey || !secret) {
  console.error('Faltan FLOW_API_KEY y FLOW_API_SECRET en .env.local')
  process.exit(1)
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

if (!tournamentId || !userId) {
  console.error('Uso: node scripts/test-flow-tournament-checkout.mjs <tournament_id> <user_id> [--create-only]')
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

function computeFlowBreakdown(netCents) {
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
    .filter((key) => params[key] !== undefined && params[key] !== null && key !== 's')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
}

function sign(params) {
  return createHmac('sha256', secret).update(buildSignString(params)).digest('hex')
}

async function flowPost(endpoint, params) {
  const full = { ...params, apiKey }
  full.s = sign(full)
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(full)) {
    if (value !== undefined && value !== null) body.append(key, String(value))
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
  for (const [key, value] of Object.entries(full)) {
    if (value !== undefined && value !== null) search.append(key, String(value))
  }

  const res = await fetch(`${base}${endpoint}?${search.toString()}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${endpoint} ${res.status}: ${text}`)
  return JSON.parse(text)
}

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

async function assertSingleRegistration() {
  const { count, error } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)

  if (error) throw new Error(`Error consultando registrations: ${error.message}`)
  if (count !== 1) throw new Error(`Idempotencia fallo: registrations=${count}, esperado=1`)
}

async function main() {
  const [{ data: authUser, error: authError }, { data: tournament, error: tournamentError }] =
    await Promise.all([
      supabase.auth.admin.getUserById(userId),
      supabase
        .from('tournaments')
        .select('id, name, entry_fee_cents')
        .eq('id', tournamentId)
        .single(),
    ])

  if (authError || !authUser?.user) {
    throw new Error(`Usuario no encontrado en Supabase Auth: ${authError?.message ?? userId}`)
  }
  if (tournamentError || !tournament) {
    throw new Error(`Torneo no encontrado: ${tournamentError?.message ?? tournamentId}`)
  }
  if (tournament.entry_fee_cents <= 0) {
    throw new Error('El smoke de Flow requiere un torneo pagado; para freeroll usa smoke:local.')
  }

  const commerceOrder = `smoke-tour-${randomUUID()}`
  const breakdown = computeFlowBreakdown(tournament.entry_fee_cents)

  console.log(`Creando pago Flow para torneo: ${tournament.name}`)
  console.log(`commerceOrder: ${commerceOrder}`)
  console.log(`entrada: $${(breakdown.netCents / 100).toLocaleString('es-CL')} CLP`)
  console.log(`cobro Flow: $${breakdown.chargedPesos.toLocaleString('es-CL')} CLP`)

  const { data: attempt, error: attemptError } = await supabase
    .from('flow_payment_attempts')
    .insert({
      user_id: userId,
      tournament_id: tournamentId,
      commerce_order: commerceOrder,
      net_amount_cents: breakdown.netCents,
      charged_amount_cents: breakdown.chargedCents,
      user_fee_cents: breakdown.userFeeCents,
      status: 'pending',
      intent: 'tournament_registration',
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
      subject: `Inscripcion torneo - ${tournament.name}`,
      currency: 'CLP',
      amount: breakdown.chargedPesos,
      email: authUser.user.email ?? 'test@torneosplay.cl',
      paymentMethod: 9,
      urlConfirmation: `${appUrl}/api/webhooks/flow`,
      urlReturn: `${appUrl}/tournaments/${tournamentId}/return`,
      optional: JSON.stringify({
        user_id: userId,
        tournament_id: tournamentId,
        entry_fee_cents: String(breakdown.netCents),
      }),
      timeout: 1800,
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
  console.log(`Pago creado. flowOrder=${created.flowOrder}`)
  console.log(`${created.url}?token=${created.token}`)
  console.log()

  if (createOnly) {
    console.log('Modo create-only: paga la URL y espera el webhook real de Flow.')
    process.exit(0)
  }

  const startedAt = Date.now()
  const maxWaitMs = 5 * 60 * 1000
  let lastStatus = null

  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const status = await flowGet('/payment/getStatus', { token: created.token })

    if (status.status !== lastStatus) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      console.log(`[${elapsed}s] status=${status.status}`)
      lastStatus = status.status
    }

    if (status.status !== 1) {
      if (status.status !== 2) {
        throw new Error(`Pago no aprobado; status=${status.status}`)
      }

      await postWebhook(created.token)
      await postWebhook(created.token)

      const { data: settledAttempt, error: settledError } = await supabase
        .from('flow_payment_attempts')
        .select('status, settled_at')
        .eq('id', attempt.id)
        .single()

      if (settledError) throw new Error(`Error consultando attempt final: ${settledError.message}`)
      if (settledAttempt.status !== 'paid') {
        throw new Error(`Attempt no quedo paid; status=${settledAttempt.status}`)
      }

      await assertSingleRegistration()
      console.log('OK: attempt paid, registration unica, webhook idempotente.')
      process.exit(0)
    }
  }

  throw new Error('Timeout alcanzado sin pago.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})

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

const { loadEnvConfig } = nextEnv
const __filename = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(__filename), '..')
loadEnvConfig(rootDir)

const apiKey = process.env.FLOW_API_KEY ?? process.env['FLOW_APÏ_KEY']
const secret = process.env.FLOW_API_SECRET
const base = process.env.FLOW_API_BASE ?? 'https://sandbox.flow.cl/api'

if (!apiKey || !secret) {
  console.error('Faltan FLOW_API_KEY y FLOW_API_SECRET en .env.local')
  process.exit(1)
}

const userId = process.argv[2] ?? 'test-user'
const amountClp = parseInt(process.argv[3] ?? '1000', 10)

if (!Number.isInteger(amountClp) || amountClp < 100) {
  console.error('Monto inválido (en pesos enteros, >= 100)')
  process.exit(1)
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

async function main() {
  const commerceOrder = `smoke-${randomUUID()}`
  console.log(`🚀 Creando pago Flow sandbox`)
  console.log(`   commerceOrder: ${commerceOrder}`)
  console.log(`   monto: $${amountClp.toLocaleString('es-CL')} CLP`)

  const created = await flowPost('/payment/create', {
    commerceOrder,
    subject: 'Test sandbox — recarga billetera',
    currency: 'CLP',
    amount: amountClp,
    email: 'test@torneosplay.cl',
    paymentMethod: 9,
    urlConfirmation: 'https://www.torneosplay.cl/api/webhooks/flow',
    urlReturn: 'https://www.torneosplay.cl/wallet?deposit=flow_return',
    optional: JSON.stringify({ user_id: userId }),
    timeout: 600,
  })

  console.log()
  console.log(`✓ Pago creado. flowOrder=${created.flowOrder}`)
  console.log()
  console.log(`👉 Abre esta URL en el browser y paga con la tarjeta de prueba:`)
  console.log(`   ${created.url}?token=${created.token}`)
  console.log()
  console.log(`   Tarjeta: 4051885600446623   CVV: 123   Vencimiento: cualquiera`)
  console.log(`   Banco rut: 11.111.111-1     Clave: 123`)
  console.log()
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
        process.exit(code === 2 ? 0 : 1)
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

// One canonical accounting snapshot; no sampled tables or obsolete split model.
import fs from 'node:fs/promises'
import path from 'node:path'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
const root = path.resolve(import.meta.dirname, '..')
nextEnv.loadEnvConfig(root)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan credenciales de Supabase del servidor.')
const period = process.env.BUSINESS_REPORT_PERIOD ?? new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago',year:'numeric',month:'2-digit'}).format(new Date())
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('BUSINESS_REPORT_PERIOD debe ser AAAA-MM.')
const client = createClient(url,key,{auth:{persistSession:false}})
const { data, error } = await client.rpc('accounting_workspace',{p_period:period})
if (error) throw new Error(`No se pudo leer contabilidad: ${error.message}`)
const pack = data
const report = {generatedAt:pack.generated_at,period,source:'accounting_workspace: journal completo + gastos generales',
  companyResultCents:pack.result_cents,bankClosingCents:pack.bank_closing_cents,flowPendingCents:pack.flow_closing_cents,
  controls:pack.controls,lines:pack.lines.length,closes:pack.closes,
  notes:['Resultado incluye provisiones pendientes; no representa validación de demanda ni rentabilidad futura.','La revisión bancaria y tributaria requiere documentos externos y cierre aprobado.'],package:pack}
const output = process.env.BUSINESS_REPORT_OUTPUT_DIR ?? path.join(root,'artifacts/accounting')
await fs.mkdir(output,{recursive:true})
const file = path.join(output,`business-report-${period}-${Date.now()}.json`)
await fs.writeFile(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({file,period,companyResultCents:report.companyResultCents,controls:report.controls},null,2))

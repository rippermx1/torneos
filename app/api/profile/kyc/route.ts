import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import {
  isKycDocumentType,
  isOwnKycDocumentPath,
  isValidRut,
  samePersonName,
  sameRut,
} from '@/lib/identity/verification'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import { sendKycReceivedEmail } from '@/lib/email/kyc-notifications'

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user', 'admin', 'owner'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `profile:kyc:${userId}:${getRequestIp(req)}`,
    limit: 5,
    windowMs: 60 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: {
    full_name?: string
    rut?: string
    birth_date?: string
    phone?: string
    city?: string
    document_type?: string
    document_number?: string
    document_front_path?: string
    document_back_path?: string | null
    bank_account_holder?: string
    bank_account_rut?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const {
    full_name,
    rut,
    birth_date,
    phone,
    city,
    document_type,
    document_number,
    document_front_path,
    document_back_path,
    bank_account_holder,
    bank_account_rut,
  } = body

  if (!rut?.trim())        return Response.json({ error: 'RUT obligatorio' }, { status: 400 })
  if (!isValidRut(rut))    return Response.json({ error: 'RUT inválido' }, { status: 400 })
  if (!full_name?.trim())  return Response.json({ error: 'Nombre obligatorio' }, { status: 400 })
  if (!birth_date)         return Response.json({ error: 'Fecha de nacimiento obligatoria' }, { status: 400 })
  if (!phone?.trim())      return Response.json({ error: 'Teléfono obligatorio' }, { status: 400 })
  if (!city?.trim())       return Response.json({ error: 'Ciudad obligatoria' }, { status: 400 })
  if (!isKycDocumentType(document_type)) {
    return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }
  if (!document_number?.trim()) {
    return Response.json({ error: 'Número de documento obligatorio' }, { status: 400 })
  }
  if (!isOwnKycDocumentPath(document_front_path, userId)) {
    return Response.json({ error: 'Documento frontal obligatorio o inválido' }, { status: 400 })
  }
  if (document_type === 'cedula_chilena' && !isOwnKycDocumentPath(document_back_path, userId)) {
    return Response.json({ error: 'Documento reverso obligatorio para cédula chilena' }, { status: 400 })
  }
  if (document_back_path && !isOwnKycDocumentPath(document_back_path, userId)) {
    return Response.json({ error: 'Documento reverso inválido' }, { status: 400 })
  }
  if (!bank_account_holder?.trim()) {
    return Response.json({ error: 'Titular bancario obligatorio' }, { status: 400 })
  }
  if (!bank_account_rut?.trim()) {
    return Response.json({ error: 'RUT de titular bancario obligatorio' }, { status: 400 })
  }
  if (!isValidRut(bank_account_rut)) {
    return Response.json({ error: 'RUT de titular bancario inválido' }, { status: 400 })
  }

  // A7: el RUT y nombre del titular bancario deben coincidir con el solicitante.
  // Antes esto se chequeaba solo al solicitar retiro; aplicarlo en KYC bloquea
  // datos inconsistentes desde el primer momento (defensa AML/PLA).
  if (!sameRut(rut, bank_account_rut)) {
    return Response.json(
      { error: 'El RUT del titular bancario debe coincidir con tu RUT verificado.' },
      { status: 400 }
    )
  }
  if (!samePersonName(full_name, bank_account_holder)) {
    return Response.json(
      { error: 'El nombre del titular bancario debe coincidir con tu nombre completo verificado.' },
      { status: 400 }
    )
  }

  // Validar mayoría de edad (18 años)
  const birth = new Date(birth_date)
  if (Number.isNaN(birth.getTime())) {
    return Response.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
  }
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 18)
  if (birth > cutoff) {
    return Response.json({ error: 'Debes ser mayor de 18 años para participar.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('kyc_status')
    .eq('id', userId)
    .single()

  if (!currentProfile) {
    return Response.json({ error: 'Perfil no encontrado' }, { status: 404 })
  }

  if (currentProfile.kyc_status === 'approved') {
    return Response.json(
      { error: 'Tu KYC ya está aprobado. Contacta soporte para cambiar datos verificados.' },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: full_name.trim(),
      rut: rut.trim(),
      birth_date,
      phone: phone.trim(),
      city: city.trim(),
      // Solo pasar a pending si no estaba approved (no revertir una aprobación ya dada)
      kyc_status: 'pending',
      kyc_verified_at: null,
    })
    .eq('id', userId)
    .neq('kyc_status', 'approved') // guard: no degradar un approved

  if (error) {
    // A7: detectar colision de RUT entre cuentas. La constraint UNIQUE en
    // profiles.rut previene fraude por multi-account, pero el error generico
    // de Postgres ("duplicate key value violates unique constraint") confunde
    // al usuario. Surfaceamos un mensaje claro y un 409.
    if (error.code === '23505' && /rut/i.test(error.message)) {
      return Response.json(
        {
          error:
            'Ya existe una cuenta verificada con este RUT. Contacta soporte si crees que es un error.',
        },
        { status: 409 }
      )
    }
    return Response.json({ error: `Error guardando datos: ${error.message}` }, { status: 500 })
  }

  const { data: submission, error: submissionError } = await supabase
    .from('kyc_submissions')
    .insert({
      user_id: userId,
      full_name: full_name.trim(),
      rut: rut.trim(),
      birth_date,
      phone: phone.trim(),
      city: city.trim(),
      document_type,
      document_number: document_number.trim(),
      document_front_path: document_front_path.trim(),
      document_back_path: document_back_path?.trim() || null,
      bank_account_holder: bank_account_holder.trim(),
      bank_account_rut: bank_account_rut.trim(),
    })
    .select('id')
    .single()

  if (submissionError || !submission) {
    return Response.json(
      { error: `Error guardando evidencia KYC: ${submissionError?.message ?? 'sin respuesta'}` },
      { status: 500 }
    )
  }

  await supabase
    .from('kyc_audit_events')
    .insert({
      user_id: userId,
      actor_id: userId,
      event_type: 'submitted',
      metadata: { submission_id: submission.id },
    })
    .then(({ error: auditError }) => {
      if (auditError) console.error('KYC audit insert failed', auditError)
    })

  after(async () => {
    try {
      const email = auth.access.user.email
      const username = auth.access.user.user_metadata?.username ?? full_name.trim()
      if (email) {
        await sendKycReceivedEmail({ to: email, username })
      }
    } catch (e) {
      console.error('[kyc] Error enviando email de recepción:', e)
    }
  })

  return Response.json({ ok: true })
}

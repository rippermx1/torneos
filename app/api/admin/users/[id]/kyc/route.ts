import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  isValidRut,
  samePersonName,
  sameRut,
} from '@/lib/identity/verification'
import type { KycSubmission, Profile } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: adminProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminProfile?.is_admin) return Response.json({ error: 'Acceso denegado' }, { status: 403 })

  const { id: targetUserId } = await params

  let body: { action: 'approve' | 'reject'; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!['approve', 'reject'].includes(body.action)) {
    return Response.json({ error: 'Acción inválida' }, { status: 400 })
  }

  // Verificar que el usuario objetivo existe y tiene los datos requeridos para KYC
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, kyc_status, birth_date, rut, full_name')
    .eq('id', targetUserId)
    .single()

  if (!profile) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const { data: submissionRows } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .limit(1)

  const latestSubmission = (submissionRows?.[0] ?? null) as KycSubmission | null
  const reviewNotes = body.notes?.trim() || null

  // Para aprobar KYC es obligatorio tener birth_date, RUT y nombre completo.
  // Sin estos datos y evidencia documental no se puede verificar mayoría de edad,
  // identidad ni titularidad bancaria.
  if (body.action === 'approve') {
    const missingFields: string[] = []
    if (!profile.birth_date) missingFields.push('fecha de nacimiento')
    if (!profile.rut)        missingFields.push('RUT')
    if (!profile.full_name)  missingFields.push('nombre completo')
    if (!latestSubmission)   missingFields.push('solicitud KYC documental')
    if (latestSubmission) {
      if (!latestSubmission.document_type) missingFields.push('tipo de documento')
      if (!latestSubmission.document_number) missingFields.push('número de documento')
      if (!latestSubmission.document_front_path) missingFields.push('documento frontal')
      if (latestSubmission.document_type === 'cedula_chilena' && !latestSubmission.document_back_path) {
        missingFields.push('documento reverso')
      }
      if (!latestSubmission.bank_account_holder) missingFields.push('titular bancario')
      if (!latestSubmission.bank_account_rut) missingFields.push('RUT titular bancario')
    }
    if (missingFields.length > 0) {
      return Response.json(
        { error: `No se puede aprobar KYC: faltan campos obligatorios: ${missingFields.join(', ')}.` },
        { status: 422 }
      )
    }

    // Verificar mayoría de edad (18+) en el momento de la aprobación
    const birthDate = new Date(profile.birth_date!)
    const now = new Date()
    let age = now.getFullYear() - birthDate.getFullYear()
    const m = now.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--
    if (age < 18) {
      return Response.json(
        { error: `No se puede aprobar KYC: el usuario tiene ${age} años (mínimo 18).` },
        { status: 422 }
      )
    }

    if (!isValidRut(profile.rut)) {
      return Response.json({ error: 'No se puede aprobar KYC: RUT inválido.' }, { status: 422 })
    }

    if (!isValidRut(latestSubmission!.bank_account_rut)) {
      return Response.json(
        { error: 'No se puede aprobar KYC: RUT del titular bancario inválido.' },
        { status: 422 }
      )
    }

    if (!sameRut(profile.rut, latestSubmission!.rut)) {
      return Response.json(
        { error: 'No se puede aprobar KYC: el RUT del perfil no coincide con la solicitud documental.' },
        { status: 422 }
      )
    }

    if (!sameRut(profile.rut, latestSubmission!.bank_account_rut)) {
      return Response.json(
        { error: 'No se puede aprobar KYC: el RUT bancario no coincide con la identidad verificada.' },
        { status: 422 }
      )
    }

    if (!samePersonName(profile.full_name, latestSubmission!.bank_account_holder)) {
      return Response.json(
        { error: 'No se puede aprobar KYC: el titular bancario no coincide con el nombre verificado.' },
        { status: 422 }
      )
    }
  }

  const newStatus: Profile['kyc_status'] = body.action === 'approve' ? 'approved' : 'rejected'

  const { error } = await supabase
    .from('profiles')
    .update({
      kyc_status: newStatus,
      kyc_verified_at: body.action === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', targetUserId)

  if (error) {
    return Response.json({ error: `Error actualizando KYC: ${error.message}` }, { status: 500 })
  }

  if (latestSubmission) {
    const { error: submissionError } = await supabase
      .from('kyc_submissions')
      .update({
        status: newStatus,
        review_notes: reviewNotes,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', latestSubmission.id)

    if (submissionError) {
      return Response.json(
        { error: `KYC actualizado, pero falló la actualización de evidencia: ${submissionError.message}` },
        { status: 500 }
      )
    }
  }

  await supabase
    .from('kyc_audit_events')
    .insert({
      user_id: targetUserId,
      actor_id: user.id,
      event_type: body.action === 'approve' ? 'approved' : 'rejected',
      metadata: {
        submission_id: latestSubmission?.id ?? null,
        notes: reviewNotes,
      },
    })
    .then(({ error: auditError }) => {
      if (auditError) console.error('KYC audit insert failed', auditError)
    })

  return Response.json({ ok: true, status: newStatus })
}

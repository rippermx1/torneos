import { redirect } from 'next/navigation'
import { requireAnyRole, requireAnyRoleForApi, type AuthAccess } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import {
  getAdminMfaRedirect,
  type AdminMfaPolicyState,
} from '@/lib/supabase/admin-mfa-policy'

export type AdminMfaState = AdminMfaPolicyState

export async function getAdminMfaState(): Promise<AdminMfaState> {
  const supabase = await createClient()
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

  if (factorsError || !factors) {
    throw new Error(`No fue posible consultar los factores MFA: ${factorsError?.message ?? 'sin datos'}`)
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (assuranceError || !assurance) {
    throw new Error(
      `No fue posible verificar el nivel MFA: ${assuranceError?.message ?? 'sin datos'}`,
    )
  }

  return {
    currentLevel: assurance.currentLevel,
    verifiedTotpFactorIds: factors.totp.map((factor) => factor.id),
  }
}

export async function requireAdminMfa(): Promise<AuthAccess> {
  const access = await requireAnyRole(['admin', 'owner'])
  const state = await getAdminMfaState()
  const mfaRedirect = getAdminMfaRedirect(state)

  if (mfaRedirect) redirect(mfaRedirect)

  return access
}

export async function requireAdminMfaForApi() {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth

  try {
    const state = await getAdminMfaState()
    const mfaUrl = getAdminMfaRedirect(state)

    if (mfaUrl) {
      return {
        ok: false as const,
        response: Response.json(
          {
            error: 'Se requiere verificación en dos pasos para continuar.',
            mfaRequired: true,
            mfaUrl,
          },
          { status: 403 },
        ),
      }
    }
  } catch (error) {
    console.error('[auth] admin MFA verification failed', {
      userId: auth.access.userId,
      message: error instanceof Error ? error.message : 'Error desconocido',
    })

    return {
      ok: false as const,
      response: Response.json(
        { error: 'No fue posible verificar la seguridad de la sesión.' },
        { status: 503 },
      ),
    }
  }

  return auth
}

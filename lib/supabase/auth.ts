import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export const APP_ROLES = ['user', 'admin', 'owner'] as const
export type AppRole = (typeof APP_ROLES)[number]

export type AppPermission =
  | 'user:access'
  | 'wallet:manage'
  | 'tournament:play'
  | 'profile:manage'
  | 'admin:access'
  | 'admin:manage_tournaments'
  | 'admin:review_users'
  | 'admin:manage_payments'
  | 'admin:view_reports'
  | 'owner:manage_roles'

const ROLE_PERMISSIONS: Record<AppRole, readonly AppPermission[]> = {
  user: ['user:access', 'wallet:manage', 'tournament:play', 'profile:manage'],
  admin: [
    'admin:access',
    'admin:manage_tournaments',
    'admin:review_users',
    'admin:manage_payments',
    'admin:view_reports',
  ],
  owner: [
    'admin:access',
    'admin:manage_tournaments',
    'admin:review_users',
    'admin:manage_payments',
    'admin:view_reports',
    'owner:manage_roles',
  ],
}

export interface AuthAccess {
  user: User
  userId: string
  roles: AppRole[]
  permissions: AppPermission[]
  isUser: boolean
  isAdmin: boolean
  isOwner: boolean
}

type ApiAuthResult =
  | { ok: true; access: AuthAccess }
  | { ok: false; response: Response }

function normalizeRole(role: unknown): AppRole | null {
  return typeof role === 'string' && APP_ROLES.includes(role as AppRole)
    ? (role as AppRole)
    : null
}

function buildPermissions(roles: readonly AppRole[]): AppPermission[] {
  const permissions = new Set<AppPermission>()
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission)
    }
  }
  return [...permissions]
}

export function hasRole(access: AuthAccess, role: AppRole): boolean {
  if (role === 'admin') {
    return access.roles.includes('admin') || access.roles.includes('owner')
  }
  return access.roles.includes(role)
}

export function hasAnyRole(access: AuthAccess, roles: readonly AppRole[]): boolean {
  return roles.some((role) => hasRole(access, role))
}

export function hasPermission(access: AuthAccess, permission: AppPermission): boolean {
  return access.permissions.includes(permission)
}

function buildAccess(user: User, roles: AppRole[]): AuthAccess {
  const uniqueRoles = [...new Set(roles)]
  return {
    user,
    userId: user.id,
    roles: uniqueRoles,
    permissions: buildPermissions(uniqueRoles),
    isUser: uniqueRoles.includes('user'),
    isAdmin: uniqueRoles.includes('admin') || uniqueRoles.includes('owner'),
    isOwner: uniqueRoles.includes('owner'),
  }
}

/**
 * Devuelve el usuario autenticado o null si no hay sesión.
 * Usar en Server Components y Route Handlers.
 */
export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Devuelve usuario + roles del perfil actual.
 * Los roles se leen server-side con service_role; nunca desde metadata editable.
 */
export async function getCurrentAccess(): Promise<AuthAccess | null> {
  const user = await getUser()
  if (!user) return null

  const supabase = createAdminClient()
  const { data: roleRows, error } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('profile_id', user.id)

  if (error) {
    // Fallback operativo mientras se aplica la migracion en un entorno.
    // No concede admin salvo que el campo historico is_admin ya exista.
    console.error('[auth] profile_roles lookup failed', {
      userId: user.id,
      code: error.code,
      message: error.message,
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    return buildAccess(user, profile?.is_admin ? ['user', 'admin'] : ['user'])
  }

  const roles = (roleRows ?? [])
    .map((row) => normalizeRole(row.role))
    .filter((role): role is AppRole => role !== null)

  return buildAccess(user, roles)
}

/**
 * Igual que getUser() pero redirige a /sign-in si no hay sesión.
 * Para Server Components y Route Handlers que requieren auth.
 */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/sign-in')
  return user
}

/**
 * Exige que la cuenta tenga rol user. Un admin sin rol user queda confinado
 * al panel administrativo.
 */
export async function requireUserRole(): Promise<AuthAccess> {
  const access = await getCurrentAccess()
  if (!access) redirect('/sign-in')

  if (!hasRole(access, 'user')) {
    if (hasRole(access, 'admin')) redirect('/admin')
    redirect('/')
  }

  // Bloquea usuarios que no han verificado su email.
  // Los admin/owner se omiten porque son cuentas internas de confianza.
  // Los usuarios OAuth (Google) tienen email_confirmed_at ya seteado por el proveedor.
  if (!access.isAdmin && !access.user.email_confirmed_at) {
    redirect('/verify-email')
  }

  return access
}

/**
 * Exige cualquiera de los roles dados en Server Components o Server Actions.
 */
export async function requireAnyRole(
  roles: readonly AppRole[],
  options: { deniedRedirectTo?: string } = {},
): Promise<AuthAccess> {
  const access = await getCurrentAccess()
  if (!access) redirect('/sign-in')
  if (!hasAnyRole(access, roles)) redirect(options.deniedRedirectTo ?? '/')
  return access
}

/**
 * Variante para Route Handlers: retorna JSON 401/403, no redirects HTML.
 */
export async function requireAnyRoleForApi(
  roles: readonly AppRole[],
): Promise<ApiAuthResult> {
  const access = await getCurrentAccess()
  if (!access) {
    return {
      ok: false,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
    }
  }

  if (!hasAnyRole(access, roles)) {
    return {
      ok: false,
      response: Response.json({ error: 'Sin permisos suficientes' }, { status: 403 }),
    }
  }

  // Misma restricción de email que requireUserRole(), pero solo en rutas de
  // usuario puro (no en rutas admin/owner que usan roles de confianza interna).
  const isUserOnlyRoute = roles.every((r) => r === 'user')
  if (isUserOnlyRoute && !access.isAdmin && !access.user.email_confirmed_at) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Debes verificar tu email antes de continuar.', emailNotConfirmed: true },
        { status: 403 },
      ),
    }
  }

  return { ok: true, access }
}

/**
 * Verifica si el usuario autenticado tiene rol admin u owner.
 * Usar para proteger rutas/endpoints de admin.
 */
export async function requireAdmin(): Promise<string> {
  const access = await requireAnyRole(['admin', 'owner'])
  return access.userId
}

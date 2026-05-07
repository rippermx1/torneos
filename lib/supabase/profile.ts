import { createAdminClient } from '@/lib/supabase/server'

type AuthLikeUser = {
  id: string
  user_metadata?: Record<string, unknown> | null
}

function getDefaultUsername(userId: string) {
  return `user_${userId.replaceAll('-', '').slice(0, 8)}`
}

function getFullName(user: AuthLikeUser) {
  const metadata = user.user_metadata ?? {}

  const fullNameCandidate =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null

  const fullName = fullNameCandidate?.trim()
  return fullName ? fullName : null
}

export async function ensureProfileExists(user: AuthLikeUser) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        username: getDefaultUsername(user.id),
        full_name: getFullName(user),
      },
      {
        onConflict: 'id',
        ignoreDuplicates: true,
      }
    )

  if (error) {
    throw error
  }

  const { error: roleError } = await supabase
    .from('profile_roles')
    .upsert(
      {
        profile_id: user.id,
        role: 'user',
      },
      {
        onConflict: 'profile_id,role',
        ignoreDuplicates: true,
      }
    )

  if (roleError) {
    throw roleError
  }
}

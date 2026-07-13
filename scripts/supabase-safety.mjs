const KNOWN_PRODUCTION_PROJECT_REFS = new Set([
  'baeylvoipmazcthnwxmz',
])

export function getSupabaseProjectRef(supabaseUrl) {
  let url

  try {
    url = new URL(supabaseUrl)
  } catch {
    throw new Error('La URL de Supabase no es válida; operación bloqueada.')
  }

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return 'local'
  }

  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)
  if (!match) {
    throw new Error(
      `No se pudo identificar el proyecto Supabase desde ${url.hostname}; operación bloqueada.`
    )
  }

  return match[1]
}

function protectedProjectRefs(env) {
  const refs = new Set(KNOWN_PRODUCTION_PROJECT_REFS)
  if (env.PRODUCTION_SUPABASE_PROJECT_REF) {
    refs.add(env.PRODUCTION_SUPABASE_PROJECT_REF)
  }
  return refs
}

export function requireExplicitProjectTarget(supabaseUrl, operation, env = process.env) {
  const projectRef = getSupabaseProjectRef(supabaseUrl)

  if (env.CONFIRM_SUPABASE_PROJECT_REF !== projectRef) {
    throw new Error(
      `${operation} bloqueado. Define CONFIRM_SUPABASE_PROJECT_REF=${projectRef} para confirmar el proyecto destino.`
    )
  }

  return projectRef
}

export function requireNonProductionProject(supabaseUrl, operation, env = process.env) {
  const projectRef = getSupabaseProjectRef(supabaseUrl)

  if (protectedProjectRefs(env).has(projectRef)) {
    throw new Error(
      `${operation} bloqueado: ${projectRef} es un proyecto productivo. Usa un proyecto separado para pruebas.`
    )
  }

  return requireExplicitProjectTarget(supabaseUrl, operation, env)
}

export function requireDestructiveReset(supabaseUrl, env = process.env) {
  const projectRef = requireExplicitProjectTarget(
    supabaseUrl,
    'Reset total de Supabase',
    env
  )
  const expected = `DELETE_ALL_DATA_${projectRef}`

  if (env.CONFIRM_SUPABASE_RESET !== expected) {
    throw new Error(
      `Reset total bloqueado. Define CONFIRM_SUPABASE_RESET=${expected} para confirmar el borrado irreversible.`
    )
  }

  return projectRef
}

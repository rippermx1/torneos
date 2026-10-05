export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    const { assertEnvironment } = await import('./lib/config/validate.mjs')
    // next.config.env inlines this public-only snapshot even for absent aliases.
    // The environment object passed separately contains the actual runtime injection.
    const snapshot = process.env.TORNEOS_BUILD_PUBLIC_CONFIG
    if (!snapshot) throw new Error('Artefacto sin configuración pública congelada; reconstruir')
    assertEnvironment(process.env, { builtPublic: JSON.parse(snapshot) })
  }
}

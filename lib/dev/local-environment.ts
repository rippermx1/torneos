// A local feature cannot be enabled solely by a boolean in a public environment.
export function isLocalEnvironment(env = process.env): boolean {
  if (env.TORNEOS_LOCAL_MODE !== '1') return false
  try {
    const app = new URL(env.APP_URL ?? '')
    const database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    const server = new URL(env.SUPABASE_SERVER_URL ?? database.origin)
    return app.protocol === 'http:' && database.protocol === 'http:' &&
      server.protocol === 'http:' &&
      (['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'].includes(server.hostname) ||
        (server.hostname === 'supabase_kong_torneos' && server.port === '8000')) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  } catch { return false }
}

// Local container previews use HTTP. Public hosts continue upgrading to HTTPS.
export function buildAppCsp(nonce: string, options: { development: boolean; appUrl?: string; supabaseUrl?: string }) {
  let localHttp = false
  try {
    const url = new URL(options.appUrl ?? '')
    localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch { /* Missing/invalid canonical URL retains HTTPS protection. */ }
  const supabase = options.supabaseUrl ?? ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${options.development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // React game sizing and component positions use style attributes.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabase.replace(/^http/, 'ws')}`.trim(),
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(localHttp || options.development ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

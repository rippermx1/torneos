// The temporary phone probe can expose only anonymous practice and public assets.
export function allowedPath(pathname) {
  try { pathname = decodeURIComponent(pathname) } catch { return false }
  if (pathname === '/play') return true
  if (/^\/_next\/static\/[A-Za-z0-9_./()\[\]-]+$/.test(pathname) && !pathname.includes('..')) return true
  return /^\/games\/2048\/unity-2048-007\/(index\.html|build-manifest\.json|Build\/unity-2048-007\.(loader\.js|framework\.js\.gz|data\.gz|wasm\.gz))$/.test(pathname)
}

export function privateHost(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return host === '127.0.0.1' || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
}

export function instrumentHtml(markup, script, csp = '') {
  const nonce = /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(csp)?.[1]
  const attribute = nonce ? ` nonce="${nonce}"` : ''
  return markup.replace(/<body([^>]*)>/, `<body$1><script src="${script}"${attribute}></script>`)
}

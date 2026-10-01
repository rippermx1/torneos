import { describe, expect, it } from 'vitest'
import { buildAppCsp } from '../csp'

describe('container CSP', () => {
  it.each(['http://127.0.0.1:3081', 'http://localhost:3081', 'http://[::1]:3081'])('allows a local HTTP preview at %s', appUrl => {
    const csp = buildAppCsp('test-nonce', { development: false, appUrl })
    expect(csp).not.toContain('upgrade-insecure-requests')
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("style-src 'self' 'nonce-test-nonce'; style-src-attr 'unsafe-inline'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
  it.each([undefined, 'invalid', 'https://www.torneosplay.cl', 'http://www.torneosplay.cl', 'http://localhost.attacker.example', 'http://192.168.1.4:3081'])('retains HTTPS protection with canonical URL %s', appUrl => {
    expect(buildAppCsp('nonce', { development: false, appUrl })).toContain('upgrade-insecure-requests')
  })
  it('preserves configured Supabase connect origins including local fixtures', () => {
    const csp = buildAppCsp('nonce', { development: false, supabaseUrl: 'http://host.docker.internal:59999' })
    expect(csp).toContain("connect-src 'self' http://host.docker.internal:59999 ws://host.docker.internal:59999")
  })
})

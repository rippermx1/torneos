import { describe, expect, it } from 'vitest'
import { allowedPath, privateHost, instrumentHtml } from '../scripts/2048-device-probe/policy.mjs'

describe('practice-only phone probe boundaries', () => {
  it('uses the upstream nonce without relaxing its strict CSP', () => {
    expect(instrumentHtml('<body class="app"><main>Game</main></body>', '/probe/client.js', "script-src 'self' 'nonce-abc123==' 'strict-dynamic'"))
      .toBe('<body class="app"><script src="/probe/client.js" nonce="abc123=="></script><main>Game</main></body>')
  })
  it.each(['/play', '/_next/static/chunks/main.js', '/_next/static/chunks/app/(public)/play/page.js', '/_next/static/chunks/app/%28public%29/play/page.js', '/_next/static/css/game.css', '/games/2048/unity-2048-007/Build/unity-2048-007.wasm.gz'])('allows public practice resources: %s', path => {
    expect(allowedPath(path)).toBe(true)
  })
  it.each(['/api/tournaments/1/game/start', '/api/dev/flow', '/sign-in', '/admin', '/tournaments', '/games/snake-arena/index.html', '/_next/static/../../.env', '/_next/static/%2e%2e/.env', '/_next/static/%252e%252e/.env', '/_next/static/%ZZ', '/games/2048/unity-2048-007/../../.env'])('does not expose unrelated or private paths: %s', path => {
    expect(allowedPath(path)).toBe(false)
  })
  it.each(['127.0.0.1', '192.168.1.4', '10.0.0.4', '172.31.1.2'])('allows an explicit private bind: %s', host => {
    expect(privateHost(host)).toBe(true)
  })
  it.each(['0.0.0.0', '8.8.8.8', '172.32.1.1', '192.168.999.1', 'localhost', '192.168.1.4.example.com'])('rejects an unspecified or public bind: %s', host => {
    expect(privateHost(host)).toBe(false)
  })
})

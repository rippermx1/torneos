import { afterEach, describe, expect, it, vi } from 'vitest'
import definition from '../config/2048-free-release.json'
import { FREE_2048_RELEASE, canonicalFree2048Path, getFree2048TournamentId, isFree2048MoneyPathBlocked } from '@/lib/release/free-2048'

afterEach(() => vi.unstubAllEnvs())

describe('fixed 2048 free release', () => {
  it('has one immutable profile with no activation flag or runtime money option', () => {
    expect(definition).toEqual({ version: 1, profile: '2048-free-v1', rewarded: 'demo', ticket: 'informational_unavailable', money: 'blocked' })
    expect(FREE_2048_RELEASE).toEqual(definition)
    expect(Object.isFrozen(FREE_2048_RELEASE)).toBe(true)
    expect(Reflect.set(FREE_2048_RELEASE, 'money', 'enabled')).toBe(false)
    vi.stubEnv('ENABLE_REAL_MONEY', 'true')
    expect(FREE_2048_RELEASE.money).toBe('blocked')
    expect(isFree2048MoneyPathBlocked('/api/wallet/deposit/flow/create', 'POST')).toBe(true)
  })

  it.each(['/wallet', '/wallet/withdraw', '/api/wallet/deposit/flow/return', '/api/wallet/deposit/flow/status',
    '/tournaments/event/checkout', '/api/tournaments/event/checkout/flow/create', '/api/webhooks/flow/refund',
    '/admin/payouts', '/api/admin/payouts/event/complete', '/admin/refunds', '/api/admin/refunds/event/retry',
    '/admin/payments', '/api/admin/payments/event/reverify', '/admin/users/user/wallet', '/api/admin/users/user/wallet',
    '/api/payouts/event/receipt', '/api/local-flow/payment/create', '/dev/flow/payment',
    '/api/cron/process-tournaments', '/api/cron/flow-reconcile', '/api/cron/reconcile-refunds'])(
    'denies every method for monetary surface %s', pathname => {
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        expect(isFree2048MoneyPathBlocked(pathname, method), method).toBe(true)
      }
    })

  it.each(['/wallet/', '/wallet///', '/%77allet', '/api/%77allet/deposit', '/%61pi%2Fwallet/deposit',
    '/api/%2577allet/deposit', '/api/%252577allet/deposit', '/API/WALLET/deposit', '/api\\wallet\\withdraw',
    '/api/x/../wallet/deposit', '/api/%2E/wallet/deposit', '/api/tournaments/event/%63heckout/flow/create/',
    '/api/admin/%70ayouts/event/approve/'])(
    'canonicalizes denial paths without rewriting authorization: %s', pathname => {
      expect(isFree2048MoneyPathBlocked(pathname, 'OPTIONS')).toBe(true)
    })

  it.each(['/api/%', '/api/%GG/wallet', '/api/%C0%AFwallet', '/api/%00wallet', '/api/%3Fwallet',
    '/api/%25252525252525252577allet', 'https://other.test/wallet'])(
    'fails closed for ambiguous or malformed paths: %s', pathname => {
      expect(canonicalFree2048Path(pathname)).toBeNull()
      expect(isFree2048MoneyPathBlocked(pathname, 'POST')).toBe(true)
    })

  it.each(['/admin/accounting', '/api/admin/accounting', '/api/admin/accounting/balances.csv/'])(
    'retains accounting reads but rejects all nonread methods including preflight: %s', pathname => {
      for (const method of ['GET', 'HEAD']) expect(isFree2048MoneyPathBlocked(pathname, method)).toBe(false)
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) expect(isFree2048MoneyPathBlocked(pathname, method)).toBe(true)
    })

  it.each(['/api/tournaments/event/register', '/api/tournaments/event/game/start/', '/api/tournaments/event/game/move',
    '/api/tournaments/event/game/timeout', '/api/admin/tournaments/event/cancel', '/api/admin/tournaments/event/finalize',
    '/api/admin/tournaments/event/integrity', '/api/%74ournaments/event/%67ame/start'])(
    'classifies indirect financial effects for a governed tournament read: %s', pathname => {
      expect(getFree2048TournamentId(pathname)).toBe('event')
    })
  it.each(['/api/tournaments/event/leaderboard', '/api/admin/tournaments', '/admin/tournaments/new',
    '/api/tournaments/event/games', '/api/admin/reports/2048-community', '/api/%GG/game'])('does not classify unrelated path %s', pathname => {
    expect(getFree2048TournamentId(pathname)).toBeNull()
  })

  it.each(['/play', '/play/2048/ticket', '/api/2048/daily', '/api/2048/activity', '/api/game/practice/start',
    '/api/tournaments/event/register', '/api/tournaments/event/game/start', '/api/tournaments/event/game/move',
    '/api/tournaments/event/game/timeout', '/api/tournaments/event/leaderboard', '/api/admin/tournaments',
    '/admin/tournaments/new', '/api/admin/reports/2048-retention', '/api/admin/reports/2048-community',
    '/api/admin/reports/finance.csv', '/api/admin/reports/accounting.csv', '/api/admin/reports/payouts.csv',
    '/admin/reports/2048-trial/operations', '/api/cron/report-failure', '/api/cron/watchdog',
    '/sign-in', '/sign-up', '/auth/callback', '/admin/mfa/challenge', '/api/support/dispute',
    '/api/profile/update', '/api/profile/accept-terms', '/api/wallet-history', '/api/webhooks/flow-extra'])(
    'does not widen the money denial to free, account, support or report route %s', pathname => {
      expect(isFree2048MoneyPathBlocked(pathname, 'POST')).toBe(false)
    })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encrypt, decrypt } from '../scripts/rm13-recovery-lib.mjs'
import { workerCanStart, workerDeadline } from '@/lib/ops/worker-budget'

afterEach(() => vi.useRealTimers())
describe('RM13 private backup envelopes', () => {
  it('recovers exact bytes, including binary Storage content', () => {
    const data = randomBytes(8192), key = randomBytes(32)
    expect(decrypt(encrypt(data, key, 'storage/fixture.pdf'), key, 'storage/fixture.pdf')).toEqual(data)
  })
  it('rejects truncation, corruption, wrong key and renamed backup sections', () => {
    const key = randomBytes(32), sealed = encrypt(Buffer.from('auth fixture'), key, 'auth')
    const corrupt = Buffer.from(sealed); corrupt[corrupt.length - 1] ^= 1
    for (const [bytes, k, label] of [[sealed.subarray(0, 40), key, 'auth'], [corrupt, key, 'auth'], [sealed, randomBytes(32), 'auth'], [sealed, key, 'public']]) {
      expect(() => decrypt(bytes as Buffer, k as Buffer, label as string)).toThrow()
    }
  })
})
describe('RM13 serverless worker budget', () => {
  it('leaves room for the bounded provider call and persistence, without starting another unit at the deadline', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const deadline = workerDeadline()
    expect(deadline).toBe(36_000)
    vi.setSystemTime(deadline - 1); expect(workerCanStart(deadline)).toBe(true)
    vi.setSystemTime(deadline); expect(workerCanStart(deadline)).toBe(false)
  })
})

import {describe, expect, it} from 'vitest'
import {FACTORY_BUILD, FACTORY_CHANNEL, formatMilli, readFactoryIntent, toFactoryView, toFactoryFeedback, type FactoryResult} from '../factory-empire'
import {referenceCookie, referenceTarget} from '../factory-reference-proxy'
import {ReliableCommands} from '../factory-reference/core/reliable-commands'
import type {Command, CommandResult} from '../factory-reference/contracts'
describe('Factory transport boundary', () => {
  it('shows extraction rewards only for a server-accepted click, using exact server yield', () => {
    const result = {state: {click_yield_milli: '9000000000000000000'}, accepted_clicks: 0} as FactoryResult
    expect(toFactoryFeedback(result, {kind: 'mine', clicks: 1})).toBeNull()
    result.accepted_clicks = 1
    expect(toFactoryFeedback(result, {kind: 'mine', clicks: 1})).toEqual({kind: 'mine', label: '+9.000.000.000.000.000 Ferrite'})
    result.accepted_clicks = undefined
    expect(toFactoryFeedback(result, {kind: 'mine', clicks: 1})).toBeNull()
  })
  it('formats large exact amounts without a float roundtrip', () => {expect(formatMilli('9000000000000000000')).toBe('9.000.000.000.000.000'); expect(formatMilli(15230)).toBe('15,23')})
  it('rejects negative and unsafe amounts', () => {for (const n of [-1, NaN, Infinity, 9000000000000000000, '-10']) expect(() => formatMilli(n)).toThrow()})
  it('accepts only versioned intents, never a client balance', () => {
    expect(readFactoryIntent({channel: FACTORY_CHANNEL, version: 1, build: FACTORY_BUILD, type: 'mine'})).toBe('mine')
    for (const data of [{channel: FACTORY_CHANNEL, version: 1, build: 'old', type: 'mine'}, {channel: FACTORY_CHANNEL, version: 1, build: FACTORY_BUILD, type: 'set_balance'}, null]) expect(readFactoryIntent(data)).toBeNull()
  })
  it('maps affordability using exact server quotes', () => {
    const result: FactoryResult = {state: {revision: 1, server_time_ms: 1, balance_version: '1.7.0', planet: 'Nereida-7', balance_milli: '14999', rate_milli_per_second: 200, click_yield_milli: 1000, click_upgrade_cost_milli: null, offline_cap_ms: 21600000, machines: [{id: 'drone', name: 'Dron', description: 'Recolecta', owned: 0, max_owned: 250, cost_milli: 15000, rate_milli_per_second: 200}, {id: 'drill', name: 'Taladro', description: 'Perfora', owned: 0, max_owned: 250, cost_milli: 120000, rate_milli_per_second: 2000}]}, offline: {elapsed_ms: 0, credited_ms: 0, earned_milli: 0, capped: false}}
    expect(toFactoryView(result).droneCanBuy).toBe(false)
    result.state.balance_milli = 15000; expect(toFactoryView(result).droneCanBuy).toBe(true)
    expect(toFactoryView(result).upgradeCanBuy).toBe(false)
    result.state.balance_milli = '9000000000000000000'
    result.state.machines[0].cost_milli = '1234567890123456789012345'
    expect(toFactoryView(result).droneCost).toBe('1.234.567.890.123.456.789.012,345')
    expect(toFactoryView(result).droneCanBuy).toBe(false)
  })
  it('proxy allows only reference paths and a development loopback target', () => {
    expect(referenceTarget('auth/guest', 'POST', 'development')?.href).toBe('http://127.0.0.1:8220/api/v1/auth/guest')
    for (const [path, method, env, url] of [['auth/guest', 'POST', 'production', undefined], ['auth/register', 'POST', 'development', undefined], ['games/factory-empire/commands', 'GET', 'development', undefined], ['auth/guest', 'POST', 'development', 'https://example.com'], ['auth/guest', 'POST', 'development', 'http://user:password@localhost:8220']]) expect(referenceTarget(path!, method!, env, url)).toBeNull()
  })
  it('isolates reference session from commercial cookies', () => {expect(referenceCookie('supabase=x; fe_session=secret; other=y')).toBe(''); expect(referenceCookie('other=x; fe_unity_session=abcdefghijklmnopqrstuv; extra=y')).toBe('fe_session=abcdefghijklmnopqrstuv')})
})
describe('Reference reliable commands reused by Unity host', () => {
  it('recovers the same UUID after a lost response and reload', async () => {
    const entries = new Map<string, string>()
    const storage = {getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => {entries.set(key, value)}, removeItem: (key: string) => {entries.delete(key)}}
    let received: Command | undefined
    const initial = new ReliableCommands('test-player', storage, async command => {received = command; throw new Error('connection lost')})
    await expect(initial.submit({kind: 'buy_machine', machine_id: 'drone'})).rejects.toThrow('connection lost')
    const recovery = new ReliableCommands('test-player', storage, async command => {expect(command).toEqual(received); return {} as CommandResult})
    await recovery.retry(); expect(entries.size).toBe(0)
  })
  it('does not send a purchase when its retry identifier cannot be stored', async () => {
    let sent = false
    const queue = new ReliableCommands('test-player', {getItem: () => null, setItem: () => {throw new Error('storage unavailable')}, removeItem: () => {}}, async () => {sent = true; return {} as CommandResult})
    await expect(queue.submit({kind: 'buy_machine', machine_id: 'drone'})).rejects.toThrow()
    expect(sent).toBe(false)
  })
})

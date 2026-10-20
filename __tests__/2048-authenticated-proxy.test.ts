import { expect, it } from 'vitest'
import { qa2048Hosts, validateQa2048Request, parseQa2048Activity, qa2048ResponseHeaders } from '../scripts/2048-authenticated-qa-proxy.mjs'

const hosts=qa2048Hosts('11111111-1111-4111-8111-111111111111',3099)
const request=(patch={})=>({host:hosts.A,origin:`http://${hosts.A}`,site:'same-origin',method:'POST',url:'/api/2048/activity',...patch})
it('isolates A and B by hostname rather than only by port',()=>{
  expect(hosts.A).not.toBe(hosts.B);expect(hosts.A).toMatch(/\.localhost:3099$/)
  expect(qa2048Hosts('22222222-2222-4222-8222-222222222222',3099).A).not.toBe(hosts.A)
})
it.each([0,80,65536,3099.5])('rejects invalid QA port %s',port=>{expect(()=>qa2048Hosts('11111111-1111-4111-8111-111111111111',port)).toThrow()})
it('allows only a same-origin activity submission to the fixed QA host',()=>{
  expect(validateQa2048Request(request(),hosts)).toEqual({label:'A',pathname:'/api/2048/activity',search:''})
  expect(validateQa2048Request(request({host:hosts.B,origin:`http://${hosts.B}`}),hosts).label).toBe('B')
})
it.each([
  {host:'torneos-dev.vercel.app'}, {host:'attacker.invalid'}, {origin:'https://attacker.invalid'},
  {origin:undefined}, {site:'cross-site'}, {site:undefined}, {url:'https://attacker.invalid/api/2048/activity'},
  {url:'/api/payments'}, {url:'/api/registrations'}, {url:'/sign-in'}, {method:'DELETE'},
])('rejects untrusted or commercial writes before any origin translation: %j',patch=>{
  expect(()=>validateQa2048Request(request(patch),hosts)).toThrow()
})
it('restricts read requests and accepts only the shipped 2048 build',()=>{
  expect(validateQa2048Request(request({method:'GET',origin:undefined,site:'none',url:'/play?test=read'}),hosts)).toMatchObject({pathname:'/play',search:'?test=read'})
  expect(validateQa2048Request(request({method:'GET',url:'/games/2048/unity-2048-007/index.html'}),hosts).label).toBe('A')
  for(const url of ['/api/admin/reports/2048-retention','/api/payments','/profile','/games/snake-arena/current/index.html'])
    expect(()=>validateQa2048Request(request({method:'GET',url}),hosts)).toThrow()
})
it('captures only the existing mode body, rejecting identities, dates and oversized payloads',()=>{
  expect(parseQa2048Activity(Buffer.from('{"mode":"practice"}'))).toBe('practice')
  expect(parseQa2048Activity(Buffer.from('{"mode":"daily"}'))).toBe('daily')
  for(const body of ['{"mode":"tournament"}','{"mode":"practice","userId":"another"}','{"mode":"daily","day":"2020-01-01"}','null','[]',' '.repeat(257)])
    expect(()=>parseQa2048Activity(Buffer.from(body))).toThrow()
  expect(()=>parseQa2048Activity(Buffer.from([0xff]))).toThrow()
})
it('keeps redirects inside the isolated QA origin and refuses an external destination',()=>{
  expect(qa2048ResponseHeaders({location:'https://torneos-dev.vercel.app/play'},hosts.A).location).toBe(`http://${hosts.A}/play`)
  expect(()=>qa2048ResponseHeaders({location:'https://untrusted.invalid/collect'},hosts.A)).toThrow()
})
it('preserves CSP nonce and all non-transport directives without changing source bytes',()=>{
  const headers=qa2048ResponseHeaders({'content-security-policy':"default-src 'self'; script-src 'nonce-qa'; upgrade-insecure-requests; frame-ancestors 'self'",'content-encoding':'gzip'},hosts.A)
  expect(headers['content-security-policy']).toBe("default-src 'self'; script-src 'nonce-qa'; frame-ancestors 'self'")
  expect(headers['content-encoding']).toBe('gzip');expect(headers['cache-control']).toBe('private, no-store')
})
it('preserves only project cookie chunks as host-local QA cookies',()=>{
  const values=qa2048ResponseHeaders({'set-cookie':[
    'sb-jnoyjewsqbooqaiighcs-auth-token.0=opaque; Path=/; Domain=torneos-dev.vercel.app; Secure; SameSite=Lax',
    'sb-jnoyjewsqbooqaiighcs-auth-token.1=second; Path=/; Secure',
    'another-project=unrelated; Path=/',
  ]},hosts.A)['set-cookie']
  expect(values).toHaveLength(2);expect(values.join(';')).not.toMatch(/Domain=|;\s*Secure\b|another-project/)
  expect(values[0]).toContain('SameSite=Lax')
})

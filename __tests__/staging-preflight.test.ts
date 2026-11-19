import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { assessCatalog, assessCandidate, catalogSql, functions, guardedTables, privateTables, triggers, validateTarget, verifiedMigrationVersions } from '../scripts/staging-preflight.mjs'
import { classifyRead, probeIdentity } from '../scripts/staging-auth-preflight.mjs'

const now = Date.parse('2026-10-05T20:00:00Z')
const fixture = () => ({ schema: 1, observed_at: '2026-10-05T19:00:00Z', versions: ['001','20261005175927'],
  tables: guardedTables.map((name: string) => ({ name, rls: true, browser_write: false, browser_read: !privateTables.includes(name), service_read: true })),
  functions: functions.map(([name,args]: string[]) => ({ name,args,definer: true, settings: ['search_path=""'], anon_execute: false, authenticated_execute: false, service_execute: true })),
  triggers: triggers.map(([table,name]: string[]) => ({ table,name,enabled: 'O' })),
  private_buckets: ['kyc-documents','payout-proofs','cash-proofs'].map(id => ({ id,public: false })), seed_readable_anon: false,seed_readable_authenticated: false,
})
describe('RM12 live catalog checks cannot substitute for financial E2E', () => {
  it('requires both canonical filename and exact SQL hash to credit MCP timestamps', () => {
    const file='20261005175927_cash.sql',digest='a'.repeat(64)
    const row={version:'20261006100000',name:file.slice(0,-4),sql_sha256:digest}
    const catalog={versions:[row.version],migration_records:[row]}
    expect(verifiedMigrationVersions(catalog,[file],{[file]:digest})).toContain(file.slice(0,14))
    expect(verifiedMigrationVersions(catalog,[file],{[file]:'b'.repeat(64)})).not.toContain(file.slice(0,14))
    expect(verifiedMigrationVersions({...catalog,migration_records:[row,row]},[file],{[file]:digest})).not.toContain(file.slice(0,14))
    expect(verifiedMigrationVersions({...catalog,versions:[]},[file],{[file]:digest})).not.toContain(file.slice(0,14))
  })
  it('accepts only the selected catalog scope, including legacy migration history', () => {
    const result = assessCatalog(fixture(),['20261005175927_cash.sql'],now)
    expect(result.status).toBe('PASS'); expect(result.scope).toContain('not SQL equivalence')
  })
  it.each(['missing-migration','column-write','private-read','seed','rls','wrong-rpc','rpc-grant','old-overload','search-path','disabled-trigger','public-bucket','missing-bucket','stale','missing-field'])('rejects %s despite migration history', change => {
    const input = fixture()
    if (change === 'missing-migration') input.versions = ['001']
    if (change === 'column-write') input.tables[0].browser_write = true
    if (change === 'private-read') input.tables.find((row: {name: string}) => row.name === 'financial_holds')!.browser_read = true
    if (change === 'seed') input.seed_readable_authenticated = true
    if (change === 'rls') input.tables[0].rls = false
    if (change === 'wrong-rpc') input.functions[0].args = 'uuid'
    if (change === 'rpc-grant') input.functions[0].authenticated_execute = true
    if (change === 'old-overload') input.functions.push({ ...input.functions[0],args: 'uuid',anon_execute: true })
    if (change === 'search-path') input.functions[0].settings = ['search_path=public']
    if (change === 'disabled-trigger') input.triggers[0].enabled = 'D'
    if (change === 'public-bucket') input.private_buckets[0].public = true
    if (change === 'missing-bucket') input.private_buckets.pop()
    if (change === 'stale') input.observed_at = '2026-10-03T19:00:00Z'
    if (change === 'missing-field') delete (input as Partial<typeof input>).seed_readable_anon
    expect(assessCatalog(input,['20261005175927_cash.sql'],now).status).toBe('BLOCKED')
  })
  it('emits catalog reads inside a read-only transaction, never DDL or a financial RPC call', () => {
    const sql = catalogSql()
    expect(sql.startsWith('BEGIN READ ONLY;')).toBe(true); expect(sql.endsWith('ROLLBACK;\n')).toBe(true)
    expect(sql).toContain('has_column_privilege'); expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE public|ALTER TABLE|CREATE TABLE)\b/)
  })
  it('blocks production DB reuse and credential-bearing/noncanonical callback origins', () => {
    const target = { projectRef:'abcdefghijklmnopqrst',productionRef:'zyxwvutsrqponmlkjihg',appUrl:'https://staging.example.org' }
    expect(validateTarget(target)).toBe(target.appUrl)
    expect(() => validateTarget({ ...target,productionRef: target.projectRef })).toThrow()
    for (const appUrl of ['http://staging.example.org','https://user:secret@staging.example.org','https://staging.example.org?token=private','https://staging.example.org/prefix']) expect(() => validateTarget({ ...target,appUrl })).toThrow()
    expect(assessCandidate({ dirty:false,revision:'a'.repeat(40),release_fingerprint:'b'.repeat(64),source:[],public_build:{environment:'staging'} },target,[]).status).toBe('BLOCKED')
  })
  it('rejects frozen target and fingerprint drift on a structurally complete fixture', () => {
    const sha = (s: string) => createHash('sha256').update(s).digest('hex')
    const target = { projectRef:'abcdefghijklmnopqrst',productionRef:'zyxwvutsrqponmlkjihg',appUrl:'https://staging.example.org' }
    const source = [{file:'app/page.tsx',sha256:sha('unit-only')}]
    const inputs = { source,games:[{game:'2048'}],migrations:[{file:'unit-only.sql'}],public_build:{environment:'staging',app_origin_sha256:sha(target.appUrl),values:{NEXT_PUBLIC_SUPABASE_URL:{sha256:sha(`https://${target.projectRef}.supabase.co`)}}} }
    const source_fingerprint = sha(JSON.stringify(inputs)),application = [{file:'.next/BUILD_ID'}]
    const manifest = { ...inputs,source_fingerprint,application,dirty:false,revision:'a'.repeat(40),release_fingerprint:sha(JSON.stringify({source_fingerprint,application})) }
    expect(assessCandidate(manifest,target,source).status).toBe('PASS')
    expect(assessCandidate({ ...manifest,release_fingerprint:'b'.repeat(64) },target,source).status).toBe('BLOCKED')
    expect(assessCandidate(manifest,{ ...target,appUrl:'https://other.example.org' },source).status).toBe('BLOCKED')
  })
})

describe('RM12 Auth probe preserves sessions and does not serialize user/provider data', () => {
  it('classifies bodyless HEAD failures by HTTP status without interpreting 404 as permitted', () => {
    expect(classifyRead({status:404,error:null})).toBe('BLOCKED')
    expect(classifyRead({status:403,error:null})).toBe('DENIED')
    expect(classifyRead({status:401,error:null})).toBe('BLOCKED')
    expect(classifyRead({status:200,error:null})).toBe('UNEXPECTED_ACCESS')
  })
  const client = () => ({ auth: {
    signInWithPassword: vi.fn().mockResolvedValue({data:{user:{id:'private-user-id'}},error:null}),
    getUser: vi.fn().mockResolvedValue({data:{user:{id:'private-user-id'}},error:null}),
    signOut: vi.fn().mockResolvedValue({error:null}),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({data:{currentLevel:'aal1',nextLevel:'aal2'},error:null}),listFactors:vi.fn().mockResolvedValue({data:{all:[{status:'verified',secret:'private-factor'}]},error:null}) },
  }, from:vi.fn().mockReturnValue({select:vi.fn().mockReturnValue({limit:vi.fn().mockResolvedValue({error:{code:'42501',message:'private-provider-data'}})})}) })
  it('uses server getUser and trusted roles, leaves MFA pending, and signs out only its own session', async () => {
    const api = client(),roles = vi.fn().mockResolvedValue(['admin'])
    const result = await probeIdentity(api,{email:'private@email.example',password:'private-password'},'operator',roles)
    expect(result.identity).toBe('PASS'); expect(result.role).toBe('PASS'); expect(result.mfa).toBe('CHALLENGE_NOT_RUN')
    expect(result.seed_column).toBe('DENIED'); expect(api.auth.signOut).toHaveBeenCalledWith({scope:'local'})
    expect(JSON.stringify(result)).not.toContain('private-'); expect(JSON.stringify(result)).not.toContain('private@')
  })
  it('does not trust a password result if server getUser fails, and still cleans up', async () => {
    const api = client(); api.auth.getUser.mockResolvedValue({data:{user:{id:'wrong'}},error:null})
    const roles = vi.fn(); const result = await probeIdentity(api,{},'player',roles)
    expect(result.identity).toBe('FAIL'); expect(roles).not.toHaveBeenCalled(); expect(api.auth.signOut).toHaveBeenCalledWith({scope:'local'})
  })
  it('does not treat a missing table as denied, or an empty HEAD response as RLS proof', async () => {
    const api = client(); api.from.mockReturnValue({select:vi.fn().mockReturnValue({limit:vi.fn().mockResolvedValue({error:{code:'PGRST205'}})})})
    expect((await probeIdentity(api,{},'player',async()=>['user'])).private_table_reads.financial_holds).toBe('BLOCKED')
    api.from.mockReturnValue({select:vi.fn().mockReturnValue({limit:vi.fn().mockResolvedValue({status:200,error:null})})})
    expect((await probeIdentity(api,{},'player',async()=>['user'])).seed_column).toBe('UNEXPECTED_ACCESS')
  })
})

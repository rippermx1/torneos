import {describe,it,expect,vi,beforeEach} from 'vitest'
const f=vi.hoisted(()=>({auth:vi.fn(),enabled:vi.fn(),state:vi.fn()}))
vi.mock('@/lib/supabase/admin-mfa',()=>({requireAdminMfaForApi:f.auth}))
vi.mock('@/lib/analytics/snake-funnel-server',()=>({funnelEnabled:f.enabled,readFunnelState:f.state}))
import {GET} from '@/app/api/admin/reports/snake-funnel/route'
beforeEach(()=>{vi.resetAllMocks();f.auth.mockResolvedValue({ok:true});f.enabled.mockReturnValue(true);f.state.mockResolvedValue({version:1,updatedAt:0,journeys:{}})})
describe('aggregate reports are private and permission checked',()=>{
  it('enforces admin MFA before reading and never returns session identifiers',async()=>{
    f.auth.mockResolvedValueOnce({ok:false,response:new Response(null,{status:403})});expect((await GET()).status).toBe(403);expect(f.state).not.toHaveBeenCalled()
    const now=Date.now();f.state.mockResolvedValueOnce({version:1,updatedAt:now,journeys:{'private-session':{startedAt:now,steps:{practice_view:now}}}})
    const r=await GET();expect(r.headers.get('cache-control')).toBe('private, no-store');const text=await r.text();expect(text).not.toContain('private-session');expect(JSON.parse(text).report.sessions).toBe(1)
  })
  it('distinguishes disabled, empty, and unavailable collection',async()=>{
    f.enabled.mockReturnValueOnce(false);expect(await (await GET()).json()).toEqual({enabled:false})
    expect((await (await GET()).json()).report.practiceConversion).toBeNull();f.state.mockRejectedValueOnce(Error('bad data'));expect((await GET()).status).toBe(503)
  })
})

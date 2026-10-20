import {beforeEach,describe,it,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({auth:vi.fn(),canonical:vi.fn(),origin:vi.fn(),rpc:vi.fn(),rate:vi.fn(),record:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),row:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/supabase/auth',()=>({requireAnyRoleForApi:f.auth}))
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}))
vi.mock('@/lib/snake-arena/server',()=>({sameOrigin:f.canonical,UUID:/^[0-9a-f-]{36}$/,snakeAdmin:()=>({rpc:f.rpc,from:f.from})}))
vi.mock('@/lib/game/snake-practice-auth',()=>({practiceOrigin:f.origin}))
vi.mock('@/lib/security/rate-limit',()=>({checkRateLimit:f.rate,rateLimitResponse:()=>new Response(null,{status:429})}))
vi.mock('@/lib/analytics/snake-funnel-server',()=>({recordConfirmedSnakeRegistration:f.record}))
import {POST} from '@/app/api/snake-arena/tournaments/[id]/[action]/route'
const req=()=>new Request('http://127.0.0.1:3090/api/snake-arena/tournaments/00000000-0000-0000-0000-000000000001/register',{method:'POST',headers:{Origin:'http://127.0.0.1:3090'}})
const ctx={params:Promise.resolve({id:'00000000-0000-0000-0000-000000000001',action:'register'})}
beforeEach(()=>{vi.resetAllMocks();f.canonical.mockReturnValue(false);f.origin.mockReturnValue(true);f.auth.mockResolvedValue({ok:true,access:{userId:'verified-account'}});f.rate.mockResolvedValue({ok:true});f.rpc.mockResolvedValue({error:null});f.record.mockResolvedValue(undefined)})
describe('confirmed enrollment attribution preserves original registration guards',()=>{
  it('records only after the authorized RPC succeeds, using server account and unmodified terms',async()=>{
    const query={select:f.select,eq:f.eq,maybeSingle:f.row}
    f.from.mockReturnValue(query);f.select.mockReturnValue(query);f.eq.mockReturnValue(query)
    f.row.mockResolvedValue({data:{registered_at:'2026-10-05T18:00:00.000Z'},error:null})
    expect((await POST(req(),ctx)).status).toBe(200);expect(f.rpc).toHaveBeenCalledWith('snake_register',expect.objectContaining({p_user:'verified-account'}));expect(f.record).toHaveBeenCalledWith(expect.any(Request),expect.any(Function));expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.record.mock.invocationCallOrder[0])
    const lookup=f.record.mock.calls[0][1]
    expect(await lookup()).toBe('2026-10-05T18:00:00.000Z')
    expect(f.from).toHaveBeenCalledWith('snake_entries');expect(f.select).toHaveBeenCalledWith('registered_at')
    expect(f.eq).toHaveBeenNthCalledWith(1,'tournament_id','00000000-0000-0000-0000-000000000001')
    expect(f.eq).toHaveBeenNthCalledWith(2,'user_id','verified-account')
    f.row.mockResolvedValueOnce({data:null,error:{message:'unavailable'}})
    await expect(lookup()).rejects.toThrow('Registration metric unavailable')
  })
  it('does not count unauthenticated, foreign Origin, rejected or throttled enrollment',async()=>{
    f.origin.mockReturnValueOnce(false);expect((await POST(req(),ctx)).status).toBe(403)
    f.auth.mockResolvedValueOnce({ok:false,response:new Response(null,{status:401})});expect((await POST(req(),ctx)).status).toBe(401)
    f.rate.mockResolvedValueOnce({ok:false});expect((await POST(req(),ctx)).status).toBe(429)
    f.rpc.mockResolvedValueOnce({error:{message:'capacity'}});expect((await POST(req(),ctx)).status).toBe(409)
    expect(f.record).not.toHaveBeenCalled()
  })
})

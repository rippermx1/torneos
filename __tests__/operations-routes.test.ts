import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), mfa: vi.fn(), heartbeat: vi.fn(), monitor: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc }) }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: h.mfa }))
vi.mock('@/lib/ops/heartbeat', () => ({ recordHeartbeat: h.heartbeat }))
vi.mock('@/lib/ops/monitor', () => ({ runOperationalMonitor: h.monitor }))
import { GET as watchdog } from '@/app/api/cron/watchdog/route'
import { POST as failure } from '@/app/api/cron/report-failure/route'
import { POST as acknowledge } from '@/app/api/admin/ops-incidents/[id]/acknowledge/route'
const id = 'a75839a0-bc68-4482-b943-f251fc7f71a0'
const req = (auth=true) => new Request('https://fixture.invalid/api?job=flow-reconcile', { headers: auth ? { Authorization: 'Bearer synthetic' } : {} })
const params={ params:Promise.resolve({id}) }
const ack=()=>new Request('https://fixture.invalid', { method:'POST', body:JSON.stringify({ note:'Conciliar el estado con el proveedor', actor:'spoofed-user' }) })
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('CRON_SECRET','synthetic');h.heartbeat.mockResolvedValue(undefined)
  h.rpc.mockResolvedValue({error:null});h.mfa.mockResolvedValue({ok:true,access:{userId:'operator'}})
  h.monitor.mockResolvedValue({snapshot:{active_incidents:0,observed_at:new Date().toISOString()},accepted:0,failed:0,unresolvedNotifications:0})
})
afterEach(()=>vi.unstubAllEnvs())
describe('operational route evidence',()=>{
  it.each([watchdog,failure])('rejects missing scheduler authorization before work',async handler=>{
    expect((await handler(req(false))).status).toBe(401);expect(h.monitor).not.toHaveBeenCalled();expect(h.heartbeat).not.toHaveBeenCalled()
  })
  it('healthy scheduler response includes observation while leaving bank proof unverified',async()=>{
    const r=await watchdog(req());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({bankCashVerified:false,activeIncidents:0})
    expect(h.heartbeat.mock.calls.map(c=>c[1])).toEqual(['started','ok'])
  })
  it.each([{active_incidents:1,pending:0},{active_incidents:0,pending:3}])('unresolved obligations or notifications return 503',async ({active_incidents,pending})=>{
    h.monitor.mockResolvedValue({snapshot:{active_incidents},failed:0,accepted:0,unresolvedNotifications:pending})
    expect((await watchdog(req())).status).toBe(503)
  })
  it('cannot return HTTP 200 when completion recording fails',async()=>{
    h.heartbeat.mockImplementation(async (_:string,status:string)=>{if(status==='ok')throw new Error('DB down')})
    expect((await watchdog(req())).status).toBe(503)
  })
  it('external failure is durably recorded rather than swallowed email error',async()=>{
    h.rpc.mockRejectedValue(new Error('DB down'))
    expect((await failure(req())).status).toBe(503);expect(h.monitor).not.toHaveBeenCalled()
  })
  it('MFA is required before incident mutation',async()=>{
    h.mfa.mockResolvedValue({ok:false,response:Response.json({}, {status:403})})
    expect((await acknowledge(ack(),params)).status).toBe(403);expect(h.rpc).not.toHaveBeenCalled()
  })
  it('actor comes from verified session, never request body',async()=>{
    expect((await acknowledge(ack(),params)).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('acknowledge_ops_incident',{p_id:id,p_actor:'operator',p_note:'Conciliar el estado con el proveedor'})
  })
  it('lost acknowledgement response remains uncertain and never resolves obligation',async()=>{
    h.rpc.mockRejectedValue(new Error('lost response'))
    expect((await acknowledge(ack(),params)).status).toBe(503);expect(h.rpc).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
const h=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createAdminClient:()=>({rpc:h.rpc})}))
import { recordHeartbeat } from '@/lib/ops/heartbeat'
beforeEach(()=>h.rpc.mockReset())
describe('processing evidence cannot fail open',()=>{
  it('recording failure propagates to scheduler handler',async()=>{
    h.rpc.mockResolvedValue({error:{message:'database down'}})
    await expect(recordHeartbeat('flow-reconcile','ok')).rejects.toThrow('database down')
  })
  it('starting a run is distinct from completing successful processing',async()=>{
    h.rpc.mockResolvedValue({error:null})
    await recordHeartbeat('flow-reconcile','started');await recordHeartbeat('flow-reconcile','ok')
    expect(h.rpc.mock.calls.map(call=>call[1].p_status)).toEqual(['started','ok'])
  })
})

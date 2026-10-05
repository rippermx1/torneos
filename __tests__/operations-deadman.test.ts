import { describe, expect, it, vi } from 'vitest'
import { checkOperationalDeadman } from '../scripts/ops-deadman.mjs'
const now=Date.parse('2026-10-05T15:35:00Z')
const env={ PRODUCTION_APP_URL:'https://fixture.invalid', CRON_SECRET:'synthetic', OPS_ESCALATION_EMAIL:'backup@example.test', RESEND_API_KEY:'synthetic' }
describe('independent monitor (mock requests only)',()=>{
  it('does not email when a recent processing success is verified',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true,lastSuccessAt:new Date(now-60000).toISOString()}))
    expect(await checkOperationalDeadman(env,fetcher,now)).toEqual({healthy:true,providerAccepted:false});expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['offline','stale','invalid','503'])('alerts backup independently when app signal is %s',async mode=>{
    const fetcher=vi.fn().mockResolvedValueOnce(mode==='503'?Response.json({}, {status:503}):Response.json({ok:true,lastSuccessAt:mode==='invalid'?'bad':new Date(now-16*60000).toISOString()}))
      .mockResolvedValueOnce(Response.json({id:'provider-id'}))
    if(mode==='offline')fetcher.mockReset().mockRejectedValueOnce(new Error('app down')).mockResolvedValueOnce(Response.json({id:'provider-id'}))
    expect(await checkOperationalDeadman(env,fetcher,now)).toMatchObject({healthy:false,providerAccepted:true})
    expect(fetcher.mock.calls[1][0]).toBe('https://api.resend.com/emails')
  })
  it('stable payload and key are reused within each half hour',async()=>{
    const fetcher=vi.fn().mockImplementation(async (url:string)=>url==='https://api.resend.com/emails'?Response.json({id:'provider-id'}):Response.json({}, {status:503}))
    await checkOperationalDeadman(env,fetcher,now);await checkOperationalDeadman(env,fetcher,now+60000)
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[3][1].body)
    expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[3][1].headers['Idempotency-Key'])
  })
  it('missing independent alert configuration fails visibly',async()=>{
    await expect(checkOperationalDeadman({...env,OPS_ESCALATION_EMAIL:''},vi.fn().mockRejectedValue(new Error('app down')),now)).rejects.toThrow('Falta suplente')
  })
})

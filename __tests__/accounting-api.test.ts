import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: auth }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc }) }))
import { POST, GET } from '@/app/api/admin/accounting/route'
import { GET as journal } from '@/app/api/admin/reports/journal.csv/route'
describe('API contable protegida', () => {
  beforeEach(() => { vi.stubEnv('APP_URL','http://localhost'); auth.mockReset(); rpc.mockReset(); auth.mockResolvedValue({ok:true,access:{userId:'session-admin'}}) })
  afterEach(() => { vi.unstubAllEnvs() })
  it('rechaza lectura y escritura sin MFA antes de tocar la DB', async () => {
    auth.mockResolvedValue({ok:false,response:Response.json({error:'MFA'},{status:403})})
    expect((await GET(new Request('http://localhost/api/admin/accounting'))).status).toBe(403)
    expect((await POST(new Request('http://localhost/api/admin/accounting',{method:'POST',body:'{}'}))).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('obtiene el actor de la sesión y rechaza solicitudes desde otro origen', async () => {
    rpc.mockResolvedValue({data:{id:'ok'},error:null})
    const req = (origin: string) => new Request('http://localhost/api/admin/accounting',{method:'POST',headers:{origin},body:JSON.stringify({action:'document',payload:{reference:'doc',p_actor:'attacker'},p_actor:'attacker'})})
    expect((await POST(req('https://other.example'))).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
    expect((await POST(req('http://localhost'))).status).toBe(200)
    expect(rpc.mock.calls[0][1].p_actor).toBe('session-admin')
  })
  it('no sustituye un período inválido por un export de todo el historial', async () => {
    expect((await journal(new Request('http://localhost/api/admin/reports/journal.csv?period=2026-13'))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('usa el origen público configurado cuando el servidor tiene un hostname interno', async () => {
    vi.stubEnv('APP_URL','http://127.0.0.1:3085')
    rpc.mockResolvedValue({data:{id:'ok'},error:null})
    const request=(origin:string)=>new Request('http://localhost:3085/api/admin/accounting',{
      method:'POST',headers:{origin,'x-forwarded-host':'attacker.example'},
      body:JSON.stringify({action:'document',payload:{reference:'doc'}})})
    expect((await POST(request('http://127.0.0.1:3085'))).status).toBe(200)
    expect((await POST(request('https://attacker.example'))).status).toBe(403)
  })
  it('descarga diario completo con totales y conteo de control', async () => {
    const lines=Array.from({length:500},(_,i)=>({period:'2026-09',account_code:i%2?'310200':'110100',debit_cents:i%2?0:100,credit_cents:i%2?100:0,description:'test',is_estimate:false,posting_id:i+1}))
    rpc.mockResolvedValue({data:{lines,accounts:[{code:'110100',normal_balance:'debit'},{code:'310200',normal_balance:'credit'}]},error:null})
    const res=await journal(new Request('http://localhost/api/admin/reports/journal.csv?period=2026-09'))
    expect(res.headers.get('X-Accounting-Line-Count')).toBe('500')
    expect(res.headers.get('X-Accounting-Debits-Cents')).toBe('25000')
    expect(res.headers.get('X-Accounting-Credits-Cents')).toBe('25000')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.text()).split('\n')).toHaveLength(501)
  })
})

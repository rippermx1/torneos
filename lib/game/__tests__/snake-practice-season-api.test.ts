import {describe,it,expect,vi,beforeEach} from 'vitest'
import {practiceWeek} from '../snake-practice-season'
const f=vi.hoisted(()=>({account:vi.fn(),origin:vi.fn(),rpc:vi.fn(),upsert:vi.fn()}))
vi.mock('@/lib/game/snake-practice-auth',()=>({practiceAccount:f.account,practiceOrigin:f.origin}))
vi.mock('@/lib/supabase/server',()=>({createAdminClient:()=>({rpc:f.rpc})}))
import {GET,POST} from '@/app/(public)/play/snake-arena/leaderboard/route'
const historical={players:0,entries:[],mine:{participating:false,best:500,position:null}}
const week={...historical,mine:{...historical.mine,best:0},season:practiceWeek(Date.parse('2026-10-05T13:00:00Z'))}
const request=(query='',body?:unknown)=>new Request('http://127.0.0.1:3094/play/snake-arena/leaderboard'+query,{method:body===undefined?'GET':'POST',headers:{Origin:'http://127.0.0.1:3094','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
beforeEach(()=>{vi.resetAllMocks();f.origin.mockReturnValue(true);f.account.mockResolvedValue({userId:'verified-owner',supabase:{from:()=>({upsert:f.upsert})}});f.upsert.mockResolvedValue({error:null});f.rpc.mockResolvedValue({data:historical,error:null})})
describe('weekly ranking API without accepting client scores or identity',()=>{
  it('keeps the old historical GET contract and uses only verified identity',async()=>{
    const r=await GET(request('?user_id=foreign'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store')
    expect(f.rpc).toHaveBeenCalledWith('snake_practice_leaderboard_snapshot',{p_owner:'verified-owner'})
  })
  it('selects current/previous weekly RPC and confirms metadata',async()=>{
    f.rpc.mockResolvedValueOnce({data:week,error:null});expect((await GET(request('?scope=current'))).status).toBe(200)
    expect(f.rpc).toHaveBeenLastCalledWith('snake_practice_weekly_snapshot',{p_owner:'verified-owner',p_previous:false})
    f.rpc.mockResolvedValueOnce({data:{...week,season:practiceWeek(week.season.serverNow,true)},error:null});expect((await GET(request('?scope=previous'))).status).toBe(200)
    expect(f.rpc).toHaveBeenLastCalledWith('snake_practice_weekly_snapshot',{p_owner:'verified-owner',p_previous:true})
  })
  it('allows guests to view published rows but fails closed on account errors',async()=>{
    f.account.mockResolvedValueOnce({response:new Response('',{status:401})});f.rpc.mockResolvedValueOnce({data:{...week,mine:null},error:null})
    expect((await GET(request('?scope=current'))).status).toBe(200);expect(f.rpc).toHaveBeenCalledWith('snake_practice_weekly_snapshot',{p_owner:null,p_previous:false})
    f.account.mockResolvedValueOnce({response:new Response('',{status:503})});expect((await GET(request())).status).toBe(503)
  })
  it('rejects unknown/repeated scopes and unavailable or mismatched snapshots',async()=>{
    for(const q of ['?scope=monthly','?scope=current&scope=previous'])expect((await GET(request(q))).status).toBe(400)
    expect(f.rpc).not.toHaveBeenCalled()
    for(const data of [null,historical,{...week,season:practiceWeek(week.season.serverNow,true)}]){f.rpc.mockResolvedValueOnce({data,error:null});expect((await GET(request('?scope=current'))).status).toBe(503)}
  })
  it('updates only own existing preference; one choice governs every period',async()=>{
    f.rpc.mockResolvedValueOnce({data:week,error:null});const r=await POST(request('?scope=current',{participating:true}))
    expect(r.status).toBe(200);expect(f.upsert).toHaveBeenCalledWith({user_id:'verified-owner',participating:true},{onConflict:'user_id'})
    for(const body of [{participating:true,score:9000},{participating:true,user_id:'foreign'},{participating:true,season:'fake'},{participating:'true'}])expect((await POST(request('?scope=current',body))).status).toBe(400)
    f.origin.mockReturnValueOnce(false);expect((await POST(request('',{participating:true}))).status).toBe(403)
    f.account.mockResolvedValueOnce({response:new Response('',{status:401})});expect((await POST(request('',{participating:true}))).status).toBe(401)
  })
})

import {beforeEach,describe,it,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({account:vi.fn(),origin:vi.fn(),canonical:vi.fn(),rpc:vi.fn(),from:vi.fn(),upsert:vi.fn()}))
vi.mock('@/lib/game/snake-practice-auth',()=>({practiceAccount:f.account,practiceOrigin:f.origin}))
vi.mock('@/lib/snake-arena/server',()=>({sameOrigin:f.canonical,snakeAdmin:()=>({rpc:f.rpc})}))
import {GET,POST} from '@/app/api/snake-arena/tournaments/leaderboard/route'
const board={rules:'snake-league-v1',players:0,entries:[],mine:{points:100,wins:1,tournaments:1,position:null,participating:false}}
const request=(value:unknown,origin='http://127.0.0.1:3090')=>new Request(origin+'/api/snake-arena/tournaments/leaderboard',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)})
beforeEach(()=>{vi.resetAllMocks();f.account.mockResolvedValue({userId:'verified',supabase:{from:f.from}});f.from.mockReturnValue({upsert:f.upsert});f.upsert.mockResolvedValue({error:null});f.rpc.mockResolvedValue({data:board,error:null});f.canonical.mockReturnValue(false);f.origin.mockReturnValue(true)})
describe('competitive ranking API',()=>{
  it('uses verified owner and no-store; guests receive public projection only',async()=>{
    const own=await GET();expect(own.status).toBe(200);expect(own.headers.get('cache-control')).toBe('no-store');expect(f.rpc).toHaveBeenCalledWith('snake_competitive_snapshot',{p_owner:'verified'})
    f.account.mockResolvedValueOnce({response:new Response('',{status:401})});f.rpc.mockResolvedValueOnce({data:{...board,mine:null},error:null});expect((await GET()).status).toBe(200);expect(f.rpc).toHaveBeenLastCalledWith('snake_competitive_snapshot',{p_owner:null})
  })
  it('fails closed on account and database errors and malformed or mismatched identity data',async()=>{
    for(const status of [403,503]){f.account.mockResolvedValueOnce({response:new Response('',{status})});const response=await GET();expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store')}
    expect(f.rpc).not.toHaveBeenCalled()
    for(const data of [null,{...board,mine:null},{...board,players:2}]){f.rpc.mockResolvedValueOnce({data,error:null});expect((await GET()).status).toBe(503)}
    f.rpc.mockRejectedValueOnce(new Error('database down'));expect((await GET()).status).toBe(503)
  })
  it('writes only own independent preference, never client scores or tournament results',async()=>{
    expect((await POST(request({participating:true}))).status).toBe(200)
    expect(f.from).toHaveBeenCalledWith('snake_competitive_preferences');expect(f.upsert).toHaveBeenCalledWith({user_id:'verified',participating:true},{onConflict:'user_id'})
    for(const value of [{participating:true,score:500},{participating:true,user_id:'other'},{participating:true,tournament_id:'id'},{participating:'true'},[],null])expect((await POST(request(value))).status).toBe(400)
    expect(f.upsert).toHaveBeenCalledTimes(1)
  })
  it('requires origin and authenticated account and reports failed preferences',async()=>{
    f.origin.mockReturnValueOnce(false);expect((await POST(request({participating:true}))).status).toBe(403);expect(f.account).not.toHaveBeenCalled()
    f.canonical.mockReturnValueOnce(true);f.upsert.mockResolvedValueOnce({error:new Error('down')});expect((await POST(request({participating:false}))).status).toBe(503)
    f.account.mockResolvedValueOnce({response:new Response('',{status:401})});expect((await POST(request({participating:true}))).status).toBe(401)
  })
})

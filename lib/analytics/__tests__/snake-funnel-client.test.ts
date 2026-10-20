import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
beforeEach(()=>{vi.resetModules();vi.stubEnv('NEXT_PUBLIC_SNAKE_FUNNEL','1');vi.stubGlobal('window',{location:{port:'3090'}})})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('optional browser collection never blocks navigation or play',()=>{
  it('waits for session creation, uses bounded keepalive and preserves event ordering',async()=>{
    let firstDone!:()=>void
    const fetch=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{firstDone=resolve})).mockResolvedValue(new Response(null,{status:204}))
    vi.stubGlobal('fetch',fetch);const {trackSnakeFunnel}=await import('../snake-funnel-client')
    trackSnakeFunnel({event:'practice_view'});trackSnakeFunnel({event:'game_started'});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch.mock.calls[0][0]).toBe('/play/snake-arena/metrics');expect(fetch.mock.calls[0][1]).toMatchObject({keepalive:true,credentials:'same-origin'})
    firstDone();await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(JSON.parse(fetch.mock.calls[1][1].body).event).toBe('game_started')
  })
  it('skips disabled and restricted practice origins, and network failure permits later events',async()=>{
    const fetch=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetch)
    const {trackSnakeFunnel,canBrowseSnakeTournaments}=await import('../snake-funnel-client')
    vi.stubEnv('NEXT_PUBLIC_SNAKE_FUNNEL','0');trackSnakeFunnel({event:'practice_view'});expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('NEXT_PUBLIC_SNAKE_FUNNEL','1');vi.stubGlobal('window',{location:{port:'3092'}});expect(canBrowseSnakeTournaments()).toBe(false);trackSnakeFunnel({event:'practice_view'});expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('window',{location:{port:'3090'}});trackSnakeFunnel({event:'practice_view'});trackSnakeFunnel({event:'game_ready'});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  })
})

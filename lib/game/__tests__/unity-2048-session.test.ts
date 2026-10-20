import { describe, expect, it, vi, afterEach } from 'vitest'
import { parseUnity2048Input, Unity2048Session, UNITY_2048_BUILD } from '../unity-2048-session'

const config = {startUrl:'/start',moveUrl:'/move',timeoutUrl:'/timeout'}
const board = [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
const initial = {gameId:'g1',board,score:0,moveNumber:2,deadlineAt:'2099-01-01T00:00:00Z'}
afterEach(()=>vi.useRealTimers())
describe('Unity 2048 platform session',()=>{
  it('finishes a full practice, locks further input and clears the result on restart', async () => {
    const request = vi.fn(), publish = vi.fn(), session = new Unity2048Session(publish, request)
    await session.start('practice-end-regression')
    const directions = ['left','down','right','up'] as const
    for (let move = 0; move < 2000 && !session.snapshot().game_over; move++) await session.move(directions[move % 4])
    const final = session.snapshot()
    expect(final).toMatchObject({ game_over: true, locked: true, can_restart: true, end_reason: 'no_moves' })
    expect(final.message).toContain('Práctica terminada')
    expect(final.message).toContain(final.score.toLocaleString('es-CL'))
    publish.mockClear(); await session.move('left')
    expect(publish).not.toHaveBeenCalled(); expect(session.snapshot()).toEqual(final)
    await session.start('practice-end-regression')
    expect(session.snapshot()).toMatchObject({ game_over: false, locked: false, end_reason: null, score: 0 })
    expect(request).not.toHaveBeenCalled()
  })
  it('practice starts and moves without any server requests',async()=>{
    const request=vi.fn(), publish=vi.fn(), s=new Unity2048Session(publish,request)
    await s.start('unity-test'); expect(s.snapshot().cells.filter(x=>x>0)).toHaveLength(2)
    for(const d of ['left','down','right','up'] as const) await s.move(d)
    expect(s.snapshot().move_number).toBeGreaterThan(2); expect(request).not.toHaveBeenCalled()
    await s.start('unity-test'); expect(s.snapshot().score).toBe(0)
  })
  it('starts a tournament only explicitly and submits directions without a client score',async()=>{
    const request=vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({board:[[4,2,0,0],...board.slice(1)],score:4,moveNumber:3,gameOver:false})
    const s=new Unity2048Session(vi.fn(),request,config);await s.move('left'); expect(request).not.toHaveBeenCalled()
    await s.start(); await s.move('left'); expect(s.snapshot().score).toBe(4)
    expect(request.mock.calls[1][1]).toEqual({gameId:'g1',direction:'left',moveNumber:2,clientTimestamp:expect.any(Number)})
    expect(s.snapshot().cells[0]).toBe(4); await s.start(); expect(request).toHaveBeenCalledTimes(2)
  })
  it('allows only one in-flight move and preserves state on a legal no-op',async()=>{
    let resolve!: (x:Record<string,unknown>)=>void
    const request=vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
    const s=new Unity2048Session(vi.fn(),request,config);await s.start();const moving=s.move('left');await s.move('right')
    expect(request).toHaveBeenCalledTimes(2);resolve({moved:false});await moving
    expect(s.snapshot().move_number).toBe(2);expect(s.snapshot().cells).toEqual(board.flat());expect(s.snapshot().locked).toBe(false)
  })
  it('freezes an uncertain move instead of replaying it',async()=>{
    const request=vi.fn().mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('network'))
    const s=new Unity2048Session(vi.fn(),request,config);await s.start();await s.move('left');await s.move('right')
    expect(request).toHaveBeenCalledTimes(2);expect(s.snapshot().locked).toBe(true);expect(s.snapshot().message).toContain('Recarga')
  })
  it('does not retry an uncertain timeout and accepts only server-confirmed closure',async()=>{
    vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','setInterval','clearInterval']});vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
    const request=vi.fn().mockResolvedValueOnce({...initial,deadlineAt:'2026-09-30T00:00:01Z'}).mockRejectedValueOnce(new Error('unknown'))
    const s=new Unity2048Session(vi.fn(),request,config);await s.start();vi.advanceTimersByTime(2000);await s.tick();await s.tick()
    expect(request).toHaveBeenCalledTimes(2);expect(s.snapshot().game_over).toBe(false);expect(s.snapshot().locked).toBe(true)
  })
  it('stops publishing after unmount while a request is in flight',async()=>{
    let resolve!: (x:Record<string,unknown>)=>void
    const publish=vi.fn(),request=vi.fn(()=>new Promise<Record<string,unknown>>(r=>{resolve=r})),s=new Unity2048Session(publish,request,config)
    const starting=s.start();s.destroy();publish.mockClear();resolve(initial);await starting;expect(publish).not.toHaveBeenCalled()
  })
  it('records a timeout only when the server confirms it',async()=>{
    vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','setInterval','clearInterval']});vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
    const request=vi.fn().mockResolvedValueOnce({...initial,deadlineAt:'2026-09-30T00:00:01Z'}).mockResolvedValueOnce({timedOut:true,score:16})
    const s=new Unity2048Session(vi.fn(),request,config);await s.start();vi.advanceTimersByTime(2000);await s.tick()
    expect(s.snapshot().game_over).toBe(true);expect(s.snapshot().score).toBe(16);await s.move('left');expect(request).toHaveBeenCalledTimes(2)
  })
  it('unlocks when the server rejects an early expiration with 45 seconds left',async()=>{
    vi.useFakeTimers({toFake:['Date','performance','setTimeout','clearTimeout','setInterval','clearInterval']});vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
    const request=vi.fn().mockResolvedValueOnce({...initial,deadlineAt:'2026-09-30T00:00:01Z'})
      .mockResolvedValueOnce({timedOut:false,score:0,deadlineAt:'2026-09-30T00:00:46Z',serverNow:'2026-09-30T00:00:01Z'})
      .mockResolvedValueOnce({moved:false})
    const s=new Unity2048Session(vi.fn(),request,config);await s.start();vi.advanceTimersByTime(2000);await s.tick();await s.tick()
    expect(s.snapshot().game_over).toBe(false);expect(s.snapshot().locked).toBe(false);expect(s.snapshot().time_left_seconds).toBe(45)
    await s.move('left');expect(request).toHaveBeenCalledTimes(3)
  })
  it('rejects malformed state and protocol/build mismatches',async()=>{
    const request=vi.fn().mockResolvedValue({...initial,board:[[2]]}),s=new Unity2048Session(vi.fn(),request,config)
    await s.start();expect(s.snapshot().locked).toBe(true);expect(s.snapshot().started).toBe(false)
    const e={channel:'torneos.2048',version:1,type:'game.ready',build_id:UNITY_2048_BUILD}
    expect(parseUnity2048Input(e)).toBe('ready');expect(parseUnity2048Input({...e,build_id:'old'})).toBeNull()
    expect(parseUnity2048Input({...e,type:'game.input',direction:'diagonal'})).toBeNull()
    expect(parseUnity2048Input({...e,type:'game.input',direction:'left',channel:'foreign'})).toBeNull()
    expect(parseUnity2048Input({...e,type:'game.restart'})).toBeNull()
  })
})

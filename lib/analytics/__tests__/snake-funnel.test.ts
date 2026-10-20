import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
vi.mock('server-only',()=>({}))
import {FUNNEL_TTL,funnelSummary,readFunnelEvent} from '../snake-funnel'
import {funnelSession,signFunnelSession,newFunnelSession,recordFunnel,readFunnelState,FUNNEL_COOKIE,recordConfirmedSnakeRegistration} from '../snake-funnel-server'
import {POST} from '@/app/(public)/play/snake-arena/metrics/route'
let dir:string
const request=(body:unknown,cookie='',origin='http://127.0.0.1:3090')=>new Request('http://127.0.0.1:3083/play/snake-arena/metrics',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)})
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'torneos-snake-funnel-'));vi.stubEnv('WEB_FUNNEL_DIR',dir);vi.stubEnv('WEB_FUNNEL_SECRET','test-secret-only-'.repeat(3));vi.stubEnv('NEXT_PUBLIC_SNAKE_FUNNEL','1');vi.stubEnv('APP_URL','http://127.0.0.1:3083');vi.stubEnv('SNAKE_PRACTICE_ORIGINS','http://127.0.0.1:3090')})
afterEach(async()=>{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true})})
describe('minimal attributed Snake funnel',()=>{
  it('rejects browser confirmations, identity, arbitrary data and malformed enums',()=>{
    for(const value of [{event:'registration_confirmed'},{event:'practice_view',user_id:'secret'},{event:'tournaments_click',surface:['header']},{event:'catalog_view',availability:['empty']},{event:'practice_view',availability:'empty'},[],null])expect(readFunnelEvent(value)).toBeNull()
    expect(readFunnelEvent({event:'tournaments_click',surface:'result'})).toEqual({event:'tournaments_click',surface:'result'})
  })
  it('signs a short-lived session; rejects tampering, future and expiry',()=>{
    const now=Date.now(),s=newFunnelSession(now),token=signFunnelSession(s),req=request({},`${FUNNEL_COOKIE}=${token}`)
    expect(funnelSession(req,now)).toEqual(s);expect(funnelSession(req,now+FUNNEL_TTL)).toBeNull();expect(funnelSession(req,now-1)).toBeNull()
    expect(funnelSession(request({},`${FUNNEL_COOKIE}=${token.slice(0,-1)}Z`),now)).toBeNull()
    expect(funnelSession(request({},`${FUNNEL_COOKIE}=foreign`),now)).toBeNull()
  })
  it('creates cookies only from a practice view and enforces Origin, payload limit and disabled mode',async()=>{
    expect((await POST(request({event:'practice_view'},'','https://foreign.test'))).status).toBe(403)
    expect((await POST(request({event:'game_started'}))).status).toBe(202)
    expect((await POST(request({event:'registration_confirmed'}))).status).toBe(400)
    expect((await POST(request({event:'practice_view',junk:'x'.repeat(600)}))).status).toBe(413)
    const r=await POST(request({event:'practice_view'}));expect(r.status).toBe(204);expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Max-Age=21600/)
    expect(Object.keys((await readFunnelState()).journeys)).toHaveLength(1)
    vi.stubEnv('NEXT_PUBLIC_SNAKE_FUNNEL','0');expect((await POST(request({event:'practice_view'}))).status).toBe(204)
    expect(Object.keys((await readFunnelState()).journeys)).toHaveLength(1)
  })
  it('serializes writes, deduplicates reload/reconnect/retry, preserves first surface and confirms via server only',async()=>{
    const s=newFunnelSession(),cookie=`${FUNNEL_COOKIE}=${signFunnelSession(s)}`
    await recordFunnel(s,'practice_view')
    await Promise.all([recordFunnel(s,'game_started'),recordFunnel(s,'game_started'),recordFunnel(s,'tournaments_click',{surface:'result'}),recordFunnel(s,'tournaments_click',{surface:'header'}),recordFunnel(s,'catalog_view',{availability:'empty'}),recordFunnel(s,'tournament_view')])
    const registered=async()=>new Date().toISOString()
    await recordConfirmedSnakeRegistration(request({},cookie),registered);await recordConfirmedSnakeRegistration(request({},cookie),registered)
    const state=await readFunnelState(),report=funnelSummary(state)
    expect(report.sessions).toBe(1);expect(report.converted).toBe(1);expect(report.clickConversion).toBe(1);expect(report.clickSurfaces.result).toBe(1);expect(report.catalogAvailability.empty).toBe(1)
    const bytes=await readFile(path.join(dir,'snake-funnel.json'),'utf8');expect(bytes).not.toContain('test-secret');expect(bytes).not.toContain('user_id');expect(bytes).not.toContain('email')
    expect(state.journeys[s.id].surface).toBe('result')
  })
  it('counts skipped stages separately, excludes out-of-order conversion and expresses empty rates as null',async()=>{
    const s=newFunnelSession(),now=Date.now();await recordFunnel(s,'practice_view',{},now);await recordFunnel(s,'tournament_view',{},now+1);await recordFunnel(s,'tournaments_click',{surface:'header'},now+2);await recordFunnel(s,'catalog_view',{},now+3);await recordFunnel(s,'registration_confirmed',{},now+4)
    const report=funnelSummary(await readFunnelState(),now+5);expect(report.counts.registration_confirmed).toBe(1);expect(report.converted).toBe(0)
    expect(funnelSummary({version:1,updatedAt:0,journeys:{}}).practiceConversion).toBeNull()
  })
  it('does not attribute an earlier enrollment or missing row and storage failures never change registration success',async()=>{
    const s=newFunnelSession(),cookie=`${FUNNEL_COOKIE}=${signFunnelSession(s)}`,req=request({},cookie);await recordFunnel(s,'practice_view')
    await recordConfirmedSnakeRegistration(req,async()=>new Date(s.at-1000).toISOString());await recordConfirmedSnakeRegistration(req,async()=>null)
    expect(funnelSummary(await readFunnelState()).counts.registration_confirmed).toBe(0)
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});await expect(recordConfirmedSnakeRegistration(req,async()=>{throw Error('down')})).resolves.toBeUndefined();log.mockRestore()
  })
  it('expires old data, respects capacity and reports corrupt storage rather than a fabricated zero',async()=>{
    const now=Date.now(),s=newFunnelSession(now),old=newFunnelSession(now-31*86400000)
    await recordFunnel(old,'practice_view',{},old.at);await recordFunnel(s,'practice_view',{},now)
    expect(Object.keys((await readFunnelState()).journeys)).toEqual([s.id])
    const full={version:1,updatedAt:now,journeys:Object.fromEntries(Array.from({length:1000},()=>{const session=newFunnelSession(now);return [session.id,{startedAt:now,steps:{practice_view:now}}]}))}
    await writeFile(path.join(dir,'snake-funnel.json'),JSON.stringify(full));await expect(recordFunnel(newFunnelSession(now),'practice_view')).rejects.toThrow('capacity')
    await writeFile(path.join(dir,'snake-funnel.json'),'invalid');await expect(readFunnelState()).rejects.toThrow();expect((await POST(request({event:'practice_view'}))).status).toBe(503)
  })
})

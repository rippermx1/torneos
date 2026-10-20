import {describe,it,expect} from 'vitest'
import {ArenaPerformance} from '../snake-arena-performance'
describe('SnakeArena measured render windows',()=>{
  it('uses bounded active windows and weighted mean, not wall clock or session p95',()=>{
    const p=new ArenaPerformance(4)
    expect(p.observe({fps:60},0,true).seconds).toBe(0)
    p.observe({fps:60,frameMsP95:17,wasmAllocatedMB:92},2000,true)
    const r=p.observe({fps:40,frameMsP95:28,wasmAllocatedMB:96},4500,true)
    expect(r).toMatchObject({state:'complete',seconds:4,samples:2,fpsMean:50,fpsMin:40,fpsMax:60,worstWindowP95Ms:28,below55Seconds:2,wasmMinMiB:92,wasmMaxMiB:96})
    expect(p.observe({fps:1},8000,true)).toEqual(r)
    p.pause();expect(p.summary()).toEqual(r)
  })
  it('clips the last window to the requested active duration',()=>{
    const p=new ArenaPerformance(3)
    p.observe({fps:60},0,true);p.observe({fps:60},2000,true)
    expect(p.observe({fps:30},4000,true)).toMatchObject({state:'complete',seconds:3,fpsMean:50,below55Seconds:1})
  })
  it('discards death, hidden, stalled and duplicate windows; resume warms up',()=>{
    const p=new ArenaPerformance()
    p.observe({fps:60},0,true);p.observe({fps:60},2000,true)
    p.pause();p.observe({fps:60},6000,false);p.observe({fps:60},8000,true)
    p.observe({fps:60},8100,true);p.observe({fps:60},10000,true)
    p.observe({fps:60},20000,true);p.observe({fps:60},22000,true)
    expect(p.summary()).toMatchObject({seconds:6,samples:3,interruptions:2})
  })
  it('rejects nonfinite samples and has a fixed capacity',()=>{
    const p=new ArenaPerformance(999999)
    p.observe({fps:NaN},0,true);p.observe({fps:60,frameMsP95:-1},2000,true);p.observe({fps:0},4000,true)
    expect(p.summary()).toMatchObject({seconds:0,fpsMin:null,fpsMean:null,excluded:3})
    p.observe({fps:60},6000,true)
    for(let i=1;i<=1000;i++)p.observe({fps:60},6000+i*2000,true)
    expect(p.summary()).toMatchObject({state:'complete',samples:180,seconds:360})
  })
})

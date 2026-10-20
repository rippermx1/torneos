import {describe,expect,it} from 'vitest'
import {ALIEN_RUN_BUILD,ALIEN_RUN_RULES,createAlienPracticeConfig,parseAlienResult} from '../alien-run-client'
const result={build_id:ALIEN_RUN_BUILD,ruleset_version:ALIEN_RUN_RULES,duration_ms:10000,collected_ids:['c01','s01'],deaths:1,finished:true}
const event={channel:'orbit.arcade',version:1,type:'game.finished',run_id:'r1',result}
describe('Alien Run practice adapter',()=>{
  it('requires the current run, build and rules',()=>{
    expect(parseAlienResult(event,'r1')).toEqual(result)
    expect(parseAlienResult(event,'other')).toBeNull()
    expect(parseAlienResult({...event,result:{...result,build_id:'old'}},'r1')).toBeNull()
  })
  it('rejects unknown or duplicate collectibles and impossible durations',()=>{
    expect(parseAlienResult({...event,result:{...result,collected_ids:['c01','c01']}},'r1')).toBeNull()
    expect(parseAlienResult({...event,result:{...result,collected_ids:['c99']}},'r1')).toBeNull()
    expect(parseAlienResult({...event,result:{...result,duration_ms:900000}},'r1')).toBeNull()
  })
  it('creates only free practice configurations with a new run every time',()=>{
    const a=createAlienPracticeConfig(),b=createAlienPracticeConfig()
    expect(a.mode).toBe('practice');expect(a.run_id).not.toBe(b.run_id);expect(a.max_duration_ms).toBe(180000)
  })
})

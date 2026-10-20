import {it,expect} from 'vitest'
import {readLightRain,lightRainHint} from '../snake-light-rain'
import {readArenaMessage,SNAKE_CHANNEL,SNAKE_BUILD} from '../snake-arena-client'
const rain={nextSpawnTick:1325,endsTick:575,simulationHz:25,remaining:24}
it('guides toward the nearest available rain light using server lifetime and world Y',()=>{
  expect(lightRainHint(200,rain,[{x:50,y:53,kind:'rain'},{x:54,y:50,kind:'rain'},{x:51,y:50,kind:'rare'}],{x:50,y:50})).toEqual({active:true,remaining:24,seconds:15,direction:'↑'})
  expect(lightRainHint(575,{...rain,endsTick:null,remaining:0},[])).toEqual({active:false,remaining:0,seconds:30,direction:''})
  expect(lightRainHint(575,rain,[]).active).toBe(false)
  expect(lightRainHint(1400,{...rain,endsTick:null,remaining:0},[]).seconds).toBe(0)
})
it('rejects malformed event snapshots and preserves compatibility when event is absent',()=>{
  const wrap=(lightRain:unknown)=>({channel:SNAKE_CHANNEL,version:1,build:SNAKE_BUILD,data:{v:1,type:'snapshot',players:[],lightRain}})
  expect(readArenaMessage(wrap(rain))?.lightRain).toEqual(rain);expect(readArenaMessage(wrap(undefined))).not.toBeNull()
  for(const invalid of [null,{...rain,simulationHz:0},{...rain,simulationHz:61},{...rain,remaining:25},{...rain,remaining:-1},{...rain,endsTick:NaN},{...rain,endsTick:null},{...rain,nextSpawnTick:'200'}]){expect(readLightRain(invalid)).toBeNull();expect(readArenaMessage(wrap(invalid))).toBeNull()}
})

import {describe,it,expect} from 'vitest'
import {readSnakeProgress,missionCelebration} from '../snake-arena-missions'
const start={life:1,xp:0,earned:0,missions:[{id:'gather',value:0,target:5,xp:25,complete:false},{id:'grow',value:12,target:24,xp:35,complete:false},{id:'star',value:0,target:1,xp:60,complete:false}]}
describe('practice mission feedback',()=>{
  it('rejects invalid, reordered, inconsistent and unbounded server progress',()=>{
    expect(readSnakeProgress(start)).toEqual(start)
    for(const value of [null,{}, {...start,xp:NaN},{...start,life:0},{...start,earned:25},{...start,missions:[...start.missions].reverse()},{...start,missions:[{...start.missions[0],value:5},...start.missions.slice(1)]}])expect(readSnakeProgress(value)).toBeNull()
  })
  it('announces completion once and avoids false celebrations after reconnect or restart',()=>{
    const next={...start,xp:25,earned:25,missions:[{...start.missions[0],value:5,complete:true},...start.missions.slice(1)]}
    expect(missionCelebration(start,next)).toContain('+25 XP');expect(missionCelebration(next,next)).toBe('');expect(missionCelebration(null,next)).toBe('');expect(missionCelebration({...start,life:2},next)).toBe('')
    const full={...start,xp:120,earned:120,missions:start.missions.map(m=>({...m,value:m.target,complete:true}))}
    expect(readSnakeProgress(full)).toEqual(full);expect(missionCelebration(next,full)).toContain('+95 XP · ¡Nivel 2!')
  })
})

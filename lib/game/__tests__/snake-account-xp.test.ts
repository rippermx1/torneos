import {describe,it,expect} from 'vitest'
import {accountLevelCelebration,missionCelebration,readSnakeProgress,SNAKE_MISSIONS} from '../snake-arena-missions'
describe('account XP celebration',()=>{
  it('announces only confirmed account level changes, never initial recovery or repeated totals',()=>{
    expect(accountLevelCelebration(null,145)).toBe('')
    expect(accountLevelCelebration(85,120)).toBe('XP guardada · ¡Nivel 2!')
    expect(accountLevelCelebration(120,120)).toBe('')
    expect(accountLevelCelebration(120,25)).toBe('')
  })
  it('mission completion can suppress session levels for authenticated account progression',()=>{
    const initial={life:1,xp:95,earned:0,missions:SNAKE_MISSIONS.map(m=>({...m,value:m.id==='grow'?12:0,complete:false}))}
    const next={life:1,xp:120,earned:25,missions:initial.missions.map(m=>m.id==='gather'?{...m,value:5,complete:true}:m)}
    expect(readSnakeProgress(initial)).not.toBeNull();expect(readSnakeProgress(next)).not.toBeNull()
    expect(missionCelebration(initial,next,false)).toBe('Recoge 5 luces · +25 XP')
    expect(missionCelebration(initial,next)).toContain('¡Nivel 2!')
  })
})

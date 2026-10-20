import {describe,it,expect} from 'vitest'
import {dailyWindow,dailyProgress,dailyCelebration,readDailyProgress} from '../snake-daily-missions'
import {readArenaMessage,SNAKE_CHANNEL,SNAKE_BUILD} from '../snake-arena-client'
describe('daily missions calendar and private protocol',()=>{
  it('renews at Chile midnight using server time',()=>{
    const before=Date.parse('2026-10-03T02:59:59.999Z'),after=before+1
    expect(dailyWindow(before).day).toBe('2026-10-02');expect(dailyWindow(before).resetsAt).toBe('2026-10-03T03:00:00.000Z');expect(dailyWindow(after).day).toBe('2026-10-03')
  })
  it('handles 23 and 25 hour Chile days rather than assuming 24 hours',()=>{
    const short=Date.parse('2026-09-06T04:00:00Z'),long=Date.parse('2026-04-04T03:00:00Z')
    expect(Date.parse(dailyWindow(short).resetsAt)-short).toBe(23*3600000)
    expect(Date.parse(dailyWindow(long).resetsAt)-long).toBe(25*3600000)
  })
  it('rejects forged catalogs, dates, totals and save states; legacy messages remain valid',()=>{
    const progress=dailyProgress(Date.parse('2026-10-02T12:00:00Z'),{lights:30,growth:1,stars:2})
    expect(readDailyProgress(progress)?.earned).toBe(160)
    for(const patch of [{day:'2026-10-01'},{earned:999},{resetsAt:'invalid'},{serverNow:Infinity},{missions:[]}])expect(readDailyProgress({...progress,...patch})).toBeNull()
    expect(readDailyProgress({...progress,missions:progress.missions.map((m,i)=>i===0?{...m,target:1}:m)})).toBeNull()
    const wrap=(data:unknown)=>({channel:SNAKE_CHANNEL,version:1,build:SNAKE_BUILD,data})
    expect(readArenaMessage(wrap({v:1,type:'persistence',daily:progress,dailyState:'saved'}))?.daily).toEqual(progress)
    expect(readArenaMessage(wrap({v:1,type:'persistence',dailyState:'fake'}))).toBeNull()
    expect(readArenaMessage(wrap({v:1,type:'welcome'}))).not.toBeNull()
  })
  it('does not announce initial recovery or day renewal as a new reward',()=>{
    const now=Date.parse('2026-10-02T12:00:00Z'),first=dailyProgress(now),next=dailyProgress(now,{lights:30,growth:3,stars:2})
    expect(dailyCelebration(null,next)).toBe('');expect(dailyCelebration(first,next)).toContain('+235 XP guardada');expect(dailyCelebration(next,next)).toBe('');expect(dailyCelebration(next,dailyProgress(now+86400000))).toBe('')
  })
})

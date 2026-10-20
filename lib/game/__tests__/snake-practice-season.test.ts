import {describe,it,expect} from 'vitest'
import {practiceWeek,readSeasonLeaderboard} from '../snake-practice-season'
describe('weekly practice seasons in Chile',()=>{
  it('renews on Monday Santiago midnight instead of UTC midnight',()=>{
    const before=practiceWeek(Date.parse('2026-10-05T02:59:59.999Z')),next=practiceWeek(Date.parse('2026-10-05T03:00:00Z'))
    expect(before.day).toBe('2026-09-28');expect(before.endsAt).toBe(next.startsAt)
    expect(next.day).toBe('2026-10-05');expect(next.endsAt).toBe('2026-10-12T03:00:00.000Z')
    expect(practiceWeek(next.serverNow,true).day).toBe(before.day)
  })
  it('uses calendar weeks of 167 and 169 hours across daylight-saving transitions',()=>{
    const spring=practiceWeek(Date.parse('2026-09-06T12:00:00Z')),fall=practiceWeek(Date.parse('2026-04-05T12:00:00Z'))
    expect((Date.parse(spring.endsAt)-Date.parse(spring.startsAt))/3600000).toBe(167)
    expect((Date.parse(fall.endsAt)-Date.parse(fall.startsAt))/3600000).toBe(169)
    expect(practiceWeek(Date.parse(spring.endsAt),true).startsAt).toBe(spring.startsAt)
  })
  it('handles a week across a year boundary and permits zero-score new seasons',()=>{
    const season=practiceWeek(Date.parse('2027-01-01T12:00:00Z'))
    expect(season.day).toBe('2026-12-28')
    expect(readSeasonLeaderboard({players:0,entries:[],mine:{participating:true,best:0,position:null},season})).not.toBeNull()
  })
  it('requires authoritative matching calendar boundaries and previous/current metadata',()=>{
    const season=practiceWeek(Date.parse('2026-10-05T13:00:00Z')),board={players:0,entries:[],mine:null,season}
    expect(readSeasonLeaderboard(board)).not.toBeNull()
    for(const invalid of [{day:'2026-10-06'},{endsAt:'2026-10-12T00:00:00Z'},{startsAt:season.endsAt},{period:'monthly'},{serverNow:NaN}])expect(readSeasonLeaderboard({...board,season:{...season,...invalid}})).toBeNull()
    expect(readSeasonLeaderboard({...board,season:undefined})).toBeNull()
    expect(readSeasonLeaderboard({...board,season:practiceWeek(season.serverNow,true)})).not.toBeNull()
  })
})

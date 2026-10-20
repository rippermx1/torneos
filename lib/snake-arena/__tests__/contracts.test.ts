import {describe,it,expect} from 'vitest'
import {validateCreation} from '../server'
import {competitionHtml} from '../bridge'
import {readCompetitionMessage,COMPETITION_BUILD} from '../competition-client'
describe('free competition contract',()=>{
 const now=100000,valid={name:'Torneo libre',starts_at:new Date(now+90000).toISOString(),duration_seconds:60,max_players:16}
 it('accepts bounded free tournaments',()=>expect(validateCreation(valid,now)).toEqual(valid))
 it.each([{entry_fee_cents:1000},{prize_1st_cents:5000},{rules_version:'changed'},{max_players:17},{max_players:1},{duration_seconds:59},{duration_seconds:301},{starts_at:new Date(now+89999).toISOString()}])('rejects monetary, unknown and unbounded inputs: %j',patch=>expect(validateCreation({...valid,...patch},now)).toBeNull())
 it('reuses the immutable build and redirects the transport without modifying Unity',()=>{
  const source='<html><script src="Build/snake.loader.js"></script><script>dataUrl:"Build/snake.data.gz"</script></html>'
  const html=competitionHtml(source,'snake-arena-006')
  expect(html).toContain('/snake-arena/tournament/socket');expect(html).toContain('/games/snake-arena/snake-arena-006/Build/snake.data.gz');expect(html).toContain('event.source!==parent');expect(html).toContain("m.type!=='restart'");expect(source).not.toContain('ticket')
 })
 it('pins competition to its tested Unity build while practice advances independently',()=>{
  const message={channel:'torneos.snake-arena',version:1,build:COMPETITION_BUILD,data:{v:1,type:'ready'}}
  expect(readCompetitionMessage(message)?.type).toBe('ready');expect(readCompetitionMessage({...message,build:'snake-arena-007'})).toBeNull()
  expect(readCompetitionMessage({...message,data:{v:1,type:'snapshot',players:[{id:'fake',alive:true,score:NaN,mass:12}]}})).toBeNull()
 })
})

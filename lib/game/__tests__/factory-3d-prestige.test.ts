import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {newColony,applyColonyCommand,colonyPotentialCores,colonyPrestigeGain,colonyRate,colonyEarnedAchievements,readColonyCommand,validateColony,type ColonyAction} from '../factory-3d-domain'
import {persistColony,type ColonyStore} from '../factory-3d-persistence'

const start=100000,command=(action:ColonyAction)=>({commandId:randomUUID(),action})
const eligible=()=>({...newColony(start,'prestige-world'),balance:'1000000',extracted:'1000000',historical:'1000000',sectors:[12,13],structures:[{instanceId:'drone',definitionId:'mining-drone',cellX:12,cellZ:12,level:2,orientation:0}]})
const ascend={kind:'prestige',expectedGain:'1',expectedPrestiges:0} as const
describe('Prestige campaign',()=>{
  it.each([['999999','0'],['1000000','1'],['7999999','1'],['8000000','2'],['26999999','2'],['27000000','3'],['9'.repeat(60),'999999999999999999']])('exact cube root of historical %s yields %s cores',(historical,cores)=>{expect(colonyPotentialCores({...newColony(start,'root'),historical}).toString()).toBe(cores)})
  it('resets the cycle, preserves identity/history/earned achievements and gives no free balance',()=>{
    const s=eligible(),before=colonyEarnedAchievements(s),r=applyColonyCommand(s,command(ascend),start,'unused')
    expect(r.accepted).toBe(true);expect(r.state).toMatchObject({schema:4,worldId:s.worldId,mode:s.mode,historical:s.historical,coresAwarded:'1',prestigeCount:1,balance:'0',extracted:'0',sectors:[12],structures:[],technologies:[],remainder:0,lastManualMs:start})
    expect(r.state.earnedAchievements).toEqual(before);expect(colonyEarnedAchievements(r.state)).toEqual(before);expect(r.state.earnedAchievements).toContain('first-upgrade');expect(r.state.earnedAchievements).not.toContain('first-platform');expect(r.rateMilli).toBe('0');expect(s.structures.length).toBe(1)
  })
  it('never awards the same historical cores twice, even with a new UUID',()=>{
    const first=applyColonyCommand(eligible(),command(ascend),start,'none'),again=applyColonyCommand(first.state,command(ascend),start,'none')
    expect(again.accepted).toBe(false);expect(again.state.coresAwarded).toBe('1');expect(again.state.prestigeCount).toBe(1)
    again.state.historical='8000000';expect(colonyPrestigeGain(again.state).toString()).toBe('1')
    const second=applyColonyCommand(again.state,command({...ascend,expectedPrestiges:1}),start,'none');expect(second.accepted).toBe(true);expect(second.state.coresAwarded).toBe('2')
  })
  it('rejects stale confirmation without resetting the industry',()=>{
    for(const action of [{...ascend,expectedGain:'2'},{...ascend,expectedPrestiges:1}]){const r=applyColonyCommand(eligible(),command(action),start,'none');expect(r.accepted).toBe(false);expect(r.state.structures.length).toBe(1);expect(r.state.coresAwarded).toBe('0')}
  })
  it('settles the previous production before calculating the quote, and rejects an outdated gain',()=>{
    const s=eligible();s.historical='7999999';const r=applyColonyCommand(s,command(ascend),start+1000,'none')
    expect(r.accepted).toBe(false);expect(BigInt(r.state.historical)).toBe(BigInt(s.historical)+colonyRate(s));expect(r.state.structures.length).toBe(1)
  })
  it('boosts only automatic production with one final rounding, preserves the manual cooldown',()=>{
    const s=eligible(),oldRate=colonyRate(s),reset=applyColonyCommand(s,command(ascend),start,'unused').state
    reset.balance='100000';const rebuilt=applyColonyCommand(reset,command({kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0}),start,'rebuilt').state
    const ordinary={...rebuilt,coresAwarded:'0',prestigeCount:0};expect(colonyRate(rebuilt)).toBe(colonyRate(ordinary)*BigInt(101)/BigInt(100));expect(oldRate).toBeGreaterThan(colonyRate(rebuilt))
    expect(applyColonyCommand(reset,command({kind:'mine'}),start+249,'none').accepted).toBe(false)
    expect(applyColonyCommand(reset,command({kind:'mine'}),start+250,'none').state.balance).toBe('101000')
  })
  it('migrates schema 3 without losing geometry, technology or historical quantities',()=>{
    const legacy=eligible();legacy.schema=3;delete legacy.coresAwarded;delete legacy.prestigeCount;delete legacy.earnedAchievements
    const r=applyColonyCommand(legacy,command({kind:'sync'}),start,'none');expect(r.state.schema).toBe(4);expect(r.state.coresAwarded).toBe('0');expect(r.state.structures).toEqual(legacy.structures);expect(r.state.historical).toBe(legacy.historical)
  })
  it('rejects forged cores, awarded achievement IDs and extra client reset/state fields',()=>{
    const s=eligible();for(const corrupt of [{...s,coresAwarded:'2',prestigeCount:1},{...s,earnedAchievements:['not-real']},{...s,earnedAchievements:['first-upgrade','first-upgrade']},{...s,coresAwarded:'1',prestigeCount:0}])expect(()=>validateColony(corrupt)).toThrow()
    for(const patch of [{cores:'10'},{state:s},{expectedGain:'0'},{expectedGain:'01'},{expectedPrestiges:-1}])expect(readColonyCommand(command({...ascend,...patch}))).toBeNull()
  })
  it('recovers a committed prestige receipt after loss with one reset and one core award',async()=>{
    let state=eligible(),receipt:ReturnType<typeof applyColonyCommand>|undefined,commits=0
    const store:ColonyStore={load:async()=>receipt?{receipt}:{state,revision:state.revision,serverTimeMs:start},commit:async(_u,_id,_hash,_revision,r)=>{commits++;receipt=r;state=r.state as ReturnType<typeof eligible>;return {receipt:r}}}
    const c=command(ascend),first=await persistColony(store,'one',c),retry=await persistColony(store,'one',c);expect(retry).toEqual(first);expect(commits).toBe(1);expect(retry.state.prestigeCount).toBe(1)
  })
})

import {describe,it,expect} from 'vitest'
import {newColony,colonyRate,validateColony} from '../factory-3d-domain'
import {applyChallengeCommand,readChallengeStart,readChallengeQuery,persistChallenge,type ChallengeReceipt,type ChallengeStore} from '../factory-3d-challenge'
import {ChallengeClock} from '../factory-3d-challenge-client'
import {AccountColonyCommands,ColonyHttpError} from '../factory-3d-client'

const now=1791200000000,end=now+86400000,id='3c67999c-31bd-44e8-a9b1-9f73110a6dd0'
const state=()=>({...newColony(now,'challenge-world'),mode:'normalized-challenge'})
const command=(kind:'sync'|'mine'='sync')=>({commandId:id,action:{kind}})
describe('Normalized challenge invariants',()=>{
  it.each([{},null,{commandId:id,action:{kind:'start',alias:'Good',seed:1}},{commandId:id,action:{kind:'start',alias:'x@y.com'}},{commandId:id,action:{kind:'start',alias:'<script>'}},{commandId:id,action:{kind:'start',alias:'AB'}},{commandId:id,action:{kind:'start',alias:'Industria'},state:{balance:'100000'}}])('rejects client seed, state, public identity or malformed start %j',input=>expect(readChallengeStart(input)).toBeNull())
  it('canonicalizes a chosen name for replay instead of accepting economic fields',()=>expect(readChallengeStart({commandId:id.toUpperCase(),action:{kind:'start',alias:'  Industria A\u0301urea  '}})).toEqual({commandId:id,action:{kind:'start',alias:'Industria Áurea'}}))
  it.each(['edition=2026-13-01','edition=2026-02-30','edition=2026-10-05&edition=2026-10-06','offset=-1','offset=1','offset=1020','userId=other','seed=99','offset=1e2'])('rejects forged or invalid directory query %s',query=>expect(readChallengeQuery(new URL('http://local.test/?'+query))).toBeNull())
  it('reads a dated page of closed results',()=>expect(readChallengeQuery(new URL('http://local.test/?edition=2026-10-05&offset=20'))).toEqual({edition:'2026-10-05',offset:20}))
  it('rejects campaign inheritance or a different seed',()=>{for(const s of [{...state(),coresAwarded:'1',prestigeCount:1,historical:'1000000'},{...state(),seed:7}])expect(()=>validateColony(s)).toThrow()})
  it('blocks an action exactly at expiry and every later timestamp',()=>{for(const t of [end,end+1,end+999999])expect(()=>applyChallengeCommand(state(),command('mine'),t,end,'machine')).toThrow('challenge_closed')})
  it('allows the final millisecond before expiry and the existing mining cooldown still applies',()=>{const r=applyChallengeCommand(state(),command('mine'),end-1,end,'machine');expect(r.accepted).toBe(true);expect(r.state.historical).toBe('1000');expect(applyChallengeCommand(r.state,command('mine'),end-1,end,'machine').accepted).toBe(false)})
  it('credits the entire remaining duration, while campaign absence stays capped at 8 hours',()=>{
    const s=state();s.structures=[{instanceId:'drone',definitionId:'mining-drone',cellX:12,cellZ:12,orientation:0,level:1}];const rate=colonyRate(s)
    const r=applyChallengeCommand(s,command(),end-1,end,'machine');expect(BigInt(r.offlineEarned)).toBe(rate*BigInt(86400000-1)/BigInt(1000));expect(s.historical).toBe('0')
  })
  it('prestige is rejected without resetting industry or granting permanent bonuses',()=>{const s=state();s.historical=s.extracted=s.balance='1000000';const r=applyChallengeCommand(s,{commandId:id,action:{kind:'prestige',expectedGain:'1',expectedPrestiges:0}},now,end,'machine');expect(r.accepted).toBe(false);expect(r.state.balance).toBe(s.balance);expect(r.state.coresAwarded).toBe('0')})
  it('replays stored results without invoking the economy or commit',async()=>{const r={closed:true,commandId:id} as ChallengeReceipt;const store:ChallengeStore={load:async()=>({receipt:r}),commit:async()=>{throw new Error('No commit allowed')}};expect(await persistChallenge(store,command(),'hash','action',()=>{throw new Error('No economy allowed')})).toBe(r)})
  it('detects changed edition rules before calculating another action',async()=>{const store:ChallengeStore={load:async()=>({state:state(),revision:0,serverTimeMs:now,startedAtMs:now,endsAtMs:end,entryId:id,rulesHash:'old'}),commit:async()=>{throw new Error()}};await expect(persistChallenge(store,command(),'new','action',()=> 'instance')).rejects.toThrow('challenge_storage_incompatible')})
  it('retries optimistic conflicts from a fresh server timestamp',async()=>{let loads=0,commits=0;const store:ChallengeStore={load:async()=>({state:state(),revision:0,serverTimeMs:now+(loads++),startedAtMs:now,endsAtMs:end,entryId:id,edition:'2026-10-05',rulesHash:'hash'}),commit:async(_id,_hash,_revision,r)=>++commits===1?{conflict:true}:{receipt:r}};const r=await persistChallenge(store,command(),'hash','action',()=> 'instance');expect(loads).toBe(2);expect(r.serverTimeMs).toBe(now+1)})
  it('never extends the displayed deadline when an old receipt is replayed',()=>{const clock=new ChallengeClock(end,now,100);expect(clock.remaining(1100)).toBe(86399000);clock.confirm(end,now,1100);expect(clock.remaining(1100)).toBe(86399000);clock.confirm(end,end+1,1100);expect(clock.remaining(1100)).toBe(0);clock.confirm(end,now,1200);expect(clock.remaining(1200)).toBe(0)})
  it('retains an uncertain pending action under the entry/account namespace and never sends a campaign command',async()=>{
    const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}}
    data.set('torneos.factory-empire.account-command.v1:A',JSON.stringify(command('mine')))
    const q=new AccountColonyCommands('A',storage,async()=>{throw new ColonyHttpError(503,'network')},'challenge-command.v1:'+id)
    expect(q.hasPending).toBe(false);await expect(q.submit({kind:'mine'})).rejects.toThrow();expect(q.hasPending).toBe(true);expect(data.size).toBe(2)
    const fresh=new AccountColonyCommands('A',storage,async c=>({commandId:c.commandId,accountId:'A'} as ChallengeReceipt&{accountId:string}),'challenge-command.v1:'+id)
    await fresh.retry();expect(data.size).toBe(1);expect(data.has('torneos.factory-empire.account-command.v1:A')).toBe(true)
  })
})

import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {newColony,applyColonyCommand,colonyRate,colonyProduction,colonyPurchaseCost,readColonyCommand,validateColony,type ColonyAction} from '../factory-3d-domain'
import {persistColony,type ColonyStore} from '../factory-3d-persistence'
import {AccountColonyCommands,recoverAccountColony,ColonyHttpError,type AccountColonyReceipt} from '../factory-3d-client'

const command=(action: ColonyAction)=>({commandId:randomUUID(),action})
const rich=()=>({...newColony(1000,'world'),balance:'100000000',historical:'100000000',extracted:'100000000'})
describe('Authoritative Colony 3D',()=>{
  it('accepts intents, rejects client money/time/user/state and unknown fields',()=>{
    const c=command({kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0})
    expect(readColonyCommand(c)).toEqual(c)
    for(const kind of ['constructor','__proto__','toString'])expect(readColonyCommand(command({kind} as ColonyAction))).toBeNull()
    for(const v of [{...c,userId:randomUUID()},{...c,state:rich()},{...c,action:{...c.action,balance:'100000'}},{...c,action:{kind:'mine',now:1e15}},{...c,action:{kind:'build',definitionId:'unknown',x:12,z:12,orientation:0}},{...c,action:{kind:'move',instanceId:'a',x:1.1,z:1,orientation:2}}])expect(readColonyCommand(v)).toBeNull()
  })
  it('rate-limits manual input on server time and rejects backward clock',()=>{
    const first=applyColonyCommand(newColony(1000,'world'),command({kind:'mine'}),1000,'one')
    const second=applyColonyCommand(first.state,command({kind:'mine'}),1249,'two')
    expect(first.state.balance).toBe('1000');expect(second.accepted).toBe(false);expect(second.state.balance).toBe('1000')
    expect(applyColonyCommand(second.state,command({kind:'mine'}),1250,'three').state.balance).toBe('2000')
    expect(()=>applyColonyCommand(first.state,command({kind:'sync'}),999,'bad')).toThrow()
  })
  it('settles old rate before construction, caps offline at 8h and retains remainder',()=>{
    const s=applyColonyCommand(rich(),command({kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0}),1000,'a').state
    const rate=colonyRate(s)
    const r=applyColonyCommand(s,command({kind:'sync'}),1000+100*3600000,'b')
    expect(BigInt(r.offlineEarned)).toBe(rate*BigInt(28800))
    const tiny=applyColonyCommand(s,command({kind:'sync'}),1001,'b');expect(tiny.state.remainder).toBe(Number(rate%BigInt(1000)))
    expect(s.balance).toBe((BigInt(100000000)-BigInt(15000)).toString())
  })
  it('rejects occupied/reserved/outside/locked placement and non-adjacent land',()=>{
    const s=applyColonyCommand(rich(),command({kind:'build',definitionId:'drilling-platform',x:12,z:12,orientation:0}),1000,'a').state
    for(const [x,z] of [[12,12],[14,14],[0,0],[29,29]])expect(applyColonyCommand(s,command({kind:'build',definitionId:'drilling-platform',x,z,orientation:0}),1000,'b').accepted).toBe(false)
    expect(applyColonyCommand(s,command({kind:'expand',x:0,z:0}),1000,'b').accepted).toBe(false)
  })
  it('support does not stack; moving changes rate but never grants money',()=>{
    let s=rich();for(const [id,x] of [['surface-drill',12],['industrial-beacon',13],['industrial-beacon',14]] as const)s=applyColonyCommand(s,command({kind:'build',definitionId:id,x,z:12,orientation:0}),1000,id+x).state
    const drill=s.structures[0],r=colonyProduction(s,drill);const noSecond=structuredClone(s);noSecond.structures.pop();expect(colonyProduction(noSecond,drill)).toBe(r)
    const moved=applyColonyCommand(s,command({kind:'move',instanceId:drill.instanceId,x:17,z:17,orientation:0}),1000,'x');expect(moved.state.balance).toBe(s.balance)
  })
  it('technology requires ownership, is charged once, and blocked upgrades do not mutate buildings',()=>{
    let s=rich();const a=command({kind:'technology',technologyId:'mining-drone-10'})
    expect(applyColonyCommand(s,a,1000,'t').accepted).toBe(false)
    for(let n=0;n<10;n++)s=applyColonyCommand(s,command({kind:'build',definitionId:'mining-drone',x:12+n%6,z:12+Math.floor(n/6),orientation:0}),1000,'d'+n).state
    const bought=applyColonyCommand(s,a,1000,'t');expect(bought.accepted).toBe(true)
    const twice=applyColonyCommand(bought.state,command(a.action),1000,'t');expect(twice.accepted).toBe(false);expect(twice.state.balance).toBe(bought.state.balance)
    expect(applyColonyCommand(s,command({kind:'upgrade',instanceId:'missing'}),1000,'x').accepted).toBe(false)
  })
  it('uses exact 60-digit money and ceil cost escalation; rejects corrupt DB states',()=>{
    const s=rich();s.balance='9'.repeat(60);expect(applyColonyCommand(s,command({kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0}),1000,'d').state.balance).toBe((BigInt(s.balance)-BigInt(15000)).toString())
    s.structures=[{instanceId:'d',definitionId:'mining-drone',cellX:12,cellZ:12,orientation:0,level:1}];expect(colonyPurchaseCost(s,'mining-drone')).toBe(BigInt(18000))
    for(const bad of [{...s,sectors:[12,0]},{...s,mode:'local-practice'},{...s,balance:'-1'},{...s,technologies:['colony-efficiency']}])expect(()=>validateColony(bad)).toThrow()
  })
})
describe('Durable command recovery',()=>{
  it('recovers the original offline bootstrap receipt after response loss and reload',async()=>{
    const entries=new Map<string,string>(),storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}}
    let original:unknown
    await expect(recoverAccountColony(storage,async c=>{original=c;throw new Error('lost response')})).rejects.toThrow()
    const result=await recoverAccountColony(storage,async c=>{expect(c).toEqual(original);return {commandId:c.commandId,accountId:'one',offlineEarned:'7200000'} as AccountColonyReceipt})
    expect(result.offlineEarned).toBe('7200000');expect(entries.size).toBe(0)
  })
  it('keeps a pending action under its original account when the session changes',async()=>{
    const entries=new Map<string,string>(),storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}}
    const client=new AccountColonyCommands('A',storage,async()=>{throw new ColonyHttpError(403,'account_changed')})
    await expect(client.submit({kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0})).rejects.toThrow()
    expect(client.hasPending).toBe(true);expect(new AccountColonyCommands('B',storage,async()=>{throw 0}).hasPending).toBe(false)
  })
  it('replays original receipt after loss and CAS conflict without another mutation',async()=>{
    let state=rich(),saved: ReturnType<typeof applyColonyCommand>|undefined,commits=0,conflict=true
    const store: ColonyStore={load:async()=>saved?{receipt:saved}:{state,revision:state.revision,serverTimeMs:1000},commit:async(_u,_id,_h,_rev,r)=>{if(conflict){conflict=false;return {conflict:true}}commits++;saved=r;state=r.state;return {receipt:r}}}
    const c=command({kind:'mine'}),first=await persistColony(store,'account',c),again=await persistColony(store,'account',c)
    expect(again).toEqual(first);expect(commits).toBe(1);expect(state.balance).toBe('100001000')
  })
  it('keeps same UUID after timeout/reload and separates account keys',async()=>{
    const entries=new Map<string,string>(),storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}}
    let sent: unknown;const first=new AccountColonyCommands('one',storage,async c=>{sent=c;throw new Error('timeout')})
    await expect(first.submit({kind:'mine'})).rejects.toThrow('timeout')
    expect(new AccountColonyCommands('two',storage,async()=>{throw 0}).hasPending).toBe(false)
    const retry=new AccountColonyCommands('one',storage,async c=>{expect(c).toEqual(sent);return {commandId:c.commandId,accountId:'one'} as AccountColonyReceipt})
    await retry.retry();expect(entries.size).toBe(0)
  })
  it('never sends a mutation when pending storage fails',async()=>{
    let sent=false;const client=new AccountColonyCommands('one',{getItem:()=>null,setItem:()=>{throw new Error('quota')},removeItem:()=>{}},async()=>{sent=true;throw 0})
    await expect(client.submit({kind:'mine'})).rejects.toThrow('quota');expect(sent).toBe(false)
  })
})

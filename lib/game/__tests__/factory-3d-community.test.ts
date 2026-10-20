import {describe,it,expect} from 'vitest'
import {newColony,colonyRate} from '../factory-3d-domain'
import {readCommunityQuery,readSharing,publicDirectory,publicVisit,communityAmount} from '../factory-3d-community'
const id='6e5cd789-79c4-433b-9719-b530ab48b72f',now=1791200000000
const state=()=>({...newColony(now,'private-world'),balance:'999999',historical:'1000000',structures:[{instanceId:'private-machine',definitionId:'mining-drone',cellX:12,cellZ:12,orientation:0,level:2}]})
const row=()=>{const s=state();return {id,name:'Colonia Ámbar',productionMilli:colonyRate(s).toString(),historicalMilli:s.historical,cores:'0',prestiges:0,machines:1,snapshotAt:new Date(now).toISOString(),publishedAt:new Date(now).toISOString(),revision:0,state:s,accountId:'private-account',email:'secret@example.com'}}
describe('Public colony contract',()=>{
  it.each(['?accountId=other','?offset=-1','?offset=1001','?order=money','?id=../private','?id=','?order=production&order=history','?id='+id+'&offset=25'])('rejects directory query %s',q=>{expect(readCommunityQuery(new URL('http://local.test/'+q))).toBeNull()})
  it('permits only server directory parameters',()=>{expect(readCommunityQuery(new URL('http://local.test/?order=history&offset=25'))).toEqual({id:null,order:'history',offset:25})})
  it.each([{visible:true,alias:'a'},{visible:true,alias:'<script>'},{visible:true,alias:'email@example.com'},{visible:true,alias:'Colonia',balance:'9000'},{visible:false,accountId:'other'},{visible:'true',alias:'Colonia'}])('rejects forged sharing %j',input=>expect(readSharing(input)).toBeNull())
  it('normalizes a chosen public name without importing any state',()=>{expect(readSharing({visible:true,alias:'  Ámbar  '})).toEqual({visible:true,alias:'Ámbar'});expect(readSharing({visible:false})).toEqual({visible:false})})
  it('projects a directory without private state or identity',()=>{const r=publicDirectory({items:[row()]},0);expect(r.items[0]).not.toHaveProperty('state');expect(JSON.stringify(r)).not.toMatch(/private|secret@example/);expect(r.prizeEligible).toBe(false)})
  it('paginates without leaking the extra row used for continuation',()=>{expect(publicDirectory({items:Array.from({length:26},row)},0).items).toHaveLength(25);expect(publicDirectory({items:Array.from({length:26},row)},0).nextOffset).toBe(25);expect(publicDirectory({items:Array.from({length:26},row)},1000).nextOffset).toBeNull()})
  it('visits preserve industry but remove account/world IDs, balance and mining data',()=>{const r=publicVisit({items:[row()]})!;expect(r.state.worldId).toBe(id);expect(r.state.balance).toBe('0');expect(r.state.extracted).toBe('0');expect(r.state.lastManualMs).toBe(0);expect(r.state.structures[0].instanceId).toBe('public-machine-0');expect(JSON.stringify(r)).not.toMatch(/private|secret@example/);expect(r.state.historical).toBe('1000000')})
  it('rejects metrics inconsistent with authoritative industry',()=>{expect(()=>publicVisit({items:[{...row(),productionMilli:'999999'}]})).toThrow();expect(()=>publicVisit({items:[{...row(),historicalMilli:'999'}]})).toThrow()})
  it('returns no visit for a private or removed colony',()=>expect(publicVisit({items:[]})).toBeNull())
  it('formats exact large values without floating point',()=>expect(communityAmount('9007199254740993123')).toBe('9.007.199.254.740.993,123'))
})

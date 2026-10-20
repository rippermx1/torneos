import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {colonyRules,newColony,applyColonyCommand,colonyIndustryBonus,colonyRate,validateColony,type ColonyAction,type ColonyState} from '../factory-3d-domain'
import {challengeContent,applyChallengeCommand} from '../factory-3d-challenge'
import frozen from '../../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-rules-challenge.json'
const now=100000,commandId='00000000-0000-0000-0000-000000000001'
const rich=()=>({...newColony(now,'catalog'),balance:'1000000000',sectors:Array.from({length:25},(_,i)=>i)})
const act=(s:ColonyState,action:ColonyAction,id='instance')=>applyColonyCommand(s,{commandId,action},now,id)
describe('Advanced campaign catalog and frozen challenges',()=>{
 it('preserves all existing definitions and technologies and versions the additive catalog',()=>{expect(colonyRules.catalogVersion).toBe(2);expect(colonyRules.buildings).toHaveLength(8);expect(colonyRules.technologies).toHaveLength(23);expect(colonyRules.buildings.slice(0,4)).toEqual(frozen.buildings);expect(colonyRules.technologies.slice(0,11)).toEqual(frozen.technologies);expect(challengeContent.rules).toEqual(frozen)})
 it('permits all 23 technologies together with paid purchases inside the existing map and 200-machine cap',()=>{
  let s={...rich(),balance:'1'+'0'.repeat(50)}
  const occupied=new Set<number>();for(let z=14;z<16;z++)for(let x=14;x<16;x++)occupied.add(z*30+x)
  for(const d of colonyRules.buildings.filter(d=>d.rateMilli>0)){
   const target=Math.max(...colonyRules.technologies.filter(t=>t.familyId===d.id).map(t=>t.requiredOwned));let count=0
   for(let z=0;z+d.depth<=30&&count<target;z++)for(let x=0;x+d.width<=30&&count<target;x++){
    const cells:number[]=[];for(let dz=0;dz<d.depth;dz++)for(let dx=0;dx<d.width;dx++)cells.push((z+dz)*30+x+dx)
    if(cells.some(c=>occupied.has(c)))continue
    const result=act(s,{kind:'build',definitionId:d.id,x,z,orientation:0},'placed-'+s.structures.length);expect(result.accepted).toBe(true);s=result.state;cells.forEach(c=>occupied.add(c));count++
   }
   expect(count).toBe(target)
  }
  expect(s.structures).toHaveLength(190)
  for(const tech of colonyRules.technologies){const result=act(s,{kind:'technology',technologyId:tech.id});expect(result.accepted,tech.id).toBe(true);s=result.state}
  expect(s.technologies).toHaveLength(23);expect(()=>validateColony(s)).not.toThrow()
 })
 it.each(['ferrite-refinery','orbital-array','asteroid-miner','fusion-drill'])('%s technologies require 1, 5 and 10 paid machines',family=>{
  const technologies=colonyRules.technologies.filter(t=>t.familyId===family);expect(technologies.map(t=>t.requiredOwned)).toEqual([1,5,10])
  for(const tech of technologies){const s=rich();s.structures=Array.from({length:tech.requiredOwned-1},(_,i)=>({instanceId:'m'+i,definitionId:family,cellX:0,cellZ:i*3,level:1,orientation:0}));expect(act(s,{kind:'technology',technologyId:tech.id}).accepted).toBe(false)}
 })
 it.each(['ferrite-refinery','orbital-array','asteroid-miner','fusion-drill'])('%s has paid progression, distinct footprint, sector lock and stable instance after move/restore',family=>{
  const locked={...rich(),sectors:[12]};expect(act(locked,{kind:'build',definitionId:family,x:12,z:12,orientation:0}).accepted).toBe(false);expect(locked.structures).toHaveLength(0)
  const receipt=act(rich(),{kind:'build',definitionId:family,x:12,z:12,orientation:1});expect(receipt.accepted).toBe(true)
  const improved=act(receipt.state,{kind:'upgrade',instanceId:'instance'});expect(improved.accepted).toBe(true);expect(colonyRate(improved.state)).toBeGreaterThan(colonyRate(receipt.state))
  const moved=act(improved.state,{kind:'move',instanceId:'instance',x:24,z:24,orientation:0});expect(moved.accepted).toBe(true);expect(moved.state.balance).toBe(improved.state.balance);expect(moved.state.structures[0].level).toBe(2);expect(moved.state.structures[0].instanceId).toBe('instance');expect(()=>validateColony(JSON.parse(JSON.stringify(moved.state)))).not.toThrow()
 })
 it('refinery has stable terrain output and one nonstacking local processing bonus',()=>{
  let s=act(rich(),{kind:'build',definitionId:'ferrite-refinery',x:12,z:12,orientation:0},'ref').state;expect(colonyRate(s)).toBe(BigInt(65000))
  s=act(s,{kind:'build',definitionId:'surface-drill',x:11,z:12,orientation:0},'drill').state;expect(colonyIndustryBonus(s,s.structures[0])).toBe(20)
  s=act(s,{kind:'build',definitionId:'mining-drone',x:11,z:13,orientation:0},'drone').state;expect(colonyIndustryBonus(s,s.structures[0])).toBe(20)
 })
 it('orbital relay only improves asteroid mining and cannot stack',()=>{
  let s=act(rich(),{kind:'build',definitionId:'asteroid-miner',x:16,z:12,orientation:0},'miner').state;expect(colonyRate(s)).toBe(BigInt(1200000));s=act(s,{kind:'build',definitionId:'orbital-array',x:12,z:12,orientation:0},'relay').state;expect(colonyIndustryBonus(s,s.structures[0])).toBe(15);s=act(s,{kind:'build',definitionId:'orbital-array',x:12,z:16,orientation:0},'relay2').state;expect(colonyIndustryBonus(s,s.structures[0])).toBe(15);expect(colonyIndustryBonus(s,s.structures[1])).toBe(0)
 })
 it('challenge content hash remains stable and new families/technologies cannot enter it',()=>{
  const s={...rich(),mode:'normalized-challenge'};const hash=createHash('sha256').update(JSON.stringify(challengeContent)).digest('hex');expect(hash).toBe('a8c53aef3d43619f458cfa67bd4edd0f2cb3a84e53ab0e0ae8c80d71d3d8b2b3')
  for(const definitionId of colonyRules.buildings.slice(4).map(d=>d.id)){const result=applyChallengeCommand(s,{commandId,action:{kind:'build',definitionId,x:12,z:12,orientation:0}},now,now+86400000,'new');expect(result.accepted).toBe(false);expect(result.state.structures).toHaveLength(0)}
  expect(applyChallengeCommand(s,{commandId,action:{kind:'technology',technologyId:'ferrite-refinery-10'}},now,now+86400000,'new').accepted).toBe(false)
  const poisoned=act(rich(),{kind:'build',definitionId:'fusion-drill',x:12,z:12,orientation:0}).state;poisoned.mode='normalized-challenge';expect(()=>validateColony(poisoned)).toThrow()
 })
})

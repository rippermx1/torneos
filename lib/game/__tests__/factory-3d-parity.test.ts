import {beforeAll,describe,it,expect} from 'vitest'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {applyColonyCommand,newColony,colonyPurchaseCost,colonyLandCost,colonyUpgradeCost,colonyRules,type ColonyState,type ColonyAction,type ColonyReceipt} from '../factory-3d-domain'

const start=100000
type Vector={name:string;source:ColonyState;action:ColonyAction;now:number}
const vectors:Vector[]=[]
const rich=()=>({...newColony(start,'parity'),balance:'1'+'0'.repeat(50),extracted:'1000000',historical:'1000000'})
function add(name:string,source:ColonyState,action:ColonyAction={kind:'sync'},now=start+1234){vectors.push({name,source:structuredClone(source),action,now})}
function machine(s:ColonyState,id:string,x:number,z:number,level=1){s.structures.push({instanceId:'m'+s.structures.length,definitionId:id,cellX:x,cellZ:z,orientation:0,level});return s}
for(const seed of [0,73421,-1,2147483647,-2147483648])for(const level of [1,2,17,49,50])for(const id of ['mining-drone','surface-drill','drilling-platform']){
  const s=machine(rich(),id,12,12,level);s.seed=seed;s.remainder=999
  add(`seed ${seed}, ${id}, level ${level}`,s)
  add(`upgrade ${seed}, ${id}, level ${level}`,s,{kind:'upgrade',instanceId:'m0'})
}
const support=machine(machine(machine(rich(),'drilling-platform',12,12,17),'industrial-beacon',14,12),'industrial-beacon',15,12)
add('nonstacking beacons',support);add('moving beacon changes support',support,{kind:'move',instanceId:'m1',x:17,z:17,orientation:1})
add('occupied move',support,{kind:'move',instanceId:'m1',x:12,z:12,orientation:0});add('beacon upgrade rejected',support,{kind:'upgrade',instanceId:'m1'})
add('offline cap',support,{kind:'sync'},start+72*3600000)
for(const [x,z] of [[12,12],[14,14],[17,17],[0,0],[29,29]])add(`platform build ${x},${z}`,rich(),{kind:'build',definitionId:'drilling-platform',x,z,orientation:1})
add('insufficient balance',newColony(start,'poor'),{kind:'build',definitionId:'mining-drone',x:12,z:12,orientation:0})
for(const [x,z] of [[1,2],[2,2],[0,0],[5,2]])add(`expand ${x},${z}`,rich(),{kind:'expand',x,z})
for(const elapsed of [0,249,250]){const s=rich();s.lastManualMs=start;add(`manual boundary ${elapsed}`,s,{kind:'mine'},start+elapsed)}
for(const family of ['mining-drone','surface-drill','drilling-platform']){
  const s=rich();s.sectors=[12,11,13,7,17,6,8,16,18,2,22,1,3,21,23,0,4,5,9,10,14,15,19,20,24]
  let n=0
  // The world grid is fully owned; keep four cells for the reserved vein.
  const step=family==='drilling-platform'?2:1
  for(let z=0;z<30&&n<50;z+=step)for(let x=0;x<30&&n<50;x+=step){if(x>=14&&x<16&&z>=14&&z<16)continue;machine(s,family,x,z,n%5+1);n++}
  for(const tech of colonyRules.technologies.filter(t=>!t.familyId||t.familyId===family)){
    add(`buy ${tech.id}`,s,{kind:'technology',technologyId:tech.id});s.technologies.push(tech.id)
  }
  add(`all multipliers ${family}`,s);add(`duplicate ${family}`,s,{kind:'technology',technologyId:family+'-10'})
}
for(const historical of ['999999','1000000','7999999','8000000','27000000','9'.repeat(59)])for(const expectedGain of ['1','2']){
  const s=rich();s.historical=historical;s.extracted=historical;machine(s,'mining-drone',12,12,2)
  add(`prestige ${historical} quote ${expectedGain}`,s,{kind:'prestige',expectedGain,expectedPrestiges:0},start)
}
for(const coresAwarded of ['1','2','100']){
  const s=rich();s.historical='1000000000000';s.coresAwarded=coresAwarded;s.prestigeCount=1;s.earnedAchievements=['first-upgrade'];machine(s,'mining-drone',12,12,2)
  add(`persistent core production ${coresAwarded}`,s)
}
const legacy=rich();legacy.schema=3;delete legacy.coresAwarded;delete legacy.prestigeCount;delete legacy.earnedAchievements;add('migrate account schema 3',legacy)
for(const family of ['ferrite-refinery','orbital-array','asteroid-miner','fusion-drill']){
  const locked=rich();add(`locked catalog ${family}`,locked,{kind:'build',definitionId:family,x:12,z:12,orientation:0},start)
  for(const orientation of [0,1])for(const level of [1,2,5,10,50]){
    const s=rich();s.sectors=Array.from({length:25},(_,i)=>i);machine(s,family,12,12,level);s.structures[0].orientation=orientation
    add(`catalog ${family} orientation ${orientation} level ${level}`,s)
    add(`catalog upgrade ${family} orientation ${orientation} level ${level}`,s,{kind:'upgrade',instanceId:'m0'})
    add(`catalog move ${family} orientation ${orientation} level ${level}`,s,{kind:'move',instanceId:'m0',x:24,z:24,orientation:1-orientation})
  }
  const unlocked=rich();unlocked.sectors=Array.from({length:25},(_,i)=>i);add(`catalog purchase ${family}`,unlocked,{kind:'build',definitionId:family,x:12,z:12,orientation:1},start)
}
const processing=rich();processing.sectors=Array.from({length:25},(_,i)=>i);machine(processing,'ferrite-refinery',12,12,5);machine(processing,'surface-drill',11,12,2)
for(const definition of colonyRules.buildings.slice(4)){
  const s=rich();s.sectors=Array.from({length:25},(_,i)=>i)
  for(let z=0;z+definition.depth<=30&&s.structures.length<50;z+=definition.depth)
    for(let x=0;x+definition.width<=30&&s.structures.length<50;x+=definition.width){
      if(x<16&&x+definition.width>14&&z<16&&z+definition.depth>14)continue
      machine(s,definition.id,x,z,s.structures.length%5+1)
    }
  for(const tech of colonyRules.technologies.filter(t=>t.familyId===definition.id)){
    add(`advanced technology ${tech.id}`,s,{kind:'technology',technologyId:tech.id});s.technologies.push(tech.id)
  }
  add(`advanced family multipliers ${definition.id}`,s)
  for(const tech of colonyRules.technologies.filter(t=>t.familyId===definition.id)){
    const gated=structuredClone(s);gated.technologies=[];gated.structures=gated.structures.slice(0,tech.requiredOwned-1)
    add(`advanced gate ${tech.id}`,gated,{kind:'technology',technologyId:tech.id})
  }
}
add('refinery processing beside extractor',processing);add('refinery supply moves away',processing,{kind:'move',instanceId:'m1',x:25,z:25,orientation:0})
const orbit=rich();orbit.sectors=Array.from({length:25},(_,i)=>i);machine(orbit,'orbital-array',12,12,2);machine(orbit,'asteroid-miner',16,12,10);machine(orbit,'orbital-array',12,16,1)
add('orbital relay nonstacking',orbit);add('asteroid moves out of relay range',orbit,{kind:'move',instanceId:'m1',x:23,z:23,orientation:1});add('advanced offline cap',orbit,{kind:'sync'},start+72*3600000)
let results:Array<ColonyReceipt&{costs:string[];land:string;upgrades:string[]}>
beforeAll(()=>{
  const root=path.resolve(import.meta.dirname,'../../..')
  const parity=path.join(root,'artifacts/factory-empire-3d/parity');mkdirSync(parity,{recursive:true})
  const dir=mkdtempSync(path.join(parity,'run-'))
  const hash=(file:string)=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')
  const provenance=JSON.parse(readFileSync(path.join(root,'scripts/factory-3d-parity/source-provenance.json'),'utf8')) as {files:Array<{path:string;sha256:string}>;publishedSourceManifest:{colonySha256:string;typescriptDomainSha256:string}}
  // Pin the original Unity sources before compiling them. Do not replace this
  // oracle with TypeScript output or a second implementation of the economy.
  for(const file of provenance.files)expect(hash(file.path),file.path).toBe(file.sha256)
  expect(hash('games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Domain/Colony.cs')).toBe(provenance.publishedSourceManifest.colonySha256)
  expect(hash('lib/game/factory-3d-domain.ts')).toBe(provenance.publishedSourceManifest.typescriptDomainSha256)
  writeFileSync(path.join(dir,'input.json'),JSON.stringify(vectors))
  execFileSync('dotnet',['run','--project',path.join(root,'scripts/factory-3d-parity/FactoryParity.csproj'),'--',path.join(root,'games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-rules.json'),path.join(dir,'input.json'),path.join(dir,'csharp.json')],{cwd:root,timeout:120000,windowsHide:true,stdio:'pipe',maxBuffer:8*1024*1024})
  results=JSON.parse(readFileSync(path.join(dir,'csharp.json'),'utf8'))
  expect(results).toHaveLength(vectors.length)
  const sources=[...provenance.files.map(file=>file.path),'scripts/factory-3d-parity/FactoryParity.csproj','scripts/factory-3d-parity/Program.cs','lib/game/factory-3d-domain.ts',...['factory-3d-rules.json','factory-3d-rules-challenge.json','factory-3d-achievements.json'].map(file=>'games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/'+file)]
  writeFileSync(path.join(dir,'source-manifest.json'),JSON.stringify({scope:'Actual pinned Unity C# domain compiled by .NET; pure fixtures, no saves or backend mutated',vectors:vectors.length,sources:sources.map(file=>({path:file,sha256:hash(file)})),inputSha256:createHash('sha256').update(readFileSync(path.join(dir,'input.json'))).digest('hex'),nativeSha256:createHash('sha256').update(readFileSync(path.join(dir,'csharp.json'))).digest('hex')},null,2)+'\n')
},120000)
describe('Server economy matches the actual C# Unity domain',()=>{
  it.each(vectors.map((v,index)=>({...v,index})))('$name',({source,action,now,index})=>{
    const native=results[index],receipt=applyColonyCommand(source,{commandId:'00000000-0000-0000-0000-000000000001',action},now,'new-instance')
    expect(receipt.accepted).toBe(native.accepted);expect(receipt.rateMilli).toBe(native.rateMilli);expect(receipt.offlineEarned).toBe(native.offlineEarned)
    const state=(s:ColonyState)=>({...s,revision:0,structures:s.structures.map((b,i)=>({...b,instanceId:source.structures[i]?.instanceId??'new-instance'}))})
    expect(state(receipt.state)).toEqual(state(native.state))
    expect(colonyRules.buildings.map(b=>colonyPurchaseCost(source,b.id).toString())).toEqual(native.costs)
    expect(colonyLandCost(source).toString()).toBe(native.land)
    expect(source.structures.map(b=>colonyUpgradeCost(b).toString())).toEqual(native.upgrades)
  })
})

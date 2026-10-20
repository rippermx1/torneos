import rules from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-rules.json'
import achievements from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-achievements.json'
import challenge from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-challenge.json'
import frozenRules from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-rules-challenge.json'

// Both runtimes read the real Unity rules asset. Server time and IDs are injected
// by the application, never accepted from a player's command.
export const colonyRules = rules
export interface ColonyStructure {instanceId: string; definitionId: string; cellX: number; cellZ: number; orientation: number; level: number}
export interface ColonyState {schema: number; seed: number; rulesVersion: string; worldId: string; mode: string; balance: string; extracted: string; historical: string; revision: number; lastSettledMs: number; lastManualMs: number; remainder: number; sectors: number[]; structures: ColonyStructure[]; technologies: string[]; coresAwarded?: string; prestigeCount?: number; earnedAchievements?: string[]}
export type ColonyAction = {kind: 'sync' | 'mine'} | {kind: 'build'; definitionId: string; x: number; z: number; orientation: number} | {kind: 'move'; instanceId: string; x: number; z: number; orientation: number} | {kind: 'upgrade'; instanceId: string} | {kind: 'technology'; technologyId: string} | {kind: 'expand'; x: number; z: number} | {kind: 'prestige'; expectedGain: string; expectedPrestiges: number}
export interface ColonyCommand {commandId: string; action: ColonyAction}
export interface ColonyReceipt {state: ColonyState; serverTimeMs: number; rateMilli: string; offlineEarned: string; accepted: boolean; message: string; commandId: string; prizeEligible: false}
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v)
export function readColonyCommand(value: unknown): ColonyCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Record<string, unknown>
  if (Object.keys(d).sort().join(',') !== 'action,commandId' || typeof d.commandId !== 'string' || !uuid.test(d.commandId) || !d.action || typeof d.action !== 'object' || Array.isArray(d.action)) return null
  const a = d.action as Record<string, unknown>
  const keys: Record<string, string[]> = {sync: ['kind'], mine: ['kind'], build: ['kind','definitionId','x','z','orientation'], move: ['kind','instanceId','x','z','orientation'], upgrade: ['kind','instanceId'], technology: ['kind','technologyId'], expand: ['kind','x','z'], prestige:['kind','expectedGain','expectedPrestiges']}
  if (typeof a.kind !== 'string' || !Object.hasOwn(keys,a.kind) || Object.keys(a).sort().join(',') !== [...keys[a.kind]].sort().join(',')) return null
  if (['build','move','expand'].includes(a.kind) && (!integer(a.x,0,29) || !integer(a.z,0,29))) return null
  if (['build','move'].includes(a.kind) && !integer(a.orientation,0,1)) return null
  if (a.kind === 'build' && (!id(a.definitionId) || !rules.buildings.some(b => b.id === a.definitionId))) return null
  if (['move','upgrade'].includes(a.kind) && !id(a.instanceId)) return null
  if (a.kind === 'technology' && (!id(a.technologyId) || !rules.technologies.some(t => t.id === a.technologyId))) return null
  if (a.kind === 'prestige' && (typeof a.expectedGain !== 'string' || !/^[1-9]\d{0,59}$/.test(a.expectedGain) || !integer(a.expectedPrestiges,0,999999999))) return null
  return {commandId:d.commandId.toLowerCase(),action:a as ColonyAction}
}
export function newColony(now: number, worldId: string, seed = 73421): ColonyState {
  return {schema:4, seed, rulesVersion:rules.version, worldId, mode:'account-practice', balance:'0', extracted:'0', historical:'0', revision:0, lastSettledMs:now, lastManualMs:0, remainder:0, sectors:[12], structures:[], technologies:[], coresAwarded:'0',prestigeCount:0,earnedAchievements:[]}
}
const amount = (value: string) => {if (!/^\d{1,60}$/.test(value)) throw new Error('Cantidad persistida inválida.'); return BigInt(value)}
const ceil = (n: bigint, d: bigint) => (n+d-BigInt(1))/d
const power = (n: number, exponent: number) => BigInt(n)**BigInt(exponent)
const activeRules = (state?:ColonyState) => state?.mode==='normalized-challenge'?frozenRules:rules
const definition = (id: string,state?:ColonyState) => {const d=activeRules(state).buildings.find(b=>b.id===id);if (!d) throw new Error('Máquina desconocida.');return d as typeof rules.buildings[number]}
const footprint = (id: string, orientation: number,state?:ColonyState) => {const d=definition(id,state);return orientation===1?[d.depth,d.width]:[d.width,d.depth]}
export function colonyPotentialCores(s: ColonyState) {
  const value=amount(s.historical)/BigInt(rules.prestigeThresholdMilli)
  let lo=BigInt(0),hi=BigInt(1)
  while(hi**BigInt(3)<=value)hi*=BigInt(2)
  while(hi-lo>BigInt(1)){const mid=(lo+hi)/BigInt(2);if(mid**BigInt(3)<=value)lo=mid;else hi=mid}
  return lo
}
export const colonyPrestigeGain=(s:ColonyState)=>colonyPotentialCores(s)-amount(s.coresAwarded??'0')
export function colonyEarnedAchievements(s:ColonyState) {
  const extractors=s.structures.filter(b=>definition(b.definitionId,s).rateMilli>0)
  const metrics:Record<string,bigint>={historical:amount(s.historical),extractors:BigInt(extractors.length),'max-level':BigInt(Math.max(0,...extractors.map(b=>b.level))),sectors:BigInt(s.sectors.length),technologies:BigInt(s.technologies.length),'global-technologies':BigInt(s.technologies.filter(id=>!rules.technologies.find(t=>t.id===id)?.familyId).length)}
  return achievements.achievements.filter(a=>(s.earnedAchievements??[]).includes(a.id)||(a.metric==='owned'?BigInt(s.structures.filter(b=>b.definitionId===a.familyId).length):metrics[a.metric])>=BigInt(a.target)).map(a=>a.id)
}
export function colonyGeology(seed: number, x: number, z: number) {
  let h=(seed ^ Math.imul(x,73856093) ^ Math.imul(z,19349663))>>>0
  h=(h^(h>>>16))>>>0;h=Math.imul(h,2246822519)>>>0;h=(h^(h>>>13))>>>0
  return h%10<2?125:h%10<5?110:100
}
const vein = (x: number,z: number,s:ColonyState) => {const rules=activeRules(s);return x>=rules.veinStart&&x<rules.veinStart+rules.veinSize&&z>=rules.veinStart&&z<rules.veinStart+rules.veinSize}
function distance(a: ColonyStructure,b: ColonyStructure,state?:ColonyState) {
  const [aw,ad]=footprint(a.definitionId,a.orientation,state),[bw,bd]=footprint(b.definitionId,b.orientation,state)
  return Math.max(0,a.cellX-(b.cellX+bw-1),b.cellX-(a.cellX+aw-1),a.cellZ-(b.cellZ+bd-1),b.cellZ-(a.cellZ+ad-1))
}
export function colonyProduction(state: ColonyState,b: ColonyStructure) {
  const d=definition(b.definitionId,state),selectedRules=activeRules(state);if(d.rateMilli===0)return BigInt(0)
  const [w,h]=footprint(b.definitionId,b.orientation,state);let geology=0,bonus=0,n=BigInt(1),den=BigInt(1)
  for(let dz=0;dz<h;dz++)for(let dx=0;dx<w;dx++){const geo=colonyGeology(state.seed,b.cellX+dx,b.cellZ+dz);geology+=d.ignoreGeology?100:d.richGeology?100+2*(geo-100):geo}
  for(const beacon of state.structures){const def=definition(beacon.definitionId,state);if((def.supportPercent??0)>bonus&&distance(b,beacon,state)<=(def.supportRadius??0))bonus=def.supportPercent??0}
  for(const t of selectedRules.technologies)if(state.technologies.includes(t.id)&&(!t.familyId||t.familyId===b.definitionId)){n*=BigInt(t.numerator);den*=BigInt(t.denominator)}
  return BigInt(d.rateMilli)*power(selectedRules.levelNumerator,b.level-1)*BigInt(geology)*BigInt(100+bonus)*n*BigInt(100+colonyIndustryBonus(state,b))*(BigInt(100)+amount(state.coresAwarded??'0')*BigInt(selectedRules.prestigeCorePercent))/(power(selectedRules.levelDenominator,b.level-1)*BigInt(100000000)*BigInt(w*h)*den)
}
export function colonyIndustryBonus(state:ColonyState,b:ColonyStructure){
  const d=definition(b.definitionId,state)
  if((d.processingPercent??0)>0&&state.structures.some(source=>definition(source.definitionId,state).rateMilli>0&&!definition(source.definitionId,state).ignoreGeology&&distance(b,source,state)<=1))return d.processingPercent??0
  if(b.definitionId==='asteroid-miner')return Math.max(0,...state.structures.filter(source=>(definition(source.definitionId,state).relayPercent??0)>0&&distance(b,source,state)<=3).map(source=>definition(source.definitionId,state).relayPercent??0))
  return 0
}
export const colonyRate = (state: ColonyState) => state.structures.reduce((sum,b)=>sum+colonyProduction(state,b),BigInt(0))
export const colonyPurchaseCost = (state: ColonyState,id: string) => {
  const owned=state.structures.filter(b=>b.definitionId===id).length,rules=activeRules(state)
  return ceil(BigInt(definition(id,state).baseCost)*power(rules.purchaseNumerator,owned),power(rules.purchaseDenominator,owned))*BigInt(1000)
}
export const colonyUpgradeCost = (b: ColonyStructure,state?:ColonyState) => ceil(BigInt(definition(b.definitionId,state).baseCost)*power(activeRules(state).upgradeNumerator,b.level-1),BigInt(5)*power(activeRules(state).upgradeDenominator,b.level-1))*BigInt(1000)
export const colonyLandCost = (s: ColonyState) => ceil(BigInt(activeRules(s).landBase)*power(activeRules(s).landNumerator,s.sectors.length-1),power(activeRules(s).landDenominator,s.sectors.length-1))*BigInt(1000)
function placement(s: ColonyState,id: string,x: number,z: number,orientation: number,movingId='') {
  if(!integer(orientation,0,1))return 'Orientación inválida.'
  const required=definition(id,s).requiredSectors??0
  if(s.sectors.length<required)return `Sectores: ${s.sectors.length}/${required}`
  const [w,d]=footprint(id,orientation,s)
  if(x<0||z<0||x+w>30||z+d>30)return 'Fuera del mapa.'
  for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++){
    const cx=x+dx,cz=z+dz
    if(!s.sectors.includes(Math.floor(cz/6)*5+Math.floor(cx/6)))return 'Compra este sector primero.'
    if(vein(cx,cz,s))return 'La veta está reservada.'
    for(const b of s.structures){if(b.instanceId===movingId)continue;const [bw,bd]=footprint(b.definitionId,b.orientation,s);if(cx>=b.cellX&&cx<b.cellX+bw&&cz>=b.cellZ&&cz<b.cellZ+bd)return 'Celda ocupada.'}
  }
  return null
}
const adjacent = (a: number,b: number) => Math.abs(a%5-b%5)+Math.abs(Math.floor(a/5)-Math.floor(b/5))===1
export function validateColony(s: ColonyState) {
  const rules=activeRules(s)
  if(![3,4].includes(s.schema)||s.rulesVersion!==rules.version||!['account-practice','normalized-challenge'].includes(s.mode)||!id(s.worldId)||!integer(s.seed,-2147483648,2147483647)||!integer(s.revision,0,9999999999999)||!integer(s.lastSettledMs,0,253402300799999)||!integer(s.lastManualMs,0,253402300799999)||!integer(s.remainder,0,999))throw new Error('Partida persistida incompatible.')
  if(s.mode==='normalized-challenge'&&(s.schema!==4||s.seed!==challenge.seed||s.coresAwarded!=='0'||s.prestigeCount!==0))throw new Error('Desafío sin condiciones normalizadas.')
  if(s.mode==='normalized-challenge'&&(s.structures.some(b=>!frozenRules.buildings.some(d=>d.id===b.definitionId))||s.technologies.some(id=>!frozenRules.technologies.some(t=>t.id===id))))throw new Error('Catálogo no disponible en este desafío.')
  for(const a of [s.balance,s.extracted,s.historical])amount(a)
  if(s.schema===4){
    if(typeof s.coresAwarded!=='string'||!integer(s.prestigeCount,0,999999999)||!Array.isArray(s.earnedAchievements)||new Set(s.earnedAchievements).size!==s.earnedAchievements.length||s.earnedAchievements.some(id=>!achievements.achievements.some(a=>a.id===id)))throw new Error('Legado persistido inválido.')
    const cores=amount(s.coresAwarded)
    if(cores>colonyPotentialCores(s)||BigInt(s.prestigeCount)>cores||(s.prestigeCount===0&&cores!==BigInt(0)))throw new Error('Núcleos persistidos inválidos.')
  }else if(amount(s.coresAwarded??'0')!==BigInt(0)||(s.prestigeCount??0)!==0)throw new Error('Legado incompatible con el guardado anterior.')
  if(!Array.isArray(s.sectors)||s.sectors.length>25||!s.sectors.includes(12)||new Set(s.sectors).size!==s.sectors.length||s.sectors.some(v=>!integer(v,0,24)))throw new Error('Mapa inválido.')
  const connected=new Set([12]);while(connected.size<s.sectors.length){const next=s.sectors.filter(v=>!connected.has(v)&&[...connected].some(c=>adjacent(c,v)));if(!next.length)throw new Error('Sectores desconectados.');next.forEach(v=>connected.add(v))}
  if(!Array.isArray(s.structures)||s.structures.length>200||!Array.isArray(s.technologies)||s.technologies.length>rules.technologies.length||new Set(s.technologies).size!==s.technologies.length)throw new Error('Industria inválida.')
  const seen=new Set<string>()
  for(const b of s.structures){if(!id(b.instanceId)||seen.has(b.instanceId)||!integer(b.cellX,0,29)||!integer(b.cellZ,0,29)||!integer(b.orientation,0,1)||!integer(b.level,1,50)||((definition(b.definitionId).supportPercent??0)>0&&b.level!==1)||placement(s,b.definitionId,b.cellX,b.cellZ,b.orientation,b.instanceId))throw new Error('Ubicación persistida inválida.');seen.add(b.instanceId)}
  for(const tid of s.technologies){const t=rules.technologies.find(v=>v.id===tid);if(!t||technologyRequirement(s,t.id))throw new Error('Tecnología persistida inválida.')}
}
function technologyRequirement(s: ColonyState,id: string) {
  const rules=activeRules(s)
  const t=rules.technologies.find(v=>v.id===id)
  if(!t)return 'Tecnología desconocida.'
  if(s.sectors.length<t.requiredSectors)return `Sectores: ${s.sectors.length}/${t.requiredSectors}`
  const owned=s.structures.filter(b=>b.definitionId===t.familyId).length
  if(t.familyId&&owned<t.requiredOwned)return `Propiedad: ${owned}/${t.requiredOwned}`
  return null
}
export function applyColonyCommand(source: ColonyState,command: ColonyCommand,now: number,instanceId: string): ColonyReceipt {
  validateColony(source)
  if(!integer(now,0,253402300799999)||now<source.lastSettledMs)throw new Error('Reloj del servidor inválido.')
  const s=structuredClone(source),rules=activeRules(source)
  if(s.schema===3){s.schema=4;s.coresAwarded='0';s.prestigeCount=0;s.earnedAchievements=[]}
  const rate=colonyRate(s),elapsed=Math.min(now-s.lastSettledMs,s.mode==='normalized-challenge'?challenge.offlineCapMs:rules.offlineCapMs)
  const numerator=rate*BigInt(elapsed)+BigInt(s.remainder),earned=numerator/BigInt(1000)
  const earn=(n: bigint)=>{for(const key of ['balance','extracted','historical'] as const){const value=(amount(s[key])+n).toString();amount(value);s[key]=value}}
  earn(earned);s.remainder=Number(numerator%BigInt(1000));s.lastSettledMs=now
  const pay=(cost: bigint)=>{if(amount(s.balance)<cost)return false;s.balance=(amount(s.balance)-cost).toString();return true}
  const a=command.action;let message='',accepted=true
  if(a.kind==='prestige'){
    const gain=colonyPrestigeGain(s)
    if(s.mode==='normalized-challenge')message='El desafío no permite ascensiones ni legado de campaña.'
    else if(gain<=BigInt(0))message='Extrae más ferrita histórica antes de ascender.'
    else if(gain.toString()!==a.expectedGain||s.prestigeCount!==a.expectedPrestiges)message='La propuesta de legado cambió. Revísala antes de confirmar.'
    else if(s.prestigeCount!>=999999999)message='Límite de ascensiones alcanzado.'
    else {
      s.earnedAchievements=colonyEarnedAchievements(s)
      s.coresAwarded=(amount(s.coresAwarded!)+gain).toString();s.prestigeCount!++
      s.balance='0';s.extracted='0';s.remainder=0;s.structures=[];s.technologies=[];s.sectors=[12];s.lastManualMs=now
    }
  }else if(a.kind==='mine'){
    if(now-s.lastManualMs<rules.manualCooldownMs){accepted=false;message='Esperando energía de extracción.'}
    else {earn(BigInt(1000));s.lastManualMs=now}
  }else if(a.kind==='build'){
    message=s.mode==='normalized-challenge'&&!frozenRules.buildings.some(d=>d.id===a.definitionId)?'Catálogo no disponible en este desafío.':placement(s,a.definitionId,a.x,a.z,a.orientation)??''
    if(!message&&s.structures.length>=rules.maxBuildings)message='Máximo de 200 estructuras.'
    if(!message&&!pay(colonyPurchaseCost(s,a.definitionId)))message='Ferrita insuficiente.'
    if(!message)s.structures.push({instanceId,definitionId:a.definitionId,cellX:a.x,cellZ:a.z,orientation:a.orientation,level:1})
  }else if(a.kind==='move'||a.kind==='upgrade'){
    const b=s.structures.find(v=>v.instanceId===a.instanceId)
    if(!b)message='Instancia desconocida.'
    else if(a.kind==='move'){message=placement(s,b.definitionId,a.x,a.z,a.orientation,b.instanceId)??'';if(!message){b.cellX=a.x;b.cellZ=a.z;b.orientation=a.orientation}}
    else if((definition(b.definitionId).supportPercent??0)>0)message='La baliza no se mejora.'
    else if(b.level>=rules.maxLevel)message='Nivel máximo.'
    else if(!pay(colonyUpgradeCost(b,s)))message='Ferrita insuficiente.'
    else b.level++
  }else if(a.kind==='expand'){
    const sector=a.z*5+a.x
    if(a.x>=5||a.z>=5)message='Fuera del mapa.'
    else if(s.sectors.includes(sector))message='Sector ya comprado.'
    else if(!s.sectors.some(v=>adjacent(v,sector)))message='Elige un sector contiguo por un lado.'
    else if(!pay(colonyLandCost(s)))message='Ferrita insuficiente.'
    else s.sectors.push(sector)
  }else if(a.kind==='technology'){
    message=s.mode==='normalized-challenge'&&!frozenRules.technologies.some(t=>t.id===a.technologyId)?'Catálogo no disponible en este desafío.':s.technologies.includes(a.technologyId)?'Tecnología ya comprada.':technologyRequirement(s,a.technologyId)??''
    const t=rules.technologies.find(v=>v.id===a.technologyId)
    if(!message&&t&&!pay(BigInt(t.cost)*BigInt(1000)))message='Ferrita insuficiente.'
    if(!message)s.technologies.push(a.technologyId)
  }
  if(message)accepted=false
  s.revision=source.revision+1
  validateColony(s)
  return {state:s,serverTimeMs:now,rateMilli:colonyRate(s).toString(),offlineEarned:earned.toString(),accepted,message:message||'Colonia guardada en tu cuenta.',commandId:command.commandId,prizeEligible:false}
}

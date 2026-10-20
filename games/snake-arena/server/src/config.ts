import fs from 'node:fs'
export type Config = { arenaShape?:'circle'|'rectangle'; deathOrbs?:boolean; practiceMissions?:boolean; rareResources?:boolean; lightRain?:boolean; maxPlayers:number; maxRooms:number; width:number; height:number; resourceCount:number; baseSpeed:number; turnSpeed:number; growthRate:number; radius:number; initialMass:number; maxMass:number; simulationHz:number; snapshotHz:number; boostMultiplier:number; boostMassPerSecond:number; boostMinMass:number; boostInputTimeout:number; respawnPolicy:'manual' }
export const defaults:Config = {maxPlayers:16,maxRooms:8,width:100,height:100,resourceCount:240,baseSpeed:7,turnSpeed:4,growthRate:2,radius:0.65,initialMass:12,maxMass:120,simulationHz:25,snapshotHz:10,boostMultiplier:1.6,boostMassPerSecond:2,boostMinMass:8,boostInputTimeout:.35,respawnPolicy:'manual'}
export function validateConfig(value:unknown):Config {
  if (!value || typeof value!=='object') throw new Error('Invalid configuration')
  const c={...defaults,...value} as Config
  for(const key of Object.keys(defaults) as (keyof Config)[]) {
    if(key==='respawnPolicy') continue
    if(typeof c[key]!=='number' || !Number.isFinite(c[key]) || c[key]<=0) throw new Error(`Invalid ${key}`)
  }
  for(const key of ['maxPlayers','maxRooms','resourceCount','initialMass','maxMass','simulationHz','snapshotHz','boostMinMass'] as const) if(!Number.isInteger(c[key])) throw new Error(`Invalid integer ${key}`)
  if(c.maxPlayers>64 || c.maxRooms>32 || c.resourceCount>2000 || c.width<30 || c.height<30 || c.width>500 || c.height>500 || c.radius>2 || c.baseSpeed>30 || c.turnSpeed>12 || c.maxMass>240 || c.initialMass<8 || c.initialMass>c.maxMass || c.simulationHz>60 || c.snapshotHz>c.simulationHz || c.respawnPolicy!=='manual') throw new Error('Configuration outside bounded slice limits')
  if(c.boostMultiplier<=1 || c.boostMultiplier>2 || c.boostMassPerSecond>10 || c.boostMinMass<8 || c.boostMinMass>=c.initialMass || c.boostInputTimeout<.15 || c.boostInputTimeout>1)throw new Error('Invalid boost configuration')
  if(c.baseSpeed*c.boostMultiplier/c.simulationHz>c.radius*.8)throw new Error('Movement tick too large for collision radius')
  if(!Number.isInteger(c.growthRate)||c.growthRate>12)throw new Error('Invalid growthRate')
  if('rareResources' in c && typeof (c as Config & {rareResources?:unknown}).rareResources!=='boolean')throw new Error('Invalid rareResources')
  if('lightRain' in c && typeof c.lightRain!=='boolean')throw new Error('Invalid lightRain')
  if('deathOrbs' in c && typeof c.deathOrbs!=='boolean')throw new Error('Invalid deathOrbs')
  if('arenaShape' in c && !['circle','rectangle'].includes(c.arenaShape!))throw new Error('Invalid arenaShape')
  if(c.arenaShape==='circle'&&c.width!==c.height)throw new Error('Circular arena requires equal dimensions')
  if('practiceMissions' in c && typeof c.practiceMissions!=='boolean')throw new Error('Invalid practiceMissions')
  if(c.practiceMissions&&(!c.rareResources||c.initialMass>=24||c.maxMass<24))throw new Error('Practice missions require rare resources and reachable growth')
  return c
}
export function loadConfig(file:URL|string):Config {return validateConfig(JSON.parse(fs.readFileSync(file,'utf8')))}

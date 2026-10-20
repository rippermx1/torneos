import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {readArenaMessage,rareResourceHint,SNAKE_CHANNEL,SNAKE_BUILD} from '../snake-arena-client'
const wrap=(data:unknown)=>({channel:SNAKE_CHANNEL,version:1,build:SNAKE_BUILD,data})
const root=path.resolve(import.meta.dirname,'../../..')
describe('SnakeArena platform boundary',()=>{
  it('template readiness and runtime bridge identify the same published build',()=>{
    const provenance=JSON.parse(readFileSync(path.join(root,'scripts/factory-3d-parity/source-provenance.json'),'utf8')) as {snakeBuild:string;files:Array<{path:string;sha256:string}>}
    expect(provenance.snakeBuild).toBe(SNAKE_BUILD)
    for(const file of ['games/snake-arena/UnityProject/Assets/Plugins/WebGL/SnakeArena.jslib','games/snake-arena/UnityProject/Assets/WebGLTemplates/SnakeArena/index.html']){
      const source=readFileSync(path.join(root,file))
      expect(source.toString('utf8')).toContain("build:'"+SNAKE_BUILD+"'")
      expect(createHash('sha256').update(source).digest('hex')).toBe(provenance.files.find(record=>record.path===file)?.sha256)
      expect(createHash('sha256').update(readFileSync(path.join(root,file+'.meta'))).digest('hex')).toBe(provenance.files.find(record=>record.path===file+'.meta')?.sha256)
    }
  })
  it('validates private confirmed XP and pending status without rejecting legacy messages',()=>{
    expect(readArenaMessage(wrap({v:1,type:'welcome',accountXp:145,pendingXp:25,xpState:'saving'}))?.accountXp).toBe(145)
    for(const accountXp of [-1,1.5,Infinity,'120',1_000_000_001])expect(readArenaMessage(wrap({v:1,type:'persistence',accountXp}))).toBeNull()
    expect(readArenaMessage(wrap({v:1,type:'persistence',pendingXp:-1}))).toBeNull()
    expect(readArenaMessage(wrap({v:1,type:'persistence',xpState:'invented'}))).toBeNull()
    expect(readArenaMessage(wrap({v:1,type:'welcome'}))).not.toBeNull()
  })
  it('rare guidance uses server ticks and points upward for positive world Y, then switches to the next spawn',()=>{
    const special={nextSpawnTick:600,score:50,mass:10,simulationHz:25}
    expect(rareResourceHint(100,[{id:1,x:50,y:60,kind:'rare',expiresTick:400}],special,{x:50,y:50})).toEqual({active:true,seconds:12,direction:'↑',mass:10,score:50})
    expect(rareResourceHint(400,[],special)).toEqual({active:false,seconds:8,direction:'',mass:10,score:50})
    expect(rareResourceHint(610,[],special).seconds).toBe(0)
  })
  it('accepts only the current build/channel/version',()=>{
    expect(readArenaMessage(wrap({v:1,type:'ready'}))?.type).toBe('ready')
    for(const change of [{channel:'torneos.2048'},{version:2},{build:'old'}])expect(readArenaMessage({...wrap({v:1,type:'ready'}),...change})).toBeNull()
    expect(readArenaMessage(null)).toBeNull()
  })
  it('accepts confirmed boost and legacy snapshots but rejects forged boolean types',()=>{
    for(const boosting of [true,false,undefined])expect(readArenaMessage(wrap({v:1,type:'snapshot',players:[{id:'A',boosting,mass:10}]}))).not.toBeNull()
    for(const boosting of [1,'true',null])expect(readArenaMessage(wrap({v:1,type:'snapshot',players:[{id:'A',boosting}]}))).toBeNull()
  })
  it('rejects incomplete results',()=>{
    expect(readArenaMessage(wrap({v:1,type:'result',score:999}))).toBeNull()
    expect(readArenaMessage(wrap({v:1,type:'result',score:10,rank:1,kills:0,survivedSeconds:2,maxSize:14,personalBest:10}))).not.toBeNull()
  })
  it('accepts measured telemetry but rejects invalid numeric samples',()=>{
    expect(readArenaMessage(wrap({v:1,type:'fps',fps:60,frameMsP95:17.2,wasmAllocatedMB:64}))).not.toBeNull()
    for(const frameMsP95 of [NaN,Infinity,-1,'fast'])expect(readArenaMessage(wrap({v:1,type:'fps',fps:60,frameMsP95}))).toBeNull()
  })
})

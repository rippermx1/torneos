import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defaults,loadConfig,type Config} from '../config.js'
import {Room} from '../room.js'
import {FREE_RULES} from '../tournament.js'
test('expanded practice replenishes 1000 bounded orbs and preserves the frozen tournament arena',()=>{
  const directory=mkdtempSync(join(tmpdir(),'snake-expanded-practice-'))
  try{
    // Exercise the file loader with an explicit fixture, independent of operator configuration.
    const fixture:Config={...defaults,arenaShape:'circle',deathOrbs:true,lightRain:true,practiceMissions:true,rareResources:true,width:150,height:150,resourceCount:1000}
    const file=join(directory,'config.json');writeFileSync(file,JSON.stringify(fixture))
    const config=loadConfig(file);assert.deepEqual(config,fixture)
    assert.equal(config.width,150);assert.equal(config.height,150);assert.equal(config.resourceCount,1000)
    let seed=3;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
    const room=new Room('expanded',config,random),p=room.add('A','A')
    room.food[0]={id:room.food[0].id,x:p.x+config.baseSpeed/config.simulationHz,y:p.y}
    room.step();assert.ok(p.score>=10);assert.ok(p.mass>=14)
    assert.equal(room.food.filter(f=>!f.kind).length,1000)
    assert.equal(new Set(room.food.map(f=>f.id)).size,room.food.length)
    assert.ok(room.food.every(f=>f.x>=3&&f.x<=147&&f.y>=3&&f.y<=147))
    assert.equal(FREE_RULES.width,100);assert.equal(FREE_RULES.height,100);assert.equal(FREE_RULES.resourceCount,240)
  }finally{rmSync(directory,{recursive:true,force:true})}
})

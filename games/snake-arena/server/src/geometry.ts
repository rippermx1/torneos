import type {Config} from './config.js'
import type {Point} from './grid.js'
// Same authority for spawns, resources, boundary collisions and bot steering.
export function edgeDistance(c:Config,p:Point){
  return c.arenaShape==='circle'?Math.min(c.width,c.height)/2-Math.hypot(p.x-c.width/2,p.y-c.height/2):Math.min(p.x,p.y,c.width-p.x,c.height-p.y)
}
export function insideArena(c:Config,p:Point,margin=0){return edgeDistance(c,p)>=margin}
export function sampleArena(c:Config,random:()=>number,margin:number):Point{
  if(c.arenaShape!=='circle')return {x:margin+random()*(c.width-2*margin),y:margin+random()*(c.height-2*margin)}
  const angle=random()*Math.PI*2,r=Math.sqrt(random())*(Math.min(c.width,c.height)/2-margin)
  return {x:c.width/2+Math.cos(angle)*r,y:c.height/2+Math.sin(angle)*r}
}
export function clampArena(c:Config,p:Point,margin:number):Point{
  if(c.arenaShape!=='circle')return {x:Math.max(margin,Math.min(c.width-margin,p.x)),y:Math.max(margin,Math.min(c.height-margin,p.y))}
  const dx=p.x-c.width/2,dy=p.y-c.height/2,d=Math.hypot(dx,dy),r=Math.min(c.width,c.height)/2-margin,scale=d>r?r/d:1
  return {x:c.width/2+dx*scale,y:c.height/2+dy*scale}
}

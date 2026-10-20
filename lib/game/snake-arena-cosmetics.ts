import {APPEARANCE_LEVELS,canUseAppearance,type Appearance} from '../../games/snake-arena/server/src/cosmetics'
export {canUseAppearance}
export const SNAKE_APPEARANCES=([
  {id:'aurora',name:'Aurora',description:'Anillos turquesa · estela suave',colors:['#16a7b0','#57ffd9']},
  {id:'nebula',name:'Nebulosa',description:'Patrón violeta · estela de estrellas',colors:['#592bab','#e899ff']},
  {id:'solar',name:'Solar',description:'Bandas ámbar · estela de brasas',colors:['#f2521f','#ffe366']},
  {id:'comet',name:'Cometa',description:'Ondas de hielo · estela de chispas',colors:['#278bc9','#d7f6ff']},
  {id:'eclipse',name:'Eclipse',description:'Tinta violeta y rosa · estela de halos',colors:['#313261','#ff79be']},
  {id:'prism',name:'Prisma',description:'Anillos multicolor · estela prismática',colors:['#64ffcc','#ff8acf','#70baff']},
] as const).map(skin=>({...skin,level:APPEARANCE_LEVELS[skin.id]}))
export type SnakeAppearance=Appearance
export function isSnakeAppearance(value:unknown):value is SnakeAppearance{return SNAKE_APPEARANCES.some(a=>a.id===value)}
export function cosmeticUnlockNotice(previous:number|null,next:number){
  if(previous===null||next<=previous)return ''
  const unlocked=SNAKE_APPEARANCES.filter(s=>!canUseAppearance(s.id as Appearance,previous)&&canUseAppearance(s.id as Appearance,next))
  return unlocked.length?`¡Aspecto${unlocked.length>1?'s':''} desbloqueado${unlocked.length>1?'s':''}: ${unlocked.map(s=>s.name).join(', ')}! Elige entre partidas.`:''
}

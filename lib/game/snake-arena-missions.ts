export const SNAKE_MISSIONS=[
  {id:'gather',label:'Recoge 5 luces',target:5,xp:25,icon:'✦'},
  {id:'grow',label:'Alcanza tamaño 24',target:24,xp:35,icon:'◉'},
  {id:'star',label:'Consigue un núcleo',target:1,xp:60,icon:'◆'},
] as const
export type SnakeProgress={life:number;xp:number;earned:number;missions:{id:string;value:number;target:number;xp:number;complete:boolean}[]}
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max
export function accountLevelCelebration(previous:number|null,next:number){
  return previous!==null&&Math.floor(next/100)>Math.floor(previous/100)?`XP guardada · ¡Nivel ${Math.floor(next/100)+1}!`:''
}
export function readSnakeProgress(value:unknown):SnakeProgress|null{
  if(!value||typeof value!=='object')return null
  const p=value as SnakeProgress
  if(!integer(p.life,1,1_000_000_000)||!integer(p.xp,0,1_000_000_000)||!integer(p.earned,0,120)||p.earned>p.xp||!Array.isArray(p.missions)||p.missions.length!==3)return null
  if(p.missions.some((m,i)=>!m||m.id!==SNAKE_MISSIONS[i].id||m.target!==SNAKE_MISSIONS[i].target||m.xp!==SNAKE_MISSIONS[i].xp||!integer(m.value,0,m.target)||m.complete!==(m.value===m.target)))return null
  if(p.earned!==p.missions.reduce((sum,m)=>sum+(m.complete?m.xp:0),0))return null
  return p
}
export function missionCelebration(previous:SnakeProgress|null,next:SnakeProgress,includeLevel=true){
  if(!previous||previous.life!==next.life)return ''
  const completed=next.missions.filter((m,i)=>m.complete&&!previous.missions[i].complete)
  if(!completed.length)return ''
  const names=completed.map(m=>SNAKE_MISSIONS.find(s=>s.id===m.id)!.label).join(' · ')
  const level=Math.floor(next.xp/100)+1,wasLevel=Math.floor(previous.xp/100)+1
  return `${names} · +${completed.reduce((sum,m)=>sum+m.xp,0)} XP${includeLevel&&level>wasLevel?` · ¡Nivel ${level}!`:''}`
}

export const PRACTICE_MISSIONS=[
  {id:'gather',target:5,xp:25},
  {id:'grow',target:24,xp:35},
  {id:'star',target:1,xp:60},
] as const
export type PracticeProgress={life:number;xp:number;earned:number;missions:{id:string;value:number;target:number;xp:number;complete:boolean}[]}
export function missionProgress(life:number,xp:number,ordinary:number,maxSize:number,rare:number):PracticeProgress{
  const values=[ordinary,maxSize,rare]
  const missions=PRACTICE_MISSIONS.map((m,i)=>({...m,value:Math.min(m.target,values[i]),complete:values[i]>=m.target}))
  return {life,xp,earned:missions.reduce((sum,m)=>sum+(m.complete?m.xp:0),0),missions}
}

export const APPEARANCES=['aurora','nebula','solar','comet','eclipse','prism'] as const
export type Appearance=typeof APPEARANCES[number]
export function isAppearance(value:unknown):value is Appearance{return typeof value==='string'&&APPEARANCES.some(a=>a===value)}
export const APPEARANCE_LEVELS:Record<Appearance,number>={aurora:1,nebula:1,solar:1,comet:3,eclipse:5,prism:8}
export function canUseAppearance(id:Appearance,accountXp:number|null){
  if(APPEARANCE_LEVELS[id]===1)return true
  return accountXp!==null&&Number.isSafeInteger(accountXp)&&accountXp>=0&&accountXp<=1_000_000_000&&accountXp>=(APPEARANCE_LEVELS[id]-1)*100
}

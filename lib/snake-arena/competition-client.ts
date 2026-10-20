import type {ArenaData} from '@/lib/game/snake-arena-client'
export const COMPETITION_BUILD='snake-arena-006'
export function readCompetitionMessage(value:unknown):ArenaData|null{
  if(!value||typeof value!=='object')return null
  const packet=value as {channel?:unknown;version?:unknown;build?:unknown;data?:ArenaData}
  if(packet.channel!=='torneos.snake-arena'||packet.version!==1||packet.build!==COMPETITION_BUILD||!packet.data||packet.data.v!==1)return null
  const data=packet.data
  if(!['ready','welcome','snapshot','error','disconnect','fps','rtt'].includes(data.type))return null
  if(data.type==='snapshot'&&(!Array.isArray(data.players)||data.players.some(p=>!p||typeof p.id!=='string'||typeof p.alive!=='boolean'||!Number.isFinite(p.score)||!Number.isFinite(p.mass))))return null
  return data
}

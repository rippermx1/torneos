import runtimeBuilds from './runtime-builds.json'
export const ALIEN_RUN_BUILD = runtimeBuilds['alien-run']
export const ALIEN_RUN_RULES = 'practice-v10'
export interface AlienPracticeResult { build_id:string;ruleset_version:string;duration_ms:number;collected_ids:string[];deaths:number;finished:boolean }
export function parseAlienResult(data:unknown,runId:string):AlienPracticeResult|null {
  if (!data || typeof data!=='object') return null
  const event=data as Record<string,unknown>,r=event.result as AlienPracticeResult|undefined
  if(event.channel!=='orbit.arcade' || event.version!==1 || event.type!=='game.finished' || event.run_id!==runId || !r) return null
  if(r.build_id!==ALIEN_RUN_BUILD || r.ruleset_version!==ALIEN_RUN_RULES || !Number.isInteger(r.duration_ms) || r.duration_ms<1000 || r.duration_ms>180000 || !Number.isInteger(r.deaths) || r.deaths<0 || r.deaths>99 || typeof r.finished!=='boolean') return null
  if(!Array.isArray(r.collected_ids) || r.collected_ids.length>95 || new Set(r.collected_ids).size!==r.collected_ids.length || !r.collected_ids.every(id=>typeof id==='string' && /^(c(0[1-9]|[1-8][0-9]|90)|s0[1-5])$/.test(id))) return null
  return r
}
export function createAlienPracticeConfig() {
  return {run_id:crypto.randomUUID(),game_id:'alien-run',build_id:ALIEN_RUN_BUILD,ruleset_version:ALIEN_RUN_RULES,
    mode:'practice',max_duration_ms:180000,seed:20260930,expires_at_ms:Date.now()+240000}
}

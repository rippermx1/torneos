import http from 'node:http'
import type {Config} from './config.js'
import {createService} from './service.js'
import {attachTournaments} from './tournament-transport.js'
import type {TournamentStore} from './tournament-store.js'
import type {PracticeSessions} from './practice-sessions.js'
// Route authenticated and practice upgrades separately. The practice service
// keeps its own transport/session contract and remains independently runnable.
export function createPlatform(config:Config,options:{upstream:string;origins:string[];secret:string;store:TournamentStore;practiceSessions?:PracticeSessions;manual?:boolean;now?:()=>number}){
  const practice=createService(config,{upstream:options.upstream,origins:options.origins,manualTick:options.manual,practice:options.practiceSessions})
  const server=http.createServer((req,res)=>{
    req.headers['x-forwarded-host']=req.headers.host
    practice.server.emit('request',req,res)
  })
  server.on('upgrade',(req,socket,head)=>{
    if(req.url==='/snake-arena/tournament/socket')return
    practice.server.emit('upgrade',req,socket,head)
  })
  const competitions=attachTournaments(server,options)
  async function close(){await competitions.close();await practice.close();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))}
  return {server,practice,competitions,close}
}

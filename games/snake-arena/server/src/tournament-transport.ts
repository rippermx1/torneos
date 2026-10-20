import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import WebSocket,{WebSocketServer} from 'ws'
import {verifyTicket} from './ticket.js'
import {TournamentMatch} from './tournament.js'
import type {TournamentStore} from './tournament-store.js'
export function attachTournaments(server:Server,options:{store:TournamentStore;secret:string;origins:string[];now?:()=>number;manual?:boolean}){
  const worker=randomUUID(),epoch=Date.now()-performance.now(),now=options.now??(()=>epoch+performance.now())
  const matches=new Map<string,TournamentMatch>(),leases=new Map<string,number>(),sockets=new Set<WebSocket>()
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false})
  const send=(socket:WebSocket,data:unknown)=>{if(socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>256*1024)socket.close(1013,'slow_client');else socket.send(JSON.stringify(data))}}
  let polling=false,closed=false
  async function poll(){
    if(polling||closed)return;polling=true
    try{
      await options.store.recover()
      for(const [id,match] of matches){
        if(['completed','cancelled'].includes(match.state)){if(now()>match.ends+30000){matches.delete(id);leases.delete(id)};continue}
        if(!await options.store.heartbeat(id,worker)){match.state='cancelled';continue}
        leases.set(id,now()+10000)
        if(match.state==='finalizing'){await options.store.finish(id,worker,match.rows());match.state='completed'}
      }
      if(matches.size<8)for(const id of await options.store.pending()){
        if(matches.size>=8)break
        const definition=await options.store.claim(id,worker)
        if(definition){matches.set(id,new TournamentMatch(definition));leases.set(id,now()+10000)}
      }
    }catch{console.error('[snake-tournament] persistence unavailable; lease will cancel affected rounds')}
    finally{polling=false}
  }
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/snake-arena/tournament/socket')return
    if(!req.headers.origin||!options.origins.includes(req.headers.origin)||sockets.size>=160){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws))
  })
  const broadcast=new Map<WebSocket,{match:TournamentMatch;id:string;last:number}>()
  wss.on('connection',socket=>{
    sockets.add(socket);const opened=now();let window=opened,count=0
    socket.on('error',()=>{})
    socket.on('message',(raw,binary)=>{
      if(now()-window>=1000){window=now();count=0}
      if(++count>60){socket.close(1008,'rate_limit');return}
      let m:Record<string,unknown>
      try{m=JSON.parse(raw.toString())}catch{socket.close(1008,'invalid_json');return}
      const reject=(code:string)=>send(socket,{v:1,type:'error',code})
      if(binary||!m||typeof m!=='object'||m.v!==1){reject('invalid_message');return}
      let c=broadcast.get(socket)
      if(m.type==='join'&&!c){
        const ticket=verifyTicket(m.ticket,options.secret,now()),match=ticket&&matches.get(ticket.tournament)
        if(!ticket||!match||!match.connect(ticket.user)){reject('admission_denied');socket.close(1008,'admission_denied');return}
        c={match,id:ticket.user,last:now()};broadcast.set(socket,c)
        send(socket,{v:1,type:'welcome',id:c.id,room:match.definition.id,config:match.room.config});send(socket,match.snapshot(now()));return
      }
      if(!c){reject('join_required');return}
      if(m.type==='ping'&&Number.isSafeInteger(m.nonce)){c.last=now();send(socket,{v:1,type:'pong',nonce:m.nonce});return}
      if(m.type==='input'&&Number.isSafeInteger(m.seq)&&(m.seq as number)>=0&&typeof m.angle==='number'&&Number.isFinite(m.angle)&&Math.abs(m.angle)<=Math.PI+1e-6&&(m.boost===undefined||typeof m.boost==='boolean')){
        c.last=now();c.match.input(c.id,m.seq as number,Math.atan2(Math.sin(m.angle),Math.cos(m.angle)),m.boost===true);return
      }
      reject(m.type==='restart'?'one_life':'invalid_message')
    })
    socket.on('close',()=>{sockets.delete(socket);const c=broadcast.get(socket);if(c)c.match.disconnect(c.id,now());broadcast.delete(socket)})
    // Unauthenticated sockets cannot hold capacity indefinitely.
    const admission=setTimeout(()=>{if(!broadcast.has(socket))socket.close(1008,'join_timeout')},10000);admission.unref();socket.on('close',()=>clearTimeout(admission))
  })
  function tick(){for(const [id,match] of matches){if(!['completed','cancelled'].includes(match.state)&&now()> (leases.get(id)??0))match.state='cancelled';match.tick(now())}}
  function snapshots(){
    const cache=new Map<TournamentMatch,unknown>()
    for(const [socket,c] of broadcast){if(now()-c.last>15000){socket.close(1008,'idle');continue}
      if(!cache.has(c.match))cache.set(c.match,c.match.snapshot(now()));send(socket,cache.get(c.match))
      if(['completed','cancelled'].includes(c.match.state)){send(socket,{v:1,type:'competition_end',state:c.match.state});socket.close(1000,'round_closed')}
    }
  }
  const timers=options.manual?[]:[setInterval(tick,40),setInterval(snapshots,100),setInterval(()=>void poll(),2000)]
  if(!options.manual)void poll()
  async function close(){closed=true;timers.forEach(clearInterval);for(const socket of sockets)socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()))}
  return {matches,poll,tick,snapshots,close}
}

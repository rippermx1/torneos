import {randomUUID} from 'node:crypto'
import http from 'node:http'
import {performance} from 'node:perf_hooks'
import {connect} from 'node:net'
import WebSocket,{WebSocketServer} from 'ws'
import type {Config} from './config.js'
import {isAppearance,canUseAppearance} from './cosmetics.js'
import {Room,silent,type Log} from './room.js'
import {practiceRequest} from './local-host.js'
import {periodic} from './periodic.js'
import type {PracticeSessions,PracticeSession} from './practice-sessions.js'
import type {DailyProgress} from './daily-missions.js'
type Connection={id:string;socket:WebSocket;room?:Room;practice?:PracticeSession;origin:string;joining?:boolean;saveState?:string;last:number;opened:number;window:number;count:number;reported:boolean;snapshotBlockedAt?:number}
export function createService(config:Config,options:{upstream?:string;origins?:string[];log?:Log;random?:()=>number;manualTick?:boolean;practiceOnly?:boolean;diagnostics?:boolean;isolateDiagnostics?:boolean;practice?:PracticeSessions;onTick?:(sample:{stepMs:number;totalMs:number;intervalMs:number})=>void;onSnapshots?:(sample:{durationMs:number;maxBufferedBytes:number})=>void}={}){
  const log=options.log??silent,rooms=new Map<string,Room>(),connections=new Set<Connection>()
  const server=http.createServer((req,res)=>{
    if(req.url==='/snake-arena/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({mode:options.practice?'authenticated_and_guest_practice':'anonymous_local_practice',rooms:rooms.size,ccu:connections.size,maxPlayers:config.maxPlayers,maxRooms:config.maxRooms}));return}
    if((options.practiceOnly||options.diagnostics)&&!practiceRequest(req.method,req.url)){res.writeHead(403).end('Practice arena only');return}
    if(!options.upstream){res.writeHead(404).end();return}
    const upstream=new URL(options.upstream)
    const headers={...req.headers,host:upstream.host}
    if(options.diagnostics){delete headers['if-none-match'];delete headers['if-modified-since']}
    const began=performance.now()
    const proxy=http.request({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,headers},reply=>{
      const responseHeaders={...reply.headers}
      if(options.diagnostics){
        responseHeaders['cache-control']='no-store'
        if(options.isolateDiagnostics!==false){responseHeaders['cross-origin-opener-policy']='same-origin';responseHeaders['cross-origin-embedder-policy']='require-corp'}
        delete responseHeaders.etag;delete responseHeaders['last-modified']
        let bytes=0;reply.on('data',(chunk:Buffer)=>{bytes+=chunk.length})
        res.on('finish',()=>log('diagnostic_http',{path:new URL(req.url??'/',upstream).pathname,method:req.method,status:reply.statusCode,bytes,ms:performance.now()-began,cache:'no-store'}))
      }
      res.writeHead(reply.statusCode??502,responseHeaders);reply.pipe(res)
    })
    proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Next preview unavailable. Start npm run dev:games.');});req.pipe(proxy)
  })
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false})
  server.on('upgrade',(req,socket,head)=>{
    // Forward the existing local Next dev HMR socket; game sockets remain separate.
    if(!options.practiceOnly && !options.diagnostics && options.upstream && req.url?.startsWith('/_next/webpack-hmr') && req.headers.origin && options.origins?.includes(req.headers.origin)){
      const upstream=new URL(options.upstream),target=connect(Number(upstream.port),upstream.hostname,()=>{
        const headers={...req.headers,host:upstream.host,origin:upstream.origin}
        target.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)target.write(head);socket.pipe(target);target.pipe(socket)
      });target.on('error',()=>socket.destroy());socket.on('error',()=>target.destroy());socket.on('close',()=>target.destroy());return
    }
    if(req.url!=='/snake-arena/socket'){socket.destroy();return}
    if(!req.headers.origin || !(options.origins??[]).includes(req.headers.origin) || connections.size>=config.maxRooms*config.maxPlayers){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req))
  })
  const send=(c:Connection,data:unknown)=>{
    if(c.socket.readyState!==WebSocket.OPEN)return
    if(c.socket.bufferedAmount>256*1024){c.socket.close(1013,'slow_client');return}
    c.socket.send(typeof data==='string'?data:JSON.stringify(data))
  }
  const reject=(c:Connection,code:string)=>{send(c,{v:1,type:'error',code});log('input_anomaly',{player:c.id,code})}
  const welcome=(c:Connection,resumed=false)=>{send(c,{v:1,type:'welcome',id:c.id,room:c.room!.id,config,ack:c.room!.players.get(c.id)!.ack,authenticated:!!c.practice,resumed,...(c.practice?options.practice!.progress(c.practice):{})});send(c,c.room!.snapshot())}
  wss.on('connection',(socket,req)=>{
    const now=performance.now(),c:Connection={id:randomUUID(),socket,origin:req.headers.origin!,last:now,opened:now,window:now,count:0,reported:false};connections.add(c)
    socket.on('error',error=>log('socket_error',{player:c.id,error:error.message}))
    socket.on('message',async(raw,binary)=>{
      const now=performance.now();if(now-c.window>=1000){c.window=now;c.count=0}
      if(++c.count>60){socket.close(1008,'rate_limit');return}
      let m:Record<string,unknown>
      try{m=JSON.parse(raw.toString())}catch{reject(c,'invalid_json');return}
      if(binary || !m || typeof m!=='object' || Array.isArray(m) || m.v!==1){reject(c,'invalid_version');return}
      if(m.type==='authenticate' && c.practice && options.practice){const ticket=options.practice.consume(m.ticket,c.origin);if(!ticket||ticket.userId!==c.practice.userId){reject(c,'authentication_required');socket.close(1008,'authentication_required');return}options.practice.resume(c.practice,ticket);send(c,{v:1,type:'authenticated'});return}
      if(m.type==='join' && !c.room && !c.joining){
        if(m.appearance!==undefined&&!isAppearance(m.appearance)){reject(c,'invalid_appearance');return}
        c.joining=true
        let best=0,accountXp=0
        let daily:DailyProgress|undefined
        const signed=m.ticket!==undefined,ticket=signed?options.practice?.consume(m.ticket,c.origin):null
        if(signed&&!ticket){reject(c,'authentication_required');socket.close(1008,'authentication_required');return}
        if(ticket&&options.practice){
          options.practice.tick(removePractice)
          try{if(!options.practice.get(ticket.userId))[best,accountXp,daily]=await Promise.all([options.practice.best(ticket.userId),options.practice.xp(ticket.userId),options.practice.dailyProfile(ticket.userId)])}catch{reject(c,'practice_store_unavailable');socket.close(1013,'practice_store_unavailable');return}
          if(socket.readyState!==WebSocket.OPEN)return
          options.practice.tick(removePractice)
          if(ticket.leaseUntil<=options.practice.now()){reject(c,'authentication_required');socket.close(1008,'authentication_required');return}
          const session=options.practice.get(ticket.userId)
          if(session && session.leaseUntil>options.practice.now() && (session.detachedUntil===null||session.detachedUntil>options.practice.now())){
            for(const other of connections)if(other!==c&&other.practice===session){other.room=undefined;other.practice=undefined;other.socket.close(4001,'session_replaced')}
            c.id=session.playerId;c.room=session.room;c.practice=session;options.practice.resume(session,ticket);c.last=performance.now();welcome(c,true);return
          }
          if(m.resumeOnly===true){reject(c,'resume_expired');socket.close(4002,'resume_expired');return}
          if(!options.practice.canStart()){reject(c,'practice_store_busy');socket.close(1013,'practice_store_busy');return}
          m.name=ticket.name
        }else if(m.resumeOnly===true){reject(c,'authentication_required');socket.close(1008,'authentication_required');return}
        c.joining=false
        if(isAppearance(m.appearance)&&!canUseAppearance(m.appearance,ticket?accountXp:null)){reject(c,'appearance_locked');return}
        if(typeof m.name!=='string' || m.name.trim().length<1 || m.name.length>20){reject(c,'invalid_name');return}
        let room=[...rooms.values()].find(r=>r.players.size<config.maxPlayers)
        if(!room){if(rooms.size>=config.maxRooms){reject(c,'capacity');return}room=new Room(randomUUID(),config,options.random??Math.random,log);rooms.set(room.id,room);log('room_created',{room:room.id})}
        try{room.add(c.id,m.name.trim().replace(/[<>\x00-\x1f]/g,''),isAppearance(m.appearance)?m.appearance:'aurora');}catch{reject(c,'spawn_busy');if(!room.players.size)rooms.delete(room.id);return}
        c.room=room;if(ticket&&options.practice)c.practice=options.practice.attach(ticket,room,c.id,best,accountXp,daily);c.saveState=undefined;c.last=now;log('match_joined',{room:room.id,player:c.id});welcome(c);return
      }
      // Unity serializes float32 angles: +PI can be just above JavaScript's PI.
      if(m.type==='input' && (m.boost===undefined || typeof m.boost==='boolean') && c.room && Number.isSafeInteger(m.seq) && (m.seq as number)>=0 && typeof m.angle==='number' && Number.isFinite(m.angle) && Math.abs(m.angle)<=Math.PI+1e-6){c.last=now;c.room.input(c.id,m.seq as number,Math.atan2(Math.sin(m.angle),Math.cos(m.angle)),m.boost===true);return}
      if(m.type==='restart' && c.room){if(m.appearance!==undefined&&!isAppearance(m.appearance)){reject(c,'invalid_appearance');return}if(isAppearance(m.appearance)&&!canUseAppearance(m.appearance,c.practice?.accountXp??null)){reject(c,'appearance_locked');return}c.last=now;if(c.practice&&!options.practice!.canStart()){reject(c,'practice_store_busy');return}if(c.room.restart(c.id)){if(isAppearance(m.appearance))c.room.players.get(c.id)!.appearance=m.appearance;if(c.practice)options.practice!.restart(c.practice);c.reported=false;c.saveState=undefined;log('play_again',{room:c.room.id,player:c.id});send(c,c.room.snapshot())}else reject(c,'restart_unavailable');return}
      if(m.type==='ping' && Number.isSafeInteger(m.nonce)){if(c.room)c.last=now;send(c,{v:1,type:'pong',nonce:m.nonce});return}
      reject(c,'invalid_message')
    })
    socket.on('close',()=>{connections.delete(c);if(c.practice){options.practice!.detach(c.practice);return}if(c.room){log('disconnect',{room:c.room.id,player:c.id,sessionDuration:(performance.now()-c.opened)/1000});c.room.remove(c.id);if(!c.room.players.size){rooms.delete(c.room.id);log('room_closed',{room:c.room.id})}}})
  })
  let lastTickMs=0,lastSnapshot=0,previousTick=performance.now()
  function removePractice(s:PracticeSession){for(const c of connections)if(c.practice===s){send(c,{v:1,type:'error',code:'resume_expired'});c.practice=undefined;c.room=undefined;c.socket.close(4002,'resume_expired')}s.room.remove(s.playerId);if(!s.room.players.size)rooms.delete(s.room.id)}
  function tick(){const start=performance.now();for(const room of rooms.values())room.step();lastTickMs=performance.now()-start
    options.practice?.tick(removePractice)
    if(lastTickMs>1000/config.simulationHz)log('server_tick_over_budget',{tickMs:lastTickMs})
    for(const c of connections){const now=performance.now();if(now-c.last>30000 || (!c.room && now-c.opened>10000))c.socket.close(1008,'idle');const p=c.room?.players.get(c.id);if(p?.result && !c.reported){c.reported=true;send(c,{v:1,type:'result',...p.result,personalBest:Math.max(p.result.personalBest,c.practice?.best??0),saveState:c.practice?.saveState??'none'})}if(c.practice){const data={v:1,type:'persistence',state:c.practice.saveState,best:c.practice.best,...options.practice!.progress(c.practice)},key=JSON.stringify({...data,daily:data.daily?{...data.daily,serverNow:0}:undefined});if(c.saveState!==key){c.saveState=key;send(c,data)}}}
    options.onTick?.({stepMs:lastTickMs,totalMs:performance.now()-start,intervalMs:start-previousTick});previousTick=start
  }
  function snapshots(){const started=performance.now();for(const room of rooms.values()){
    const data=room.snapshot(lastTickMs),bytes=Buffer.byteLength(JSON.stringify(data))
    // The same authoritative snapshot is broadcast to every member of this room.
    const text=JSON.stringify({...data,metrics:{...data.metrics,snapshotBytes:bytes}})
    for(const c of connections)if(c.room===room){
      // A newer world replaces skipped snapshots: don't queue obsolete frames behind a blocked socket.
      // Results/auth/persistence still use send(); a sustained stall remains bounded and disconnects.
      if(c.socket.bufferedAmount>0){c.snapshotBlockedAt??=performance.now();if(performance.now()-c.snapshotBlockedAt>=5000)c.socket.close(1013,'slow_client');continue}
      c.snapshotBlockedAt=undefined;send(c,text)
    }
    if(performance.now()-lastSnapshot>10000)log('snapshot_size',{room:room.id,bytes,ccu:room.players.size})
  }if(performance.now()-lastSnapshot>10000)lastSnapshot=performance.now();options.onSnapshots?.({durationMs:performance.now()-started,maxBufferedBytes:Math.max(0,...[...connections].map(c=>c.socket.bufferedAmount))})}
  const timers=options.manualTick?[]:[periodic(1000/config.simulationHz,tick),periodic(1000/config.snapshotHz,snapshots)]
  async function close(){timers.forEach(stop=>stop());options.practice?.finish();for(const c of connections)c.socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()));if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))}
  return {server,rooms,connections,tick,snapshots,close}
}

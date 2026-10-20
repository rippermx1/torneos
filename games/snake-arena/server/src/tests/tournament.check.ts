import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import WebSocket from 'ws'
import {signTicket,verifyTicket} from '../ticket.js'
import {TournamentMatch,type MatchDefinition} from '../tournament.js'
import {attachTournaments} from '../tournament-transport.js'
import http from 'node:http'
const testServer=()=>{const server=http.createServer();return {server,close:async()=>{if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))}}}
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',secret='a'.repeat(64)
const definition:MatchDefinition={id,startsAt:new Date(100000).toISOString(),duration:60,maxPlayers:16,roster:[{id:user,name:'Uno'},{id:other,name:'Dos'}]}
test('tickets bind verified identity and competition, reject forgery and expiration',()=>{
 const token=signTicket({user,tournament:id,exp:150000,version:1},secret)
 assert.equal(verifyTicket(token,secret,100000)?.user,user)
 assert.equal(verifyTicket(token.replace(token[0],'x'),secret,100000),null)
 assert.equal(verifyTicket(token,'b'.repeat(64),100000),null)
 assert.equal(verifyTicket(token,secret,150000),null)
 assert.equal(verifyTicket(signTicket({user,tournament:id,exp:300001,version:1},secret),secret,100000),null)
})
test('common start, no input before start, one life, fixed deadline and every registrant ranked',()=>{
 const m=new TournamentMatch(definition);m.connect(user)
 assert.equal(Object.isFrozen(m.room.config),true);assert.equal(m.room.config.initialMass,12);assert.equal(m.room.config.resourceCount,240)
 const p=m.room.players.get(user)!,x=p.x
 assert.equal(m.input(user,0,Math.PI,false),false);m.tick(99999);assert.equal(p.x,x)
 m.tick(100000);assert.equal(m.state,'live');assert.equal(m.ended.get(other)?.reason,'no_show')
 assert.equal(m.connect(other),true);assert.equal(m.room.players.get(other)?.alive,false)
 p.x=1000;m.tick(100040);assert.equal(m.ended.get(user)?.reason,'wall')
 m.disconnect(user,100050);m.connect(user);assert.equal(p.alive,false);assert.equal(m.input(user,1,0,false),false)
 m.tick(160000);assert.equal(m.state,'finalizing');assert.equal(m.rows().length,2)
})
test('reconnect retains score, mass, position and life; disconnect grace never creates a new player',()=>{
 const m=new TournamentMatch(definition);m.connect(user);m.connect(other);m.tick(100000)
 const p=m.room.players.get(user)!;p.score=80;p.mass=20;p.ack=100
 m.disconnect(user,100001);const position={x:p.x,y:p.y}
 assert.equal(m.connect(user),true);assert.equal(m.connect(user),false)
 assert.deepEqual({x:p.x,y:p.y},position);assert.equal(p.score,80);assert.equal(p.mass,20);assert.equal(p.ack,-1)
 m.disconnect(user,100002);m.tick(110002);assert.equal(p.alive,false);assert.equal(m.ended.get(user)?.reason,'disconnect')
 m.connect(user);assert.equal(p.alive,false)
})
test('final results include survivors; timeout does not advance simulation or accept late inputs',()=>{
 const m=new TournamentMatch(definition);m.connect(user);m.connect(other);m.tick(100000)
 m.room.players.get(user)!.score=50;m.room.players.get(other)!.score=50;m.room.players.get(other)!.kills=2
 const tick=m.room.tick;m.tick(160050);assert.equal(m.room.tick,tick);assert.equal(m.input(user,3,0,false),false)
 assert.equal(m.rows()[0].id,other);assert.equal(m.rows()[0].survived_ms,60000);assert.equal(m.rows().length,2)
})
test('real transport requires signed registered identity; duplicate connections and restart rejected; result write retries',async()=>{
 let time=90000,claimed=false,writes=0,failWrite=true
 const service=testServer()
 const arena=attachTournaments(service.server,{secret,origins:['http://test.local'],manual:true,now:()=>time,store:{
  recover:async()=>{},pending:async()=>[id],claim:async()=>claimed?null:(claimed=true,definition),heartbeat:async()=>true,
  finish:async(_id,_worker,rows)=>{writes++;assert.equal(rows.length,2);if(failWrite)throw new Error('temporary failure')}
 }})
 await arena.poll();await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve))
 const address=service.server.address() as {port:number},url=`ws://127.0.0.1:${address.port}/snake-arena/tournament/socket`
 async function connect(token:string){const ws=new WebSocket(url,{origin:'http://test.local'});await once(ws,'open');const packet=once(ws,'message');ws.send(JSON.stringify({v:1,type:'join',ticket:token}));return {ws,message:JSON.parse(String((await packet)[0]))}}
 try{
  const invalid=await connect('fake');assert.equal(invalid.message.code,'admission_denied');invalid.ws.terminate()
  const outsider=await connect(signTicket({user:'33333333-3333-4333-8333-333333333333',tournament:id,exp:150000,version:1},secret));assert.equal(outsider.message.code,'admission_denied');outsider.ws.terminate()
  const token=signTicket({user,tournament:id,exp:150000,version:1},secret),valid=await connect(token);assert.equal(valid.message.id,user)
  const duplicate=await connect(token);assert.equal(duplicate.message.code,'admission_denied');duplicate.ws.terminate()
  // Initial snapshot may already be queued; wait specifically for one_life.
  const rejected=new Promise<Record<string,unknown>>(resolve=>valid.ws.on('message',raw=>{const p=JSON.parse(String(raw));if(p.code==='one_life')resolve(p)}));valid.ws.send(JSON.stringify({v:1,type:'restart'}));assert.equal((await rejected).code,'one_life')
  time=100000;arena.tick();for(time=100000;time<160000;time+=5000)await arena.poll();arena.tick();await arena.poll();assert.equal(arena.matches.get(id)?.state,'finalizing')
  failWrite=false;await arena.poll();assert.equal(arena.matches.get(id)?.state,'completed');assert.equal(writes,2)
  valid.ws.terminate()
 }finally{await arena.close();await service.close()}
})
test('loss of persistence lease cancels a round instead of publishing partial rankings',async()=>{
 let time=90000
 const service=testServer()
 const arena=attachTournaments(service.server,{secret,origins:[],manual:true,now:()=>time,store:{recover:async()=>{},pending:async()=>[id],claim:async()=>definition,heartbeat:async()=>false,finish:async()=>assert.fail('Must not persist an interrupted round')}})
 await arena.poll();time=100001;arena.tick();assert.equal(arena.matches.get(id)?.state,'cancelled');await arena.close();await service.close()
})

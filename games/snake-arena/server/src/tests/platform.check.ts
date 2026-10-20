import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {once} from 'node:events'
import WebSocket from 'ws'
import {createPlatform} from '../platform.js'
import {defaults} from '../config.js'
test('one platform host preserves Next origin and routes practice and competitive WebSockets separately',async()=>{
 const upstream=http.createServer((req,res)=>res.end(JSON.stringify({host:req.headers.host,forwarded:req.headers['x-forwarded-host']})))
 await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));const port=(upstream.address() as {port:number}).port
 const service=createPlatform(defaults,{upstream:`http://127.0.0.1:${port}`,origins:['http://test.local'],secret:'a'.repeat(64),manual:true,store:{pending:async()=>[],recover:async()=>{},claim:async()=>null,heartbeat:async()=>false,finish:async()=>{}}})
 await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));const target=(service.server.address() as {port:number}).port
 const sockets:WebSocket[]=[]
 try{
  const response=await fetch(`http://127.0.0.1:${target}/admin/tournaments`,{headers:{'x-forwarded-host':'forged'}});assert.equal((await response.json() as {forwarded:string}).forwarded,`127.0.0.1:${target}`)
  for(const [path,message,expected] of [['/snake-arena/socket',{v:1,type:'join',name:'Practice'},'welcome'],['/snake-arena/tournament/socket',{v:1,type:'join',ticket:'forged'},'error']] as const){
   const ws=new WebSocket(`ws://127.0.0.1:${target}${path}`,{origin:'http://test.local'});sockets.push(ws);await once(ws,'open');const packet=once(ws,'message');ws.send(JSON.stringify(message));assert.equal(JSON.parse(String((await packet)[0])).type,expected)
  }
 }finally{for(const ws of sockets)ws.terminate();await service.close();await new Promise<void>(resolve=>upstream.close(()=>resolve()))}
})

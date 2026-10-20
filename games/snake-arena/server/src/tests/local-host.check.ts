import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'
import {resolveLocalHost,practiceRequest} from '../local-host.js'
import {createService} from '../service.js'
import {defaults} from '../config.js'
import http from 'node:http'
test('LAN is opt in and bound to an assigned private address',()=>{
  assert.equal(resolveLocalHost(undefined,[]),'127.0.0.1')
  for(const ip of ['192.168.1.4','10.0.0.4','172.16.0.4'])assert.equal(resolveLocalHost(ip,[ip]),ip)
  for(const ip of ['0.0.0.0','8.8.8.8','192.168.1.9','172.32.0.4','localhost','::','192.168.1.4:3092'])assert.throws(()=>resolveLocalHost(ip,['192.168.1.4']))
})
test('LAN proxy permits arena and static files only',()=>{
  for(const path of ['/play/snake-arena','/play/snake-arena?_rsc=x','/_next/static/chunks/game.js','/games/snake-arena/snake-arena-005/index.html'])assert.ok(practiceRequest('GET',path))
  for(const path of ['/','/api/tournaments','/play/2048','/games/2048/a','/games/snake-arena/../../api/private','/_next/webpack-hmr'])assert.equal(practiceRequest('GET',path),false)
  assert.equal(practiceRequest('POST','/play/snake-arena'),false)
  assert.ok(practiceRequest('GET','/play/snake-arena/leaderboard'))
  assert.ok(practiceRequest('POST','/play/snake-arena/leaderboard'))
  assert.equal(practiceRequest('POST','/play/snake-arena/account'),false)
})
test('LAN rejects platform requests before proxying',{timeout:5000},async()=>{
  const service=createService(defaults,{practiceOnly:true,upstream:'http://127.0.0.1:1',manualTick:true})
  service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  const base=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`
  try{assert.equal((await fetch(base+'/api/tournaments')).status,403);assert.equal((await fetch(base+'/play/snake-arena',{method:'POST'})).status,403);assert.equal((await fetch(base+'/snake-arena/health')).status,200)}finally{await service.close()}
})
test('diagnostic proxy forces transfers, isolation and logging without changing normal proxy',{timeout:5000},async()=>{
  const upstream=http.createServer((req,res)=>{res.setHeader('ETag','"cached"');res.setHeader('Cache-Control','max-age=99999');if(req.headers['if-none-match'])res.writeHead(304).end();else res.end('fresh bytes')})
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
  const events:Record<string,unknown>[]=[]
  const service=createService(defaults,{upstream:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,diagnostics:true,manualTick:true,log:(event,data)=>events.push({event,...data})})
  service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const base=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`
    const res=await fetch(base+'/play/snake-arena',{headers:{'If-None-Match':'"cached"'}})
    assert.equal(res.status,200);assert.equal(await res.text(),'fresh bytes');assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('etag'),null);assert.equal(res.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(res.headers.get('cross-origin-embedder-policy'),'require-corp');assert.equal((await fetch(base+'/api/private')).status,403)
    assert.ok(events.some(e=>e.event==='diagnostic_http'&&e.bytes===11&&e.cache==='no-store'))
  }finally{await service.close()}
  const renderOnly=createService(defaults,{upstream:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,diagnostics:true,isolateDiagnostics:false,manualTick:true})
  renderOnly.server.listen(0,'127.0.0.1');await once(renderOnly.server,'listening')
  try{const res=await fetch(`http://127.0.0.1:${(renderOnly.server.address() as AddressInfo).port}/play/snake-arena`,{headers:{'If-None-Match':'"cached"'}});assert.equal(res.status,200);assert.equal(await res.text(),'fresh bytes');assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('cross-origin-opener-policy'),null);assert.equal(res.headers.get('cross-origin-embedder-policy'),null)}finally{await renderOnly.close()}
  const normal=createService(defaults,{upstream:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,manualTick:true})
  normal.server.listen(0,'127.0.0.1');await once(normal.server,'listening')
  try{const res=await fetch(`http://127.0.0.1:${(normal.server.address() as AddressInfo).port}/play/snake-arena`,{headers:{'If-None-Match':'"cached"'}});assert.equal(res.status,304);assert.equal(res.headers.get('cache-control'),'max-age=99999');assert.equal(res.headers.get('cross-origin-opener-policy'),null)}finally{await normal.close();await new Promise<void>(resolve=>upstream.close(()=>resolve()))}
})

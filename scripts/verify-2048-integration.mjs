// Read-only verification: raw HTTP bytes, compression, framing, host and preserved games.
import http from 'node:http'
import https from 'node:https'
import {createHash} from 'node:crypto'
import {gunzipSync} from 'node:zlib'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'

const base=new URL(process.argv[2]??'http://127.0.0.1:3081')
const registry=process.argv[3]
if(!registry)throw Error('Pass the explicit operative registry JSON as the second argument')
const catalog=spawnSync(process.execPath,[fileURLToPath(new URL('./check-game-builds.mjs',import.meta.url)),registry],{encoding:'utf8',windowsHide:true})
if(catalog.status!==0)throw Error(catalog.stderr)
const games=JSON.parse(catalog.stdout).games
assert.equal(games.find(game=>game.game==='2048')?.build,'unity-2048-007')
const expected=JSON.parse(readFileSync(new URL('../docs/2048-ACCESSIBILITY-EVIDENCE.json',import.meta.url),'utf8')).build_sha256
const checks=[]
function get(route,headers={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(route,base),request=(url.protocol==='https:'?https:http).get(url,{headers},response=>{
   const parts=[];let count=0
   response.on('data',chunk=>{count+=chunk.length;if(count>128*1024*1024){request.destroy(Error('Asset exceeds verification bound'));return}parts.push(chunk)})
   response.on('error',reject);response.on('end',()=>{const body=Buffer.concat(parts);resolve({status:response.statusCode,headers:response.headers,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),body})})
  })
  request.setTimeout(30000,()=>request.destroy(Error('HTTP timeout '+route)));request.on('error',reject)
 })
}
for(const route of ['/play','/play/ted-runner','/play/snake-arena','/play/factory-empire','/tournaments']){
 const result=await get(route);assert.equal(result.status,200,route);assert.equal(result.headers['x-frame-options'],'DENY',route)
 checks.push({route,status:200,framing:'DENY'})
 if(route==='/play'){
  const scripts=[...result.body.toString().matchAll(/<script[^>]+src="([^"?]+\.js)(?:[^" ]*)"/g)].map(match=>match[1]).filter(url=>url.startsWith('/_next/static/'))
  let bundle='';for(const script of scripts)bundle+=(await get(script)).body.toString()
  for(const marker of ['unity-2048-007','Consultar tablero','game.navigation','platform.focus'])assert.ok(bundle.includes(marker),'Host missing '+marker)
  assert.deepEqual([...new Set(bundle.match(/unity-2048-\d+/g))],['unity-2048-007'])
  checks.push({route,check:'host and capsule version synchronized',scripts:scripts.length})
 }
}
const alias=await get('/play/alien-run');assert.equal(alias.status,308);assert.equal(new URL(alias.headers.location,base).pathname,'/play/ted-runner')
checks.push({route:'/play/alien-run',status:308,destination:'/play/ted-runner'})
for(const game of games)for(const file of game.files){
 const route=`/games/${game.game}/${game.build}/${file.path}`,result=await get(route)
 assert.equal(result.status,200,route);assert.equal(result.bytes,file.bytes,route);assert.equal(result.sha256,file.sha256,route)
 if(game.game==='2048')assert.equal(result.sha256,expected[file.path],route)
 if(file.path==='index.html'){
  assert.equal(result.headers['x-frame-options'],'SAMEORIGIN',route)
  assert.ok(result.headers['content-security-policy']?.includes("frame-ancestors 'self'"),route)
  if(game.game==='2048'){assert.ok(result.body.toString().includes('game.navigation'));assert.ok(result.body.toString().includes('"unity-2048-007"'))}
 }
 const mime=result.headers['content-type']??''
 if(/\.wasm(\.gz)?$/.test(file.path))assert.ok(mime.startsWith('application/wasm'),route)
 if(/\.js(\.gz)?$/.test(file.path))assert.ok(/^(application|text)\/javascript/.test(mime),route)
 if(/\.data(\.gz)?$/.test(file.path))assert.ok(mime.startsWith('application/octet-stream'),route)
 let unpackedBytes
 if(file.path.endsWith('.gz')){
  assert.equal(result.headers['content-encoding'],'gzip',route)
  const unpacked=gunzipSync(result.body);unpackedBytes=unpacked.length;assert.ok(unpackedBytes>0,route)
  if(file.path.endsWith('.wasm.gz'))assert.equal(unpacked.subarray(0,4).toString('hex'),'0061736d',route)
 }
 checks.push({route,status:result.status,bytes:result.bytes,sha256:result.sha256,mime,encoding:result.headers['content-encoding'],unpackedBytes,framing:result.headers['x-frame-options']})
 if(game.game==='2048'&&file.path==='index.html'&&result.headers.etag){
  const warm=await get(route,{'If-None-Match':result.headers.etag});assert.equal(warm.status,304,route);assert.equal(warm.bytes,0)
  checks.push({route,status:304,check:'conditional cache revalidation'})
 }
}
const competition=await get('/games/snake-arena/competition/index.html');assert.equal(competition.status,200)
checks.push({route:'/games/snake-arena/competition/index.html',status:200})
const admin=await get('/admin');assert.equal(admin.status,307);assert.ok(admin.headers.location?.includes('/sign-in'))
checks.push({route:'/admin',status:307,check:'anonymous access remains protected'})
const health=await get('/snake-arena/health');assert.equal(health.status,200)
checks.push({route:'/snake-arena/health',status:200,health:JSON.parse(health.body.toString())})
console.log(JSON.stringify({at:new Date().toISOString(),base:base.origin,games:games.map(({game,build})=>({game,build})),checks},null,2))

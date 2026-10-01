import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {gunzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const base=new URL(process.argv[2]??'http://127.0.0.1:3080')
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) throw new Error('Local-only verification')
const [game,build]=process.argv.slice(3)
if(![game,build].every(x=>typeof x==='string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x))) throw new Error('Pass game and build')
const inventory=JSON.parse(fs.readFileSync(path.join(root,'artifacts',`published-${game}-${build}.json`),'utf8'))
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),checks=[]
for(const file of Object.keys(inventory.files)) {
  const response=await fetch(new URL(`/games/${game}/${build}/${file}`,base),{signal:AbortSignal.timeout(30000)})
  if(response.status!==200) throw new Error(`${file}: HTTP ${response.status}`)
  const bytes=fs.readFileSync(path.join(inventory.target,file)),expected=file.endsWith('.gz')?gunzipSync(bytes):bytes
  const received=new Uint8Array(await response.arrayBuffer())
  if(sha(received)!==sha(expected)) throw new Error(`HTTP body mismatch: ${file}`)
  const encoding=response.headers.get('content-encoding'),mime=response.headers.get('content-type')
  if(file.endsWith('.gz') && encoding!=='gzip') throw new Error(`Missing gzip header: ${file}`)
  if(/\.wasm(?:\.gz)?$/.test(file) && !mime?.includes('application/wasm')) throw new Error(`Wrong wasm MIME: ${mime}`)
  if(/\.js(?:\.gz)?$/.test(file) && !mime?.includes('javascript')) throw new Error(`Wrong script MIME: ${mime}`)
  if(file==='index.html' && response.headers.get('x-frame-options')!=='SAMEORIGIN') throw new Error('Unity framing failed')
  checks.push({file,status:response.status,encoding,mime,bytes_match:true})
}
const protectedPage=await fetch(new URL('/play',base),{method:'HEAD',signal:AbortSignal.timeout(30000)})
if(protectedPage.headers.get('x-frame-options')!=='DENY') throw new Error('App framing was relaxed')
fs.writeFileSync(path.join(root,'artifacts',`http-${game}-${build}.json`),JSON.stringify({base:base.origin,game,build,checks,app_framing:'DENY'},null,2)+'\n')
console.log(JSON.stringify({game,build,verified_files:checks.length,app_framing:'DENY'}))

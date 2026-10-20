import {loadConfig} from './config.js'
import {createService} from './service.js'
import {resolveLocalHost} from './local-host.js'
import {PracticeSessions} from './practice-sessions.js'
import {restPracticeStore} from './practice-store.js'
import {fileURLToPath} from 'node:url'
const host=resolveLocalHost(process.env.SNAKE_BIND_HOST)
const diagnostics=process.env.SNAKE_DIAGNOSTICS==='1'
const isolateDiagnostics=process.env.SNAKE_MEMORY_ISOLATION!=='0'
if(diagnostics&&host!=='127.0.0.1')throw new Error('Diagnostics requires loopback secure context')
const port=Number(process.env.SNAKE_PORT??3090)
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port')
const config=loadConfig(process.env.SNAKE_CONFIG??new URL('../config.json',import.meta.url))
const log=(event:string,data:Record<string,unknown>)=>console.log(JSON.stringify({time:new Date().toISOString(),event,...data}))
const upstream=process.env.SNAKE_NEXT_URL??'http://127.0.0.1:3080',nextUrl=new URL(upstream)
if(nextUrl.protocol!=='http:' || !['127.0.0.1','localhost'].includes(nextUrl.hostname) || !nextUrl.port)throw new Error('Use an explicit local HTTP Next preview')
const secret=process.env.SNAKE_PRACTICE_SECRET
const practice=secret?new PracticeSessions(secret,restPracticeStore(process.env.SUPABASE_SERVER_URL??'',process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY??''),Date.now,log,15000,process.env.SNAKE_PRACTICE_OUTBOX??fileURLToPath(new URL(`../../../../artifacts/snake-arena/practice-outbox-${port}/`,import.meta.url))):undefined
const service=createService(config,{upstream,origins:host==='127.0.0.1'?[`http://127.0.0.1:${port}`,`http://localhost:${port}`]:[`http://${host}:${port}`],practiceOnly:host!=='127.0.0.1',diagnostics,isolateDiagnostics,practice,log})
service.server.listen(port,host,()=>log('server_ready',{url:`http://${host}:${port}/play/snake-arena`,mode:practice?'authenticated_and_guest_practice':'anonymous_local_practice'}))
process.on('SIGINT',()=>void service.close());process.on('SIGTERM',()=>void service.close())

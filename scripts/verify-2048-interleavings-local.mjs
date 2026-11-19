// Same operative image, isolated Next process; faults only affect owned local fixtures.
import fs from 'node:fs/promises'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import assert from 'node:assert/strict'
const dir='artifacts/2048-competitive/',base='http://127.0.0.1:3084',name='g2048044-faults'
const env=Object.fromEntries((await fs.readFile('.env.local-stack','utf8')).split(/\r?\n/).filter(line=>/^[A-Z_0-9]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]))
assert.equal(env.TORNEOS_LOCAL_MODE,'1');assert.equal(env.CONFIRM_SUPABASE_PROJECT_REF,'local');assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');assert.equal(env.APP_URL,'http://127.0.0.1:3081')
const manifest=JSON.parse(await fs.readFile(dir+'manifest.json','utf8')),accounts=JSON.parse(await fs.readFile(dir+'credentials.private.json','utf8'));assert.equal(manifest.task,'G2048-04.4')
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=async query=>{const r=await query;if(r.error)throw Error(r.error.message);return r.data}
// execFile's default error includes argv, which can contain private runtime env.
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,windowsHide:true,maxBuffer:5*1024*1024,stdio:['pipe','pipe','pipe']})}catch{throw Error('Docker operation failed: '+args[0]+' (arguments omitted)')}}
const operative=JSON.parse(docker(['inspect','torneos-app-1']))[0]
assert.equal(operative.State.Health.Status,'healthy')
const integrated=process.argv.includes('--integrated')
const candidate=integrated||process.argv.includes('--candidate')?JSON.parse(await fs.readFile(dir+'candidate.json','utf8')):null
if(candidate){assert.equal(candidate.task,manifest.task);assert.equal(integrated?candidate.imageId:candidate.baseline,operative.Image);assert.ok(candidate.image.startsWith('torneos-app:g2048-044-candidate-'))}
else assert.ok(operative.Config.Image.includes('g2048-007'))
if(integrated)assert.ok(candidate.dbMigrationApplied&&candidate.deployedTo3081)
const image=candidate?.image??operative.Config.Image,suffix=integrated?'Fixed':candidate?'Candidate':'',reportFile=integrated?'interleavings-fixed.json':candidate?'interleavings-candidate.json':'interleavings.json'
const report={task:manifest.task,image:candidate?.imageId??operative.Image,at:new Date().toISOString(),checks:[],trace:[],dbMigrationApplied:integrated}
const ownedGames=new Set();let holdGame,releaseHeld,heldReady,failGame,startBarrier,barrierReplies=[]
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const proxy=http.createServer(async(req,res)=>{
 try{
  assert.ok(['/rest/v1/','/auth/v1/'].some(prefix=>req.url.startsWith(prefix)))
  const parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts),payload=body.length?JSON.parse(body.toString()):{}
  const forward=()=>new Promise((resolve,reject)=>{
   const upstream=http.request('http://127.0.0.1:54321'+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:54321'}},reply=>{
    const chunks=[];reply.on('data',chunk=>chunks.push(chunk));reply.on('end',()=>resolve({status:reply.statusCode,headers:reply.headers,body:Buffer.concat(chunks)}))
   });upstream.on('error',reject);upstream.end(body)
  })
  const send=r=>{res.writeHead(r.status,r.headers);res.end(r.body)}
  if(req.url.startsWith('/rest/v1/rpc/record_game_move')&&payload.p_game_id===holdGame){assert.ok(ownedGames.has(holdGame));report.trace.push({event:'movement paused before real RPC',gameId:holdGame});heldReady();await new Promise(resolve=>{releaseHeld=resolve});send(await forward());return}
  if(req.method==='PATCH'&&req.url.startsWith('/rest/v1/games?')&&req.url.includes('id=eq.'+failGame)&&payload.status==='completed'){
   assert.ok(ownedGames.has(failGame));report.trace.push({event:'closure persistence transport rejected',gameId:failGame});failGame=undefined;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'PGRST000',message:'Isolated G2048 fixture fault'}));return
  }
  if(startBarrier&&req.method==='GET'&&req.url.startsWith('/rest/v1/games?')&&req.url.includes('tournament_id=eq.'+startBarrier)){
   const result=await forward();barrierReplies.push(()=>send(result));if(barrierReplies.length===2){report.trace.push({event:'two initial game reads completed before either INSERT',tournamentId:startBarrier});startBarrier=undefined;barrierReplies.forEach(reply=>reply())}return
  }
  send(await forward())
 }catch{if(!res.headersSent)res.writeHead(502);res.end()}
})
await new Promise(resolve=>proxy.listen(6011,'0.0.0.0',resolve))
let created=false
try{
 const appEnv=operative.Config.Env.filter(value=>!value.startsWith('SUPABASE_SERVER_URL=')&&!value.startsWith('PORT=')&&!value.startsWith('HOSTNAME=')&&!value.startsWith('APP_URL='))
 const args=['run','-d','--name',name,'--network','torneos_default','--entrypoint','node','-p','127.0.0.1:3084:3000']
 for(const value of [...appEnv,'SUPABASE_SERVER_URL=http://host.docker.internal:6011','PORT=3000','HOSTNAME=0.0.0.0','APP_URL='+base])args.push('-e',value)
 docker([...args,image,'server.js']);created=true
 if(integrated)docker(['network','connect','supabase_network_torneos',name])
 let ready=false;for(let i=0;i<30&&!ready;i++){try{ready=(await fetch(base+'/sign-in')).status===200}catch{}if(!ready)await wait(300)}assert.ok(ready,'Isolated Next did not start')
 const cookies=[]
 for(const account of accounts){const jar=new Map(),auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(value=>jar.set(value.name,value.value))}});const signed=await auth.auth.signInWithPassword({email:account.email,password:account.password});assert.ifError(signed.error);cookies.push([...jar].map(([name,value])=>name+'='+value).join('; '))}
 async function request(owner,path,body={}){const r=await fetch(base+path,{method:'POST',redirect:'manual',headers:{cookie:cookies[owner],'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});return {status:r.status,data:await r.json()}}
 const route=(f,action)=>`/api/tournaments/${f.id}/game/${action}`
 async function fixture(key,owner){
  key+=suffix;assert.ok(!manifest.tournaments[key],'Interleaving fixtures already exist; inspect previous report')
  const source=await checked(admin.from('tournaments').select('*').eq('id',manifest.tournaments.race.id).single()),id=randomUUID(),now=Date.now()
  const copy={...source};delete copy.created_at;await checked(admin.from('tournaments').insert({...copy,id,name:'G2048-04.4 '+key+' '+now,status:'open',play_window_start:new Date(now+3600000).toISOString(),play_window_end:new Date(now+7200000).toISOString()}))
  const f={id,owner,duration:copy.max_game_duration_seconds};manifest.tournaments[key]=f;await fs.writeFile(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n')
  assert.equal((await request(owner,`/api/tournaments/${id}/register`)).status,200);await checked(admin.from('tournaments').update({status:'live',play_window_start:new Date(now-1000).toISOString()}).eq('id',id).eq('is_test',true));return f
 }
 const duplicate=await fixture('barrierStart',1);startBarrier=duplicate.id
 const starts=await Promise.all([request(1,route(duplicate,'start')),request(1,route(duplicate,'start'))]);const rows=await checked(admin.from('games').select('id').eq('tournament_id',duplicate.id));assert.equal(rows.length,1)
 report.checks.push({name:'simultaneous start with initial read barrier',status:starts.every(r=>r.status===200&&r.data.gameId===rows[0].id)?'PASS':'FAIL',httpStatuses:starts.map(r=>r.status),gameId:rows[0].id,errors:starts.filter(r=>r.status!==200).map(r=>r.data.error)})
 const persistence=await fixture('persistenceFailure',2),started=await request(2,route(persistence,'start'));assert.equal(started.status,200);ownedGames.add(started.data.gameId)
 await checked(admin.from('games').update({started_at:new Date(Date.now()-31000).toISOString()}).eq('id',started.data.gameId).eq('status','active'));failGame=started.data.gameId
 const rejected=await request(2,route(persistence,'timeout'),{gameId:started.data.gameId}),active=await checked(admin.from('games').select('status').eq('id',started.data.gameId).single())
 assert.equal(rejected.status,503);assert.equal(rejected.data.code,'GAME_CLOSURE_UNCONFIRMED');assert.equal(active.status,'active')
 const recovered=await request(2,route(persistence,'start'),{recoverOnly:true,gameId:started.data.gameId});assert.equal(recovered.status,200);assert.equal(recovered.data.status,'completed')
 report.checks.push({name:'failed closure does not fabricate terminal state, read recovery closes later',status:'PASS',gameId:started.data.gameId,errorCode:rejected.data.code,recoveredStatus:recovered.data.status})
 const race=await fixture('closureRace',2),game=await request(2,route(race,'start'));assert.equal(game.status,200);ownedGames.add(game.data.gameId)
 await checked(admin.from('games').update({started_at:new Date(Date.now()-26000).toISOString(),current_board:[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],final_score:16}).eq('id',game.data.gameId).eq('status','active'))
 const held=new Promise(resolve=>{heldReady=resolve});holdGame=game.data.gameId
 const moving=request(2,route(race,'move'),{gameId:game.data.gameId,direction:'left',moveNumber:2,clientTimestamp:Date.now()})
 await Promise.race([held,wait(8000).then(()=>{throw Error('RPC hold not reached')})]);await wait(4500)
 const closed=await request(2,route(race,'timeout'),{gameId:game.data.gameId});assert.equal(closed.status,200);assert.equal(closed.data.status,'completed');report.trace.push({event:'timeout confirmed before releasing move',score:closed.data.score,gameId:game.data.gameId});holdGame=undefined;releaseHeld()
 const moved=await moving,persisted=await checked(admin.from('games').select('status,final_score,move_count,end_reason').eq('id',game.data.gameId).single())
 report.checks.push({name:'in-flight movement must not mutate confirmed timeout',status:persisted.final_score===closed.data.score&&persisted.move_count===closed.data.moveCount&&(!integrated||moved.status===400&&moved.data.gameOver&&moved.data.stateConfirmed)?'PASS':'FAIL',gameId:game.data.gameId,confirmedTimeout:{score:closed.data.score,moveCount:closed.data.moveCount},movementResponse:{status:moved.status,score:moved.data.score,gameOver:moved.data.gameOver,stateConfirmed:moved.data.stateConfirmed},persisted})
 if(integrated){
  const f=await fixture('finalizationRace',2),g=await request(2,route(f,'start'));assert.equal(g.status,200);ownedGames.add(g.data.gameId)
  await checked(admin.from('games').update({current_board:[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],final_score:16}).eq('id',g.data.gameId).eq('status','active'))
  const heldFinal=new Promise(resolve=>{heldReady=resolve});holdGame=g.data.gameId
  const pending=request(2,route(f,'move'),{gameId:g.data.gameId,direction:'left',moveNumber:2,clientTimestamp:Date.now()})
  await Promise.race([heldFinal,wait(8000).then(()=>{throw Error('Finalization hold not reached')})])
  await checked(admin.from('tournaments').update({status:'finalizing'}).eq('id',f.id).eq('is_test',true));await checked(admin.rpc('finalize_tournament',{p_tournament_id:f.id}))
  const result=await checked(admin.from('tournament_results').select('final_score,rank').eq('tournament_id',f.id).eq('user_id',manifest.accounts[2].id).single());assert.equal(result.final_score,16)
  holdGame=undefined;releaseHeld();const response=await pending,state=await checked(admin.from('games').select('final_score,status,move_count').eq('id',g.data.gameId).single())
  const moves=await checked(admin.from('game_moves').select('move_number').eq('game_id',g.data.gameId));assert.equal(moves.length,0)
  report.checks.push({name:'pending direction cannot change officially finalized ranking',status:response.status===400&&response.data.stateConfirmed&&state.final_score===result.final_score?'PASS':'FAIL',gameId:g.data.gameId,tournamentId:f.id,result,persisted:state,movementStatus:response.status,movementsInserted:moves.length})
 }
 await fs.writeFile(dir+reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.checks.some(check=>check.status==='FAIL')?1:0
}finally{
 if(releaseHeld)releaseHeld();barrierReplies.forEach(reply=>{try{reply()}catch{}})
 if(created){await fs.writeFile(dir+'isolated-app.log',docker(['logs',name]));docker(['rm','-f',name])}
 await new Promise(resolve=>proxy.close(resolve))
}

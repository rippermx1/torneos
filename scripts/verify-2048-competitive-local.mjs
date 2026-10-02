// Bounded local fixtures only. Never reseeds accounts, resets data or calls global cron.
import fs from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import ts from 'typescript'
assert.ok(['prepare','api','api-fixed','activate-browser','shorten-browser','state','finalize-owned'].includes(process.argv[2]),'Choose prepare/api/api-fixed/activate-browser/shorten-browser/state/finalize-owned')
const dir='artifacts/2048-competitive/',base='http://127.0.0.1:3081'
await fs.mkdir(dir,{recursive:true})
const env=Object.fromEntries((await fs.readFile('.env.local-stack','utf8')).split(/\r?\n/).filter(line=>/^[A-Z_0-9]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]))
assert.equal(env.TORNEOS_LOCAL_MODE,'1');assert.equal(env.CONFIRM_SUPABASE_PROJECT_REF,'local');assert.equal(env.APP_URL,base);assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321')
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const save=(name,value)=>fs.writeFile(dir+name,JSON.stringify(value,null,2)+'\n')
const read=async name=>JSON.parse(await fs.readFile(dir+name,'utf8'))
const checked=async query=>{const response=await query;if(response.error)throw Error(response.error.message);return response.data}
async function sign(account){
 const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:cookies=>cookies.forEach(cookie=>jar.set(cookie.name,cookie.value))}})
 const signed=await client.auth.signInWithPassword({email:account.email,password:account.password});if(signed.error)throw Error(signed.error.message);assert.equal(signed.data.user.id,account.id)
 return [...jar].map(([name,value])=>name+'='+value).join('; ')
}
async function request(cookie,path,body={},target=base){const response=await fetch(target+path,{method:'POST',redirect:'manual',headers:{cookie,'Content-Type':'application/json',origin:target},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():{redirect:response.headers.get('location')}}}
const gamePath=(id,action)=>`/api/tournaments/${id}/game/${action}`
const row=async id=>checked(admin.from('games').select('id,status,current_board,final_score,move_count,started_at,ended_at,end_reason').eq('id',id).single())
function same(snapshot,persisted){assert.equal(snapshot.gameId,persisted.id);assert.equal(snapshot.score,persisted.final_score);assert.deepEqual(snapshot.board,persisted.current_board);if(snapshot.moveNumber!==undefined)assert.equal(snapshot.moveNumber,persisted.move_count+2)}
async function run(){
let manifest
if(process.argv[2]==='prepare'){
 try{await fs.access(dir+'manifest.json');throw Error('Existing fixtures: continue them instead of creating duplicates')}catch(error){if(error.code!=='ENOENT')throw error}
 const stamp=Date.now(),password=randomBytes(24).toString('base64url')+'!aA1'
 manifest={task:'G2048-04.4',createdAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),accounts:[],tournaments:{}}
 await save('manifest.json',manifest)
 for(let i=0;i<3;i++){
  const email=`g2048044.${stamp}.${i}@example.com`,username=`g2048044_${i}_${String(stamp).slice(-6)}`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});if(created.error)throw Error(created.error.message)
  const account={id:created.data.user.id,email,username};manifest.accounts.push(account);await save('manifest.json',manifest)
  await checked(admin.from('profiles').update({username,birth_date:'1990-01-01',terms_accepted_at:new Date().toISOString(),terms_version:'1.3'}).eq('id',account.id))
  const roles=await checked(admin.from('profile_roles').select('role').eq('profile_id',account.id));assert.ok(roles.some(role=>role.role==='user'))
 }
 await save('credentials.private.json',manifest.accounts.map(account=>({...account,password})))
 for(const [name,duration,owner] of [['journey',300,0],['parallelStart',300,1],['noMoves',300,1],['deadline',30,2],['race',30,2],['browser',300,0]]){
  const id=randomUUID(),start=Date.now()+3600000,end=start+7200000
  const tournament={id,name:`G2048-04.4 ${name} ${stamp}`,description:'Fixture local identificada. Sin cobros reales. No es un torneo público.',game_type:'2048_score',tournament_type:'freeroll',is_test:true,preset_key:'internal_test_v1',business_rule_version:2,entry_fee_cents:0,prize_1st_cents:100,prize_2nd_cents:0,prize_3rd_cents:0,min_players:1,max_players:3,max_game_duration_seconds:duration,registration_opens_at:new Date(Date.now()-60000).toISOString(),play_window_start:new Date(start).toISOString(),play_window_end:new Date(end).toISOString(),status:'open'}
  await checked(admin.from('tournaments').insert(tournament));manifest.tournaments[name]={id,name:tournament.name,owner,duration};await save('manifest.json',manifest)
 }
 const runtime=await fetch(base+'/games/2048/unity-2048-007/index.html');assert.equal(runtime.status,200)
 console.log(JSON.stringify({task:manifest.task,accounts:manifest.accounts.map(({id,username})=>({id,username})),tournaments:manifest.tournaments}))
 return
}
manifest=await read('manifest.json');assert.equal(manifest.task,'G2048-04.4')
const credentials=await read('credentials.private.json'),cookies=await Promise.all(credentials.map(sign))
async function activate(fixture){const id=fixture.id;assert.ok(Object.values(manifest.tournaments).some(t=>t.id===id));await checked(admin.from('tournaments').update({status:'live',play_window_start:new Date(Date.now()-1000).toISOString()}).eq('id',id).eq('is_test',true))}
if(process.argv[2]==='activate-browser'){await activate(manifest.tournaments.browser);console.log(JSON.stringify(manifest.tournaments.browser));return}
if(process.argv[2]==='shorten-browser'){
 const f=manifest.tournaments.browser,g=await checked(admin.from('games').select('id,status').eq('tournament_id',f.id).eq('user_id',manifest.accounts[f.owner].id).single());assert.equal(g.status,'active')
 await checked(admin.from('games').update({started_at:new Date(Date.now()-(f.duration-30)*1000).toISOString()}).eq('id',g.id).eq('status','active'));console.log(JSON.stringify({gameId:g.id,fixtureClockAdjustment:true,remainingSeconds:30}));return
}
if(process.argv[2]==='state'){const games=await checked(admin.from('games').select('id,tournament_id,user_id,status,final_score,move_count,current_board,end_reason,ended_at').in('tournament_id',Object.values(manifest.tournaments).map(t=>t.id)));await save('database-state.json',games);console.log(JSON.stringify({games:games.length,active:games.filter(g=>g.status==='active').length,completed:games.filter(g=>g.status==='completed').length,evidence:dir+'database-state.json'}));return}
if(process.argv[2]==='finalize-owned'){
 const results=[]
 for(const name of ['browser','noMoves','deadline','fixedJourney','fixedNoMoves'].filter(name=>manifest.tournaments[name])){
  const f=manifest.tournaments[name],t=await checked(admin.from('tournaments').select('id,status,is_test,name').eq('id',f.id).single())
  assert.ok(t.is_test&&t.name.startsWith('G2048-04.4 '))
  const game=await checked(admin.from('games').select('id,status,final_score,user_id').eq('tournament_id',f.id).eq('user_id',manifest.accounts[f.owner].id).single());assert.equal(game.status,'completed')
  if(t.status!=='completed'){
   await checked(admin.from('tournaments').update({status:'finalizing'}).eq('id',f.id).eq('is_test',true).eq('status','live'))
   await checked(admin.rpc('finalize_tournament',{p_tournament_id:f.id}))
  }
  const result=await checked(admin.from('tournament_results').select('tournament_id,user_id,rank,final_score,prize_awarded_cents').eq('tournament_id',f.id).eq('user_id',game.user_id).single())
  assert.equal(result.final_score,game.final_score);assert.equal(result.rank,1)
  results.push({name,status:'PASS',gameId:game.id,result,prize:'local simulated fixture only'})
 }
 await save('ranking-checks.json',{task:manifest.task,at:new Date().toISOString(),checks:results});console.log(JSON.stringify(results));return
}
// Use the installed TypeScript compiler; no additional runtime dependency.
const emitted=new Map()
async function compile(file){
 const absolute=path.resolve(file),output=path.resolve(dir,'modules',path.relative(process.cwd(),absolute).replace(/\.(ts|json)$/,'.mjs'))
 if(emitted.has(absolute))return output;emitted.set(absolute,output)
 const input=await fs.readFile(absolute,'utf8')
 let text=file.endsWith('.json')?'export default '+input+';':ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 for(const match of [...text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]){
  const imported=path.resolve(path.dirname(absolute),match[1]),source=imported.endsWith('.json')?imported:imported+'.ts'
  const dependency=await compile(source),relative=path.relative(path.dirname(output),dependency).replaceAll('\\','/')
  text=text.replace(match[0],match[0].replace(match[1],relative.startsWith('.')?relative:'./'+relative))
 }
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,text);return output
}
for(const [source,name] of [['lib/game/engine.ts','engine'],['lib/game/rng.ts','rng'],['lib/game/unity-2048-session.ts','session']]){
 const output=await compile(source),relative=path.relative(path.resolve(dir),output).replaceAll('\\','/');await fs.writeFile(dir+name+'.mjs',`export * from './${relative}';\n`)
}
const {Game2048}=await import('../'+dir+'engine.mjs'),{DeterministicRNG}=await import('../'+dir+'rng.mjs'),{Unity2048Session}=await import('../'+dir+'session.mjs')
if(process.argv[2]==='api-fixed'){
 const checks=[]
 async function fresh(name,owner,duration){
  assert.ok(!manifest.tournaments[name],'Inspect existing fixed fixture rather than restarting it')
  const source=await checked(admin.from('tournaments').select('*').eq('id',manifest.tournaments.race.id).single()),copy={...source};delete copy.created_at
  const id=randomUUID(),now=Date.now(),f={id,owner,duration}
  await checked(admin.from('tournaments').insert({...copy,id,name:'G2048-04.4 '+name+' '+now,status:'open',max_game_duration_seconds:duration,play_window_start:new Date(now+3600000).toISOString(),play_window_end:new Date(now+7200000).toISOString()}))
  manifest.tournaments[name]=f;await save('manifest.json',manifest)
  assert.equal((await request(cookies[owner],`/api/tournaments/${id}/register`)).status,200);await activate(f)
  const start=await request(cookies[owner],gamePath(id,'start'));assert.equal(start.status,200,JSON.stringify(start.data));f.gameId=start.data.gameId;await save('manifest.json',manifest);same(start.data,await row(f.gameId));return {f,g:start.data}
 }
 const journey=await fresh('fixedJourney',1,120);let g=journey.g
 const repeated=await request(cookies[1],gamePath(journey.f.id,'start'));assert.equal(repeated.data.gameId,g.gameId)
 checks.push({name:'new authenticated registration and explicit start on corrected 3081',status:'PASS',gameId:g.gameId})
 for(const direction of ['left','up','right','down']){
  await new Promise(resolve=>setTimeout(resolve,150))
  const response=await request(cookies[1],gamePath(journey.f.id,'move'),{gameId:g.gameId,direction,moveNumber:g.moveNumber,clientTimestamp:Date.now(),score:999999});assert.equal(response.status,200,JSON.stringify(response.data));if(response.data.moved)g={...g,...response.data};same(g,await row(g.gameId))
 }
 assert.notEqual(g.score,999999);checks.push({name:'corrected RPC accepts valid directions and server score',status:'PASS',gameId:g.gameId,score:g.score,moveCount:g.moveNumber-2})
 const denied=await request(cookies[0],gamePath(journey.f.id,'move'),{gameId:g.gameId,direction:'left',moveNumber:g.moveNumber,clientTimestamp:Date.now()});assert.equal(denied.status,404)
 checks.push({name:'ownership remains enforced after integration',status:'PASS',foreignMoveStatus:denied.status})
 const final=await fresh('fixedNoMoves',0,120),seed=(await checked(admin.from('games').select('seed').eq('id',final.f.gameId).single())).seed
 const board=[[4,8,16,32],[64,128,256,512],[1024,2,4,8],[16,32,64,0]];let direction
 for(const d of ['down','right']){const engine=new Game2048(board,128);const moved=engine.applyMove(d,new DeterministicRNG(seed,2));if(moved.moved&&!engine.canMove())direction=d}assert.ok(direction)
 await checked(admin.from('games').update({current_board:board,final_score:128,highest_tile:1024}).eq('id',final.f.gameId).eq('status','active'))
 const terminal=await request(cookies[0],gamePath(final.f.id,'move'),{gameId:final.f.gameId,direction,moveNumber:2,clientTimestamp:Date.now()});assert.equal(terminal.status,200);assert.equal(terminal.data.endReason,'no_moves');assert.equal(terminal.data.score,128);same(terminal.data,await row(final.f.gameId))
 checks.push({name:'corrected RPC commits no_moves with persisted final snapshot',status:'PASS',gameId:final.f.gameId,score:128})
 await save('api-fixed.json',{task:manifest.task,at:new Date().toISOString(),base,checks});console.log(JSON.stringify(checks));return
}
let report;try{report=await read('api-checks.json')}catch(error){if(error.code!=='ENOENT')throw error;report={task:manifest.task,at:new Date().toISOString(),checks:[]}}
async function check(name,run){if(report.checks.some(check=>check.name===name&&check.status==='PASS'))return;report.checks=report.checks.filter(check=>check.name!==name);try{report.checks.push({name,status:'PASS',...await run()})}catch(error){report.checks.push({name,status:'FAIL',error:error.message})}await save('api-checks.json',report)}
async function registered(name){const f=manifest.tournaments[name],cookie=cookies[f.owner];const registered=await request(cookie,`/api/tournaments/${f.id}/register`);assert.equal(registered.status,200,JSON.stringify(registered.data));await activate(f);return {f,cookie}}
async function move(cookie,f,g,direction,extra={}){return request(cookie,gamePath(f.id,'move'),{gameId:g.gameId,direction,moveNumber:g.moveNumber,clientTimestamp:Date.now(),...extra})}
await check('anonymous and unregistered authorization',async()=>{const f=manifest.tournaments.journey,a=await request('',gamePath(f.id,'start')),b=await request(cookies[2],gamePath(f.id,'start'));assert.ok(a.status===401||a.status===307&&a.data.redirect?.includes('/sign-in'));assert.equal(b.status,403);return {anonymous:a.status,unregistered:b.status}})
await check('registration, explicit start and repeated start recover same game',async()=>{const {f,cookie}=await registered('journey');const response=await request(cookie,gamePath(f.id,'start'));assert.equal(response.status,200);manifest.tournaments.journey.gameId=response.data.gameId;await save('manifest.json',manifest);const repeated=await request(cookie,gamePath(f.id,'start'));assert.equal(repeated.status,200);assert.equal(repeated.data.gameId,response.data.gameId);same(response.data,await row(response.data.gameId));return {gameId:response.data.gameId,score:response.data.score}})
await check('server directions, forged score ignored and persistence matches',async()=>{const f=manifest.tournaments.journey,cookie=cookies[f.owner];let g=(await request(cookie,gamePath(f.id,'start'),{recoverOnly:true,gameId:f.gameId})).data;let moved=0;for(const direction of ['left','up','right','down']){await new Promise(resolve=>setTimeout(resolve,150));const response=await move(cookie,f,g,direction,{score:999999,final_score:999999});assert.equal(response.status,200);if(response.data.moved){moved++;g={...g,...response.data};same(g,await row(g.gameId))}}assert.ok(moved>=2);assert.notEqual(g.score,999999);return {gameId:g.gameId,score:g.score,moveNumber:g.moveNumber,moved}})
await check('foreign owner cannot move or recover',async()=>{const f=manifest.tournaments.journey,g=await row(f.gameId);const bad=await request(cookies[1],gamePath(f.id,'move'),{gameId:g.id,direction:'left',moveNumber:g.move_count+2,clientTimestamp:Date.now()});assert.equal(bad.status,404);const recovered=await request(cookies[1],gamePath(f.id,'start'),{recoverOnly:true,gameId:g.id});assert.equal(recovered.status,403);return {moveStatus:bad.status,recoverStatus:recovered.status}})
await check('unknown movement response recovered without replay and skewed wall clock',async()=>{
 const f=manifest.tournaments.journey,cookie=cookies[f.owner];let last,lose=false,requests=0,monotonic=1000
 const config={startUrl:gamePath(f.id,'start'),moveUrl:gamePath(f.id,'move'),timeoutUrl:gamePath(f.id,'timeout'),existingGameId:f.gameId}
 const session=new Unity2048Session(state=>{last=state},async(url,body)=>{const response=await request(cookie,url,body);if(response.status!==200)throw Error(response.data.error);if(url===config.moveUrl){requests++;if(lose){lose=false;throw Error('Response deliberately discarded after real server commit')}}return response.data},config,()=>monotonic)
 await session.recover();const initial=await row(f.gameId);lose=true;await session.move('left');assert.equal(last.locked,true);const persisted=await row(f.gameId);await session.recover();assert.equal(last.locked,false);assert.equal(last.score,persisted.final_score);assert.equal(last.move_number,persisted.move_count+2);assert.equal(requests,1);assert.ok(persisted.move_count-initial.move_count<=1)
 const realNow=Date.now;try{Date.now=()=>realNow()+86400000;monotonic+=1000;await session.resynchronizeTime();assert.equal(last.game_over,false);assert.equal(last.locked,false);assert.ok(last.time_left_seconds>0)}finally{Date.now=realNow;session.destroy()}
 return {gameId:f.gameId,moveRequests:requests,moveCount:persisted.move_count,score:persisted.final_score,clock:'real server reference with isolated client wall-clock offset'}
})
await check('simultaneous starts share one game',async()=>{const {f,cookie}=await registered('parallelStart');const responses=await Promise.all([request(cookie,gamePath(f.id,'start')),request(cookie,gamePath(f.id,'start'))]);const games=await checked(admin.from('games').select('id').eq('tournament_id',f.id).eq('user_id',manifest.accounts[f.owner].id));assert.equal(games.length,1);manifest.tournaments.parallelStart.gameId=games[0].id;await save('manifest.json',manifest);assert.ok(responses.every(response=>response.status===200),JSON.stringify(responses.map(response=>({status:response.status,error:response.data.error}))));assert.equal(responses[0].data.gameId,responses[1].data.gameId);return {gameId:games[0].id,statuses:responses.map(response=>response.status)}})
await check('simultaneous directions persist at most one sequence and recover',async()=>{const f=manifest.tournaments.parallelStart,cookie=cookies[f.owner],start=(await request(cookie,gamePath(f.id,'start'),{recoverOnly:true,gameId:f.gameId})).data;const responses=await Promise.all([move(cookie,f,start,'left'),move(cookie,f,start,'up')]);const g=await row(start.gameId);assert.ok(g.move_count<=1);const recovered=await request(cookie,gamePath(f.id,'start'),{recoverOnly:true,gameId:start.gameId});assert.equal(recovered.status,200);same(recovered.data,g);return {gameId:g.id,statuses:responses.map(response=>response.status),moveCount:g.move_count}})
await check('near-terminal fixture closes no_moves and recovers final score',async()=>{const {f,cookie}=await registered('noMoves');const start=await request(cookie,gamePath(f.id,'start'));assert.equal(start.status,200);const g=await checked(admin.from('games').select('seed').eq('id',start.data.gameId).single());let chosen
 const boards=[[[2,4,8,16],[32,64,128,256],[512,1024,2,4],[8,16,32,0]],[[4,8,16,32],[64,128,256,512],[1024,2,4,8],[16,32,64,0]]]
 for(const board of boards)for(const direction of ['down','right']){const engine=new Game2048(board,128);const r=engine.applyMove(direction,new DeterministicRNG(g.seed,2));if(r.moved&&!engine.canMove())chosen={board,direction}}
 assert.ok(chosen,'Could not construct a bounded near-terminal fixture');await checked(admin.from('games').update({current_board:chosen.board,final_score:128,highest_tile:1024}).eq('id',start.data.gameId).eq('status','active'));const response=await move(cookie,f,start.data,chosen.direction);assert.equal(response.status,200);assert.equal(response.data.status,'completed');assert.equal(response.data.endReason,'no_moves');same(response.data,await row(start.data.gameId));const recovered=await request(cookie,gamePath(f.id,'start'));assert.equal(recovered.status,200);assert.equal(recovered.data.gameId,start.data.gameId);assert.equal(recovered.data.status,'completed');return {gameId:start.data.gameId,fixture:'near-terminal board prearranged in owned test row',score:response.data.score,endReason:response.data.endReason}})
await check('deadline closure persists and repeated timeout stays identical',async()=>{const {f,cookie}=await registered('deadline');const start=await request(cookie,gamePath(f.id,'start'));assert.equal(start.status,200);await checked(admin.from('games').update({started_at:new Date(Date.now()-31000).toISOString()}).eq('id',start.data.gameId).eq('status','active'));const response=await request(cookie,gamePath(f.id,'timeout'),{gameId:start.data.gameId});assert.equal(response.status,200);assert.equal(response.data.endReason,'timeout');same(response.data,await row(start.data.gameId));const again=await request(cookie,gamePath(f.id,'timeout'),{gameId:start.data.gameId});assert.equal(again.status,200);assert.equal(again.data.endedAt,response.data.endedAt);const forbidden=await move(cookie,f,start.data,'left');assert.equal(forbidden.status,400);same(forbidden.data,await row(start.data.gameId));return {gameId:start.data.gameId,deadline:'owned fixture elapsed time',score:response.data.score,endedAt:response.data.endedAt,lateMoveStatus:forbidden.status}})
await save('api-checks.json',report);console.log(JSON.stringify(report,null,2));process.exitCode=report.checks.some(check=>check.status==='FAIL')?1:0
}
await run()

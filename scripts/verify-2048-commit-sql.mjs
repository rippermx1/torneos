// Disposable PostgreSQL 17 container; never connects to the platform database.
import fs from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const name='g2048044-sql',dir='artifacts/2048-competitive/'
const migration='supabase/migrations/20261002202731_guard_2048_move_commit.sql'
const docker=async(args,input)=>{
 const child=execFile('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024})
 if(input!==undefined)child.stdin.end(input)
 return await new Promise(resolve=>{let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('exit',code=>resolve({code,out,err}))})
}
const sql=statement=>docker(['exec','-i',name,'psql','-h','/tmp','-p','5544','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],statement)
const checked=async statement=>{const r=await sql(statement);assert.equal(r.code,0,r.err);return r.out.trim()}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const before='[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]',after='[[4,0,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]'
const report={task:'G2048-04.4',at:new Date().toISOString(),scope:'disposable PostgreSQL 17, minimal relevant schema, no platform DB changes',checks:[]}
async function fixture(){const id=randomUUID(),t=randomUUID();await checked(`INSERT INTO tournaments VALUES ('${t}',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',60,'live'); INSERT INTO games (id,tournament_id,status,final_score,move_count,current_board,started_at) VALUES ('${id}','${t}','active',16,0,'${before}',clock_timestamp());`);return {id,t}}
const call=(g,extra='')=>`SELECT * FROM record_game_move(p_game_id=>'${g.id}',p_move_number=>2,p_direction=>'left',p_board_before=>'${before}',p_board_after=>'${after}',p_score_gained=>4,p_current_board=>'${after}',p_final_score=>20,p_move_count=>1${extra});`
const state=g=>checked(`SELECT json_build_object('status',status,'score',final_score,'count',move_count,'moves',(SELECT count(*) FROM game_moves WHERE game_id='${g.id}')) FROM games WHERE id='${g.id}';`)
async function check(name,run){try{report.checks.push({name,status:'PASS',...await run()})}catch(error){report.checks.push({name,status:'FAIL',error:error.message})}}
async function rejection(g,message,statement=call(g)){const r=await sql(statement);assert.notEqual(r.code,0);assert.ok(r.err.includes(message),r.err);assert.equal(JSON.parse(await state(g)).moves,0);return {rejected:message,persisted:JSON.parse(await state(g))}}
async function lock(g,update,duration=0.8){
 const tag='g2048044_'+g.id.replaceAll('-',''),pending=sql(`SET application_name='${tag}'; BEGIN; ${update||`SELECT id FROM games WHERE id='${g.id}' FOR UPDATE;`} SELECT pg_sleep(${duration}); COMMIT;`)
 let sleeping=false;for(let i=0;i<30&&!sleeping;i++){sleeping=(await checked(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${tag}' AND wait_event='PgSleep';`))==='1';if(!sleeping)await wait(30)}assert.ok(sleeping,'Expected row lock was not acquired');return {pending}
}
let created=false
try{
 const started=await docker(['run','-d','--name',name,'--network','none','--user','postgres','--entrypoint','bash','public.ecr.aws/supabase/postgres:17.6.1.105','-lc','initdb -D /tmp/g2048-pg --auth=trust >/tmp/g2048-init.log && exec postgres -D /tmp/g2048-pg -k /tmp -p 5544']);assert.equal(started.code,0,started.err);created=true
 let ready=false;for(let i=0;i<40&&!ready;i++){ready=(await sql('SELECT 1')).code===0;if(!ready)await wait(100)}assert.ok(ready)
 await checked(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE tournaments(id uuid PRIMARY KEY,play_window_start timestamptz NOT NULL,play_window_end timestamptz NOT NULL,max_game_duration_seconds int NOT NULL,status text NOT NULL);
 CREATE TABLE games(id uuid PRIMARY KEY,tournament_id uuid REFERENCES tournaments(id),status text NOT NULL,final_score bigint NOT NULL DEFAULT 0,highest_tile int NOT NULL DEFAULT 0,move_count int NOT NULL DEFAULT 0,current_board jsonb,started_at timestamptz,ended_at timestamptz,end_reason text);
 CREATE TABLE game_moves(game_id uuid REFERENCES games(id),move_number int,direction text,board_before jsonb,board_after jsonb,score_gained int,spawned_tile jsonb,client_timestamp bigint,server_timestamp timestamptz DEFAULT now(),UNIQUE(game_id,move_number));`)
 await checked(await fs.readFile('supabase/migrations/20260519000000_record_game_move_rpc.sql','utf8'))
 await check('old RPC reproduces modification after completed timeout',async()=>{const g=await fixture();await checked(`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`);await checked(call(g));const persisted=JSON.parse(await state(g));assert.equal(persisted.score,20);return {baselineDefectReproduced:true,persisted}})
 const candidate=await fs.readFile(migration,'utf8');report.migration=migration;report.sha256=createHash('sha256').update(candidate).digest('hex');await checked(candidate)
 await check('valid movement atomically persists board, score and sequence',async()=>{const g=await fixture();await checked('SET ROLE service_role;'+call(g));const persisted=JSON.parse(await state(g));assert.deepEqual(persisted,{status:'active',score:20,count:1,moves:1});return {persisted}})
 await check('last valid no_moves movement closes once',async()=>{const g=await fixture();await checked(call(g,",p_status=>'completed',p_end_reason=>'no_moves',p_ended_at=>clock_timestamp()"));assert.equal(JSON.parse(await state(g)).status,'completed');assert.ok((await sql(call(g))).err.includes('GAME_COMMIT_CLOSED'));return {persisted:JSON.parse(await state(g))}})
 await check('completed score cannot be changed by delayed movement',async()=>{const g=await fixture();await checked(`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`);return rejection(g,'GAME_COMMIT_CLOSED')})
 await check('stale sequence is rejected without inserted movement',async()=>{const g=await fixture();await checked(`UPDATE games SET move_count=1 WHERE id='${g.id}';`);return rejection(g,'GAME_COMMIT_CONFLICT')})
 await check('stale board is rejected even with matching sequence',async()=>{const g=await fixture();await checked(`UPDATE games SET current_board='${after}' WHERE id='${g.id}';`);return rejection(g,'GAME_COMMIT_CONFLICT')})
 await check('two concurrent RPCs accept only one sequence',async()=>{const g=await fixture();const r=await Promise.all([sql(call(g)),sql(call(g))]);assert.deepEqual(r.map(x=>x.code).sort(),[0,3]);assert.ok(r.find(x=>x.code!==0).err.includes('GAME_COMMIT_CONFLICT'));assert.equal(JSON.parse(await state(g)).moves,1);return {persisted:JSON.parse(await state(g))}})
 await check('movement waiting behind closure preserves confirmed score',async()=>{const g=await fixture();const held=await lock(g,`UPDATE games SET status='completed',end_reason='timeout' WHERE id='${g.id}';`);const r=await rejection(g,'GAME_COMMIT_CLOSED');assert.equal((await held.pending).code,0);assert.equal(r.persisted.score,16);return r})
 await check('deadline is checked after lock wait using actual clock',async()=>{const g=await fixture();await checked(`UPDATE games SET started_at=clock_timestamp()-interval '59 seconds' WHERE id='${g.id}';`);const held=await lock(g,null,1.3);const r=await rejection(g,'GAME_COMMIT_DEADLINE');assert.equal((await held.pending).code,0);return r})
 await check('shorter tournament window rejects late commit',async()=>{const g=await fixture();await checked(`UPDATE tournaments SET play_window_end=clock_timestamp()-interval '1 second' WHERE id='${g.t}';`);return rejection(g,'GAME_COMMIT_DEADLINE')})
 await check('completed tournament rejects an otherwise active game',async()=>{const g=await fixture();await checked(`UPDATE tournaments SET status='completed' WHERE id='${g.t}';`);return rejection(g,'GAME_COMMIT_DEADLINE')})
 for(const role of ['anon','authenticated'])await check(role+' cannot execute privileged movement RPC',async()=>{const g=await fixture();const r=await sql('SET ROLE '+role+';'+call(g));assert.notEqual(r.code,0);assert.ok(r.err.includes('permission denied for function'));return {role}})
}finally{
 if(created)await docker(['rm','-f',name])
 await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'sql-commit-checks.json',JSON.stringify(report,null,2)+'\n')
}
console.log(JSON.stringify(report,null,2));process.exitCode=report.checks.some(x=>x.status==='FAIL')?1:0

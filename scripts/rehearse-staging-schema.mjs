import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { randomUUID,createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { assessCatalog,catalogSql } from './staging-preflight.mjs'

const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1]
for(const name of ['--snapshot','--inventory','--pg-bin']) if(!args.includes(name)||!value(name)) throw new Error('Explicit snapshot/inventory/PG binaries required')
const pgBin=path.resolve(value('--pg-bin')),snapshotPath=path.resolve(value('--snapshot'))
const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8')),inventory=JSON.parse(await fs.readFile(value('--inventory'),'utf8'))
assert.equal(snapshot.project_ref,'jnoyjewsqbooqaiighcs');assert.equal(inventory.project_ref,snapshot.project_ref)
assert.equal(snapshot.schema,1);assert.ok(Date.now()-Date.parse(snapshot.observed_at)<86400000)
const root=path.resolve('artifacts/staging/rehearsal'),cluster=path.join(root,`pg-${randomUUID()}`)
await fs.mkdir(root,{recursive:true})
const report={status:'NOT_RUN',scope:'offline actual catalog replay, empty financial tables; Auth helpers stubbed, no hosted JWT/Storage recovery claim',snapshot_sha256:createHash('sha256').update(await fs.readFile(snapshotPath)).digest('hex'),checks:[],migrations:[],cleanup:'NOT_RUN'}
let started=false,port
const run=(binary,parameters,input,timeout=30000)=>new Promise(resolve=>{
 const child=execFile(path.join(pgBin,binary+(process.platform==='win32'?'.exe':'')),parameters,{windowsHide:true,timeout,maxBuffer:16*1024*1024,env:{...process.env,PGCLIENTENCODING:'UTF8',PSQLRC:''}},(error,out,err)=>resolve({code:error?.code??0,out:out.trim(),err}))
 if(input!==undefined)child.stdin.end(input)
})
const sql=text=>run('psql',['-X','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],text)
const checked=async text=>{const r=await sql(text);assert.equal(r.code,0,r.err);return r.out}
const migrations=JSON.parse(await fs.readFile('config/commercial-release.json','utf8')).migrations.filter(file=>!inventory.versions.includes(file.slice(0,14)))
const nativeCatalog=async()=>JSON.parse((await checked(catalogSql())).split('\n').find(line=>line.startsWith('{')))
try{
 const version=await run('postgres',['--version']);assert.match(version.out,/PostgreSQL\) 17\./);report.engine=version.out
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
 const init=await run('initdb',['-D',cluster,'-U','postgres','-A','trust','-E','UTF8','--locale=C'],undefined,60000);assert.equal(init.code,0,init.err)
 const start=await run('pg_ctl',['-D',cluster,'-l',cluster+'.log','-w','-t','30','-o',`-h 127.0.0.1 -p ${port} -c lc_messages=C`,'start']);assert.equal(start.code,0,start.err);started=true
 const grants=[...snapshot.table_grants,...snapshot.column_grants,...snapshot.function_grants]
 const roles=[...new Set(grants.map(s=>s.match(/ TO (?:"([^"]+)"|([\w]+));$/)?.slice(1).find(Boolean)).filter(Boolean))].filter(name=>!['postgres','PUBLIC'].includes(name))
 assert.ok(roles.every(name=>/^[a-z_]+$/.test(name)))
 await checked(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;${roles.filter(name=>!['anon','authenticated','service_role'].includes(name)).map(name=>`CREATE ROLE "${name}";`).join('')}
 CREATE SCHEMA private;CREATE SCHEMA storage;CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE SCHEMA supabase_migrations;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$DECLARE _parts text[]; BEGIN SELECT string_to_array(name,'/') INTO _parts; RETURN _parts[1:array_length(_parts,1)-1]; END$$;
 CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 INSERT INTO supabase_migrations.schema_migrations(version) VALUES ${inventory.versions.map(v=>`('${v}')`).join(',')};
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
 SET check_function_bodies=false;`)
 for(const section of ['enums','sequences','tables','functions','constraints','indexes','views','rls','policies','triggers','function_revokes','table_grants','column_grants','function_grants']) {
  if(!Array.isArray(snapshot[section]))throw new Error('Missing catalog section '+section)
  // Constraint triggers are recreated from pg_get_triggerdef, not ALTER TABLE.
  const statements = snapshot[section].filter(statement=>section!=='constraints'||!statement.includes(' TRIGGER DEFERRABLE '))
  await checked('SET check_function_bodies=false;\n'+statements.map(statement=>statement.trimEnd().endsWith(';')?statement:statement+';').join('\n'));report.checks.push({name:'replay_'+section,status:'PASS',objects:statements.length})
 }
 for(const bucket of snapshot.bucket_config){
  const quote=s=>s===null?'NULL':"'"+s.replaceAll("'","''")+"'"
  await checked(`INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES(${quote(bucket.id)},${quote(bucket.name)},${bucket.public},${bucket.file_size_limit??'NULL'},${bucket.allowed_mime_types?'ARRAY['+bucket.allowed_mime_types.map(quote).join(',')+']::text[]':'NULL'});`)
 }
 const baseline=await nativeCatalog();await fs.writeFile(path.join(root,'baseline-catalog.json'),JSON.stringify(baseline,null,2))
 assert.equal(baseline.seed_readable_authenticated,inventory.seed_readable_authenticated)
 report.checks.push({name:'baseline_seed_permission_matches_real_dev',status:'PASS'})
 const backup=path.join(root,'before-migrations.dump')
 const dump=await run('pg_dump',['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-Fc','-f',backup]);assert.equal(dump.code,0,dump.err)
 for(const file of migrations){const bytes=await fs.readFile(path.join('supabase/migrations',file));await checked(bytes.toString('utf8'));await checked(`INSERT INTO supabase_migrations.schema_migrations(version) VALUES('${file.slice(0,14)}');`);report.migrations.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),status:'PASS'})}
 const after=await nativeCatalog(),assessment=assessCatalog(after,JSON.parse(await fs.readFile('config/commercial-release.json','utf8')).migrations)
 assert.equal(assessment.status,'PASS',JSON.stringify(assessment.issues));report.checks.push({name:'candidate_selected_catalog_invariants',status:'PASS'})
 await fs.writeFile(path.join(root,'after-catalog.json'),JSON.stringify(after,null,2))
 const paused=await checked('SELECT paused FROM public.cash_policy;');assert.equal(paused,'t');report.checks.push({name:'cash_remains_paused',status:'PASS'})
 await checked('CREATE DATABASE rm12_restore;')
 const restore=await run('pg_restore',['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','rm12_restore','--exit-on-error',backup]);assert.equal(restore.code,0,restore.err)
 const restored=await run('psql',['-X','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','rm12_restore','-At','-c',"SELECT has_column_privilege('authenticated','public.games','seed','SELECT'),to_regclass('public.cash_policy') IS NULL;"])
 assert.equal(restored.out,'t|t');report.checks.push({name:'isolated_catalog_backup_restore',status:'PASS'});report.status='PASS'
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1}
finally{if(started){const stop=await run('pg_ctl',['-D',cluster,'-w','-m','fast','stop']);report.cleanup=stop.code===0?'PASS_OWN_CLUSTER_STOPPED':'FAIL';if(stop.code!==0)process.exitCode=1}await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,migrations:report.migrations.length,checks:report.checks.length,error:report.error,cleanup:report.cleanup,evidence:path.join(root,'report.json')}))}

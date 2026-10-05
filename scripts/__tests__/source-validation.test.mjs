import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { aggregate, assertSourcePaths, runCommand, safeOutputDirectory, validationEnvironment } from '../source-validation-core.mjs'
import { portAvailability, writeDiagnostic } from '../source-diagnostics.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = () => safeOutputDirectory(root, `artifacts/source-validation-tests/${randomUUID()}`)
test('children receive build placeholders and no credentials or execution injection from parent', () => {
  const env = validationEnvironment({ PATH: '/bin', SUPABASE_SERVICE_ROLE_KEY: 'private', CRON_SECRET: 'private', FLOW_API_SECRET: 'private', GITHUB_TOKEN: 'private', NEXT_PUBLIC_SUPABASE_URL: 'https://remote.test', NODE_OPTIONS: '--require attacker.js' })
  assert.equal(env.PATH, '/bin'); assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:65534')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'source-validation-placeholder')
  assert.equal(JSON.stringify(env).includes('private'), false); assert.equal('NODE_OPTIONS' in env, false)
})
test('private dotenv, licensed art, compiled runtime and traversal stop source validation', () => {
  assert.doesNotThrow(() => assertSourcePaths(['.env.production.example', 'games/2048/UnityProject/Assets/Art/tile.png', 'app/page.tsx']))
  for (const file of ['.env.local', 'sub/.env', 'public/games/2048/v1/Build/game.wasm', 'games/alien-run/UnityProject/Assets/KayKit/asset.png', 'games/alien-run/UnityProject/Assets/Orbit/AlienRun/LocalArt.meta', '../outside', '/outside']) {
    assert.throws(() => assertSourcePaths([file]), file)
  }
})
test('failure or missing checks cannot be summarized as a pass', () => {
  assert.equal(aggregate([]), 'FAIL'); assert.equal(aggregate([{status:'PASS'}]), 'PASS')
  assert.equal(aggregate([{status:'PASS'}, {status:'FAIL'}]), 'FAIL')
  assert.equal(aggregate([{status:'NOT_RUN'}]), 'FAIL')
})
test('child nonzero exit and timeout remain failures without executing shell arguments', async () => {
  const dir = await fixture()
  const fail = await runCommand(process.execPath, ['-e', 'process.exit(7)'], {cwd:dir,env:validationEnvironment(),log:path.join(dir,'fail.log')})
  assert.equal(fail.status, 'FAIL'); assert.equal(fail.code, 7)
  const timeout = await runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {cwd:dir,env:validationEnvironment(),log:path.join(dir,'timeout.log'),timeoutMs:100})
  assert.equal(timeout.status, 'FAIL'); assert.equal(timeout.timedOut, true)
})
test('outputs stay in new owned artifact directories and preserve previous evidence', async () => {
  const dir = await fixture()
  await assert.rejects(safeOutputDirectory(root, path.relative(root,dir)))
  await assert.rejects(safeOutputDirectory(root, '../outside'))
  const output = path.join(dir,'diagnostic.json')
  await writeDiagnostic(root,output,{auth:'NOT_RUN'})
  await assert.rejects(writeDiagnostic(root,output,{auth:'PASS'}))
  assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),{auth:'NOT_RUN'})
})
test('symlinked artifact parents cannot redirect output outside intended workspace', async () => {
  const dir = await fixture(), target = await fixture(), link = path.join(dir,'redirect')
  await fs.symlink(target,link,process.platform==='win32'?'junction':'dir')
  await assert.rejects(safeOutputDirectory(root,path.relative(root,path.join(link,'child'))))
  await assert.rejects(writeDiagnostic(root,path.join(link,'report.json'),{}))
})
test('TCP availability is a bounded loopback-only probe and says nothing about Auth', async t => {
  const server = net.createServer(socket => socket.end())
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  t.after(()=>server.close())
  const port = server.address().port
  assert.equal((await portAvailability(port)).status,'ACCEPTS_TCP')
  await new Promise(resolve => server.close(resolve))
  assert.equal((await portAvailability(port)).status,'UNAVAILABLE')
})

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'

const dir = path.resolve('artifacts/2048-integrity')
await fs.mkdir(dir, { recursive: true })
const tests = ['2048-integrity', '2048-rate-limit', '2048-anticheat-adversarial', '2048-ranking-adversarial',
  'game-closure-routes', 'game-deadline', 'winner-review', '2048-rule-equivalence', '2048-entry-aliases',
  '2048-device-probe', 'game-closure-postgrest', 'tournament-return', 'tournament-result-pages',
  'tournament-availability', 'anticheat'].map(name => `__tests__/${name}.test.ts`)
const source = ['lib/anticheat/integrity.ts','lib/anticheat/detector.ts','lib/anticheat/winner-review.ts','lib/tournament/lifecycle.ts',
  'app/api/admin/users/[id]/ban/route.ts','app/api/admin/tournaments/[id]/integrity/route.ts',
  'app/api/admin/tournaments/[id]/finalize/route.ts',
  'app/api/tournaments/[id]/game/start/route.ts','app/api/tournaments/[id]/game/move/route.ts',
  'app/(admin)/admin/tournaments/[id]/games/page.tsx','app/(admin)/admin/tournaments/[id]/games/[gameId]/page.tsx',
  'components/tournament/integrity-reviews.tsx']
const report = { task: 'G2048-09.3', date: new Date().toISOString(), checks: [] }
await fs.writeFile(path.join(dir,'tsconfig.json'),JSON.stringify({ extends:'../../tsconfig.json',compilerOptions:{incremental:false},
  include:['next-env.d.ts',...source,...tests].map(file=>path.resolve(file)),exclude:[path.resolve('node_modules')] },null,2))
const run = async (name,args) => {
  const result = await new Promise(resolve => execFile(process.execPath,args,{windowsHide:true,maxBuffer:2*1024*1024},
    (error,out,err)=>resolve({code:error ? error.code ?? 1 : 0,out,err})))
  await fs.writeFile(path.join(dir,`${name}.log`),result.out+result.err)
  report.checks.push({name,status:result.code===0?'PASS':'FAIL',log:`${name}.log`})
  if(result.code!==0) throw new Error(`${name} failed; see artifacts/2048-integrity/${name}.log`)
}
try {
  await run('web-tests',['node_modules/vitest/vitest.mjs','run',...tests,'--reporter=json',`--outputFile=${path.join(dir,'tests.json')}`])
  const results=JSON.parse(await fs.readFile(path.join(dir,'tests.json'),'utf8'))
  report.web={passed:results.numPassedTests,failed:results.numFailedTests,files:results.testResults.length}
  await run('types',['node_modules/typescript/bin/tsc','-p',path.join(dir,'tsconfig.json')])
  await run('lint',['node_modules/eslint/bin/eslint.js',...source,'__tests__/2048-integrity.test.ts',
    '__tests__/2048-anticheat-adversarial.test.ts','scripts/verify-2048-integrity.mjs','scripts/verify-2048-integrity-sql.mjs',
    'scripts/preview-2048-integrity.mjs'])
  if(process.argv.includes('--sql')) {
    const at=process.argv.indexOf('--pg-bin'); const args=['scripts/verify-2048-integrity-sql.mjs']
    if(at!==-1) args.push('--pg-bin',process.argv[at+1])
    await run('postgres',args); report.sql=JSON.parse(await fs.readFile(path.join(dir,'sql.json'),'utf8'))
  } else report.sql='NOT_RUN'
} catch(error) {report.error=error.message;process.exitCode=1}
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))

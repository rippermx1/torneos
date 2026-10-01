import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59999',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-preview-placeholder',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-preview-placeholder',SUPABASE_SECRET_KEY:'local-preview-placeholder',SUPABASE_SERVICE_ROLE_KEY:'local-preview-placeholder',FLOW_API_KEY:'',FLOW_API_SECRET:'',FLOW_API_BASE:'http://127.0.0.1:59999',APP_URL:'http://127.0.0.1:3080',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3080'}
console.log('Local games preview: http://127.0.0.1:3080/play. Auth, database and Flow use placeholders.')
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3080'],{cwd:root,env,stdio:'inherit'})
child.on('exit',code=>{process.exitCode=code??1})
process.on('SIGINT',()=>child.kill('SIGINT'))

// Publish only an explicitly selected local WebGL build. No cloud deployment.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const [game,build,inputArg]=process.argv.slice(2)
if(![game,build].every(x=>typeof x==='string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x))) throw new Error('Usage: publish-unity.mjs game-id build-id [source]')
const input=path.resolve(inputArg??path.join(root,'games',game,'UnityProject','Builds','WebGL',build))
const target=path.join(root,'public','games',game,build)
if(!fs.existsSync(path.join(input,'index.html')) || !fs.existsSync(path.join(input,'Build'))) throw new Error('A real WebGL build is required')
const digest=b=>crypto.createHash('sha256').update(b).digest('hex')
const files={}
function publish(src,dst) {
  const stat=fs.lstatSync(src);if(stat.isSymbolicLink()) throw new Error('Symbolic paths excluded')
  if(stat.isDirectory()) { for(const item of fs.readdirSync(src)) publish(path.join(src,item),path.join(dst,item));return }
  const bytes=fs.readFileSync(src),hash=digest(bytes)
  if(fs.existsSync(dst) && digest(fs.readFileSync(dst))!==hash) throw new Error('Build identifiers are immutable: '+dst)
  fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,bytes)
  files[path.relative(target,dst).replaceAll('\\','/')]=hash
}
publish(input,target)
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true})
fs.writeFileSync(path.join(root,'artifacts',`published-${game}-${build}.json`),JSON.stringify({game,build,input,target,files},null,2)+'\n')
console.log(JSON.stringify({game,build,target,files:Object.keys(files).length}))

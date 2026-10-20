import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {COMPETITION_BUILD} from '@/lib/snake-arena/competition-client'
import {competitionHtml} from '@/lib/snake-arena/bridge'
export async function GET(){
  try{
    const html=await readFile(path.join(process.cwd(),'public','games','snake-arena',COMPETITION_BUILD,'index.html'),'utf8')
    return new Response(competitionHtml(html,COMPETITION_BUILD),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})
  }catch{return new Response('Build de Snake Arena no disponible.',{status:503})}
}

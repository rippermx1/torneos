// UI fixture renders the actual React component; HTTP decisions are synthetic.
// No platform authentication, database, notifications or financial actions.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

const root=path.resolve('artifacts/2048-integrity/ui-fixture')
await fs.mkdir(root,{recursive:true})
const cssRoot=path.resolve('artifacts/2048-adversarial/web-source/.next/static/chunks')
const sheets=(await fs.readdir(cssRoot)).filter(name=>name.endsWith('.css'))
await fs.writeFile(path.join(root,'platform.css'),(await Promise.all(sheets.map(file=>fs.readFile(path.join(cssRoot,file),'utf8')))).join('\n'))
await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/platform.css"><title>2048 · Revisión de integridad · Fixture</title></head><body style="margin:0;padding:24px;font-family:Arial,sans-serif"><main style="max-width:900px;margin:auto"><p style="font-size:12px;color:#666">Prueba local · datos sintéticos</p><h1 style="font-size:24px;font-weight:700;margin:16px 0">Partidas · 2048</h1><div id="root"></div></main><script type="module" src="/entry.tsx"></script></body></html>`)
await fs.writeFile(path.join(root,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {IntegrityReviews} from '/@fs/${path.resolve('components/tournament/integrity-reviews.tsx').replaceAll('\\','/')}';
const scenario=new URLSearchParams(location.search).get('scenario');const gameId='20000000-0000-0000-0000-000000000002';
const item={gameId,code:scenario==='settled'?'settled_sanction':'regular_pace',evidence:{intervals:30,min_ms:500,max_ms:500},decision:'pending',reason:null,reviewedAt:null};
createRoot(document.getElementById('root')).render(<IntegrityReviews tournamentId="10000000-0000-0000-0000-000000000001" reviews={scenario==='unavailable'?null:[item]} finalizing={scenario!=='settled'} users={{[gameId]:{id:'30000000-0000-0000-0000-000000000003',name:'Jugador de prueba'}}}/>);`)
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0,fs:{allow:[path.resolve('.')] }},
  resolve:{alias:{'@':path.resolve('.')}},plugins:[{name:'synthetic-integrity-http',configureServer(vite){
    vite.middlewares.use('/api/admin/',(req,res)=>{res.setHeader('Content-Type','application/json');
      if(req.method!=='POST'){res.statusCode=405;res.end('{}');return}
      const failure=String(req.headers.referer).includes('scenario=failure')
      res.statusCode=failure?503:200;res.end(JSON.stringify(failure?{error:'synthetic failure'}:{ok:true,banned:true,invalidatedGames:1,settledGames:0}))
    })
  }}]})
await server.listen();console.log(JSON.stringify({url:`http://127.0.0.1:${server.httpServer.address().port}/`,scope:'actual UI component + synthetic decision endpoint'}))
const stop=async()=>{await server.close();process.exit(0)}
process.on('SIGTERM',stop);process.on('SIGINT',stop)

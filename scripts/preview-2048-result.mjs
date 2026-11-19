// Actual platform component + Unity capsule, synthetic terminal fixtures. No Auth/DB/Flow.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

const root = path.resolve('artifacts/2048-result/ui-fixture')
await fs.mkdir(root, { recursive: true })
const html = await fetch('http://127.0.0.1:3081/play').then(response => response.text())
const sheets = [...new Set([...html.matchAll(/href="([^" ]+\.css(?:\?[^" ]*)?)"/g)].map(match => match[1]))]
const css = await Promise.all(sheets.map(async url => {
  if (!url.startsWith('/_next/static/')) throw new Error('Only the accepted local stylesheet')
  const response = await fetch('http://127.0.0.1:3081' + url)
  if (!response.ok) throw new Error('Stylesheet unavailable')
  return response.text()
}))
await fs.writeFile(path.join(root, 'platform.css'), css.join('\n'))
await fs.writeFile(path.join(root, 'link.tsx'), "import React from 'react';export default function Link({href,...props}){return <a href={href} {...props}/>}")
await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/platform.css"><title>2048 · Cierre de partida · Prueba local</title></head><body style="padding:16px;font-family:Arial,sans-serif"><main style="max-width:800px;margin:auto"><p>Prueba técnica local · estado inicial y resultados sintéticos</p><div id="root"></div></main><script type="module" src="/entry.tsx"></script></body></html>')
const component = path.resolve('components/game/unity-2048.tsx').replaceAll('\\', '/')
const localPractice = path.resolve('lib/game/local-practice.ts').replaceAll('\\', '/')
const id = '10000000-0000-4000-8000-000000000001'
await fs.writeFile(path.join(root, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {Unity2048} from '/@fs/${component}';
const scenario = new URLSearchParams(location.search).get('scenario');
const tournament = { startUrl:'/api/tournaments/${id}/game/start',moveUrl:'/api/tournaments/${id}/game/move',timeoutUrl:'/api/tournaments/${id}/game/timeout',resultsUrl:'/api/tournaments/${id}/leaderboard',leaderboardUrl:'/tournaments/${id}/leaderboard' };
createRoot(document.getElementById('root')).render(<Unity2048 tournament={scenario==='practice'?undefined:tournament}/>);`)
const board = [[2,4,8,16],[4,8,16,32],[16,32,64,128],[2,2,16,32]]
let failed = false
const manifest = JSON.parse(await fs.readFile('artifacts/published-2048-unity-2048-007.json', 'utf8'))
const server = await createServer({ root, publicDir: false, configFile: false,
  esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('.'), 'next/link': path.join(root, 'link.tsx') } },
  server: { host: '127.0.0.1', port: 65174, strictPort: true, fs: { allow: [path.resolve('.')] } },
  plugins: [{ name: 'end-result-fixtures', enforce: 'pre',
    resolveId(source, importer) { if (source === './local-practice' && importer?.replaceAll('\\', '/').endsWith('/unity-2048-session.ts')) return '\0practice-end-fixture' },
    load(id) { if (id === '\0practice-end-fixture') return `export {applyLocalPracticeMove} from '/@fs/${localPractice}';export function createLocalPracticeGame(){return {board:${JSON.stringify(board)},score:0,seed:'result-fixture',moveNumber:2}}` },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://local.invalid').pathname
        const prefix = '/games/2048/unity-2048-007/'
        if (pathname.startsWith(prefix)) {
          const file = pathname.slice(prefix.length)
          if (!Object.hasOwn(manifest.files, file)) { res.statusCode = 404; res.end(); return }
          res.setHeader('Content-Type', file.includes('.wasm') ? 'application/wasm' : file.includes('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
          if (file.endsWith('.gz')) res.setHeader('Content-Encoding', 'gzip')
          res.end(await fs.readFile(path.join('public/games/2048/unity-2048-007', file))); return
        }
        if (!pathname.startsWith('/api/tournaments/')) { next(); return }
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
        const scenario = new URL(String(req.headers.referer)).searchParams.get('scenario')
        if (pathname.endsWith('/leaderboard')) {
          if (scenario === 'failure' && !failed) { failed = true; res.statusCode = 503; res.end('{}'); return }
          const official = scenario === 'official'
          res.end(JSON.stringify({ tournamentId: scenario === 'wrong' ? 'another-tournament' : id,
            phase: official ? 'official' : 'provisional', rows: [
              { position: 1, name: 'Jugador de prueba', score: 132, highestTile: 128, prizeCents: official ? 0 : null, isMe: true },
              { position: 2, name: 'Otro jugador', score: 100, highestTile: 64, prizeCents: official ? 0 : null, isMe: false },
            ] })); return
        }
        const terminal = !pathname.endsWith('/start')
        res.end(JSON.stringify({ stateConfirmed: true, gameId: 'synthetic-game', status: terminal ? 'completed' : 'active',
          board: terminal ? [...board.slice(0,3),[4,16,32,2]] : board, score: terminal ? 132 : 128,
          moveCount: terminal ? 1 : 0, moveNumber: terminal ? 3 : 2, gameOver: terminal,
          endReason: terminal ? 'no_moves' : null, endedAt: terminal ? new Date().toISOString() : null,
          deadlineAt: terminal ? null : new Date(Date.now()+300000).toISOString(), serverNow: new Date().toISOString() }))
      })
    },
  }],
})
await server.listen()
console.log(JSON.stringify({ url: 'http://127.0.0.1:65174/?scenario=practice', scope: 'Actual component and Unity, synthetic initial state/HTTP' }))
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await server.close(); process.exit() })

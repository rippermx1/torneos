// Temporary practice-only measurement surface. Never proxy Auth, APIs, cookies or payments.
import http from 'node:http'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { gunzipSync } from 'node:zlib'
import { allowedPath, privateHost, instrumentHtml } from './policy.mjs'

const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--host')) throw Error('Use --host followed by the private IPv4 address of this PC')
const host = args[1] ?? '127.0.0.1', port = 3083, origin = `http://${host}:${port}`
if (!privateHost(host)) throw Error('Bind only to an explicit private IPv4 address or loopback')
const dir = 'artifacts/2048-device/', upstream = 'http://127.0.0.1:3081'
const manifest = await fetch(upstream + '/games/2048/unity-2048-007/build-manifest.json').then(r => { if (!r.ok) throw Error('Accepted build unavailable'); return r.json() })
if (manifest.build_id !== 'unity-2048-007') throw Error('Re-audit the active capsule before measuring it')
await fs.mkdir(dir, { recursive: true })
const client = await fs.readFile(new URL('./client.js', import.meta.url)), capsule = await fs.readFile(new URL('./capsule.js', import.meta.url))
function reply(res, status, body, type = 'text/plain; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body) }
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(origin).host) return reply(res, 421, 'Host no permitido')
    const url = new URL(req.url, origin)
    if (req.method === 'POST' && url.pathname === '/probe/report') {
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(res, 403, 'Origen no permitido')
      let body = ''; for await (const part of req) { body += part; if (Buffer.byteLength(body) > 131072) return reply(res, 413, 'Informe demasiado grande') }
      const report = JSON.parse(body)
      if (report.schema !== 1 || report.build !== manifest.build_id || typeof report.userAgent !== 'string' || report.userAgent.length > 512 || typeof report.model !== 'string' || report.model.length > 100 || !Array.isArray(report.events) || report.events.length > 200) return reply(res, 400, 'Informe inválido')
      if (report.notes !== undefined && (typeof report.notes !== 'string' || report.notes.length > 1000)) return reply(res, 400, 'Observaciones inválidas')
      const id = randomUUID()
      await fs.writeFile(dir + id + '.json', JSON.stringify({ ...report, receipt: id, receivedAt: new Date().toISOString(), evidenceClass: 'CLIENT_METRICS_DEVICE_AND_ACCEPTANCE_NOT_AUTOMATICALLY_VERIFIED' }, null, 2) + '\n')
      return reply(res, 200, JSON.stringify({ receipt: id }), 'application/json')
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'Solo lectura')
    if (url.pathname === '/') { res.writeHead(302, { Location: '/play' }); return res.end() }
    if (url.pathname === '/probe/client.js') return reply(res, 200, client, 'text/javascript')
    if (url.pathname === '/probe/capsule.js') return reply(res, 200, capsule, 'text/javascript')
    if (!allowedPath(url.pathname)) return reply(res, 404, 'Esta prueba solo permite práctica 2048. No expone cuentas ni torneos.')
    // Do not forward any credentials, Origin, arbitrary headers or query parameters.
    const outgoing = http.get(upstream + url.pathname, { headers: { 'Accept-Encoding': 'identity' } }, async incoming => {
      try {
        const headers = { ...incoming.headers }; delete headers['set-cookie']; delete headers.connection; delete headers['transfer-encoding']
        const html = url.pathname === '/play' || url.pathname.endsWith('/index.html')
        if (html) {
          const parts = []; let size = 0
          for await (const part of incoming) { size += part.length; if (size > 4194304) throw Error('HTML limit'); parts.push(part) }
          let bytes = Buffer.concat(parts); if (headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes)
          const script = url.pathname === '/play' ? '/probe/client.js' : '/probe/capsule.js'
          // Execute before React hydrates the streamed document and reconciles head scripts.
          const markup = instrumentHtml(bytes.toString('utf8'), script, headers['content-security-policy'])
          delete headers['content-encoding']; delete headers.etag
          headers['cache-control'] = 'no-store'; headers['content-length'] = Buffer.byteLength(markup)
          res.writeHead(incoming.statusCode, headers); res.end(req.method === 'HEAD' ? undefined : markup)
        } else {
          res.writeHead(incoming.statusCode, headers)
          if (req.method === 'HEAD') { incoming.resume(); res.end() } else await pipeline(incoming, res)
        }
      } catch { if (!res.headersSent) reply(res, 502, 'Error de lectura del juego'); else res.destroy() }
    })
    outgoing.setTimeout(30000, () => outgoing.destroy())
    outgoing.on('error', () => { if (!res.headersSent) reply(res, 502, 'Juego local no disponible'); else res.destroy() })
  } catch { if (!res.headersSent) reply(res, 400, 'Petición inválida'); else res.destroy() }
})
server.listen(port, host, async () => {
  await fs.writeFile(dir + 'server.json', JSON.stringify({ origin, pid: process.pid, startedAt: new Date().toISOString(), build: manifest.build_id, scope: 'anonymous practice only; no DB/API/auth/Flow proxy', firewallChanged: false }, null, 2) + '\n')
  console.log(JSON.stringify({ origin, build: manifest.build_id, scope: 'practice only', stop: 'Ctrl+C' }))
})
server.on('error', error => { console.error(error.code); process.exitCode = 1 })
process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())

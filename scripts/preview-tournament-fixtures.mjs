// Read-only fixture service for `npm run dev:games`. No real Supabase or payments.
// Start separately, then open http://127.0.0.1:3080/tournaments.
import http from 'node:http'

let scenario = 'ready'
const scenarios = new Set(['ready', 'empty', 'catalog-error', 'count-error', 'detail-error'])
const ids = Array.from({ length: 4 }, (_, i) => `10000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)
function fixtures() {
  const now = Date.now()
  const iso = (delta) => new Date(now + delta * 60_000).toISOString()
  const base = {
    description: 'Torneo de demostración local. Revisa las condiciones antes de participar.',
    game_type: '2048_score', tournament_type: 'standard', prize_model: 'fixed',
    entry_fee_cents: 500000, prize_1st_cents: 2475000, prize_2nd_cents: 825000, prize_3rd_cents: 0,
    min_players: 12, max_players: 15, max_game_duration_seconds: 600,
    is_test: false, skill_tier: null, status: 'open',
    registration_opens_at: iso(-60), play_window_start: iso(120), play_window_end: iso(180),
  }
  return [
    { ...base, id: ids[3], name: '2048 · En curso', status: 'live', play_window_start: iso(-15), play_window_end: iso(30), count: 12 },
    { ...base, id: ids[2], name: '2048 · Cupos completos', count: 15 },
    { ...base, id: ids[1], name: '2048 · Próxima apertura', status: 'scheduled', registration_opens_at: iso(60), count: 0 },
    { ...base, id: ids[0], name: '2048 · Inscripciones abiertas', count: 12 },
  ]
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:59999')
  const json = (data, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data))
  }
  if (!['GET', 'HEAD'].includes(req.method)) return json({ message: 'Read-only fixtures: mutations are disabled.' }, 405)
  if (url.pathname === '/__fixture') {
    const requested = url.searchParams.get('scenario')
    if (requested && !scenarios.has(requested)) return json({ message: 'Unknown scenario' }, 400)
    if (requested) scenario = requested
    return json({ scenario, ids, synthetic: true })
  }
  if (url.pathname === '/rest/v1/tournaments') {
    const select = url.searchParams.get('select') ?? '*'
    if (scenario === 'catalog-error') return json({ message: 'Synthetic catalogue failure' }, 400)
    const filter = url.searchParams.get('id')
    if (scenario === 'detail-error' && filter?.startsWith('eq.')) return json({ message: 'Synthetic detail failure' }, 400)
    let rows = scenario === 'empty' ? [] : fixtures()
    if (filter?.startsWith('eq.')) rows = rows.filter((t) => t.id === filter.slice(3))
    if (filter?.startsWith('in.')) rows = rows.filter((t) => filter.includes(t.id))
    if (select === 'id,registrations(count)') {
      if (scenario === 'count-error') return json({ message: 'Synthetic count failure' }, 400)
      return json(rows.map((t) => ({ id: t.id, registrations: [{ count: t.count }] })))
    }
    rows = rows.map((t) => {
      const fields = select === '*' ? Object.keys(t).filter((key) => key !== 'count') : select.split(',')
      return Object.fromEntries(fields.map((key) => [key, t[key]]))
    })
    if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'Not found' }, 406)
    }
    return json(rows)
  }
  if (url.pathname === '/rest/v1/registrations' && req.method === 'HEAD') {
    if (scenario === 'count-error') return json({ message: 'Synthetic count failure' }, 400)
    const tournament = fixtures().find((t) => url.searchParams.get('tournament_id') === `eq.${t.id}`)
    res.writeHead(200, { 'content-range': `*/${tournament?.count ?? 0}` })
    return res.end()
  }
  if (url.pathname.startsWith('/auth/')) return json({ message: 'No synthetic authenticated session' }, 401)
  return json({ message: 'Unsupported fixture query' }, 404)
})

server.listen(59999, '127.0.0.1', () => console.log('Read-only tournament fixtures: http://127.0.0.1:59999/__fixture. Use with dev:games on port 3080.'))
server.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
process.on('SIGINT', () => server.close())

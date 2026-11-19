// Optional technical recorder outside the game GUI, installed only by the local probe.
(() => {
  const report = { schema: 1, build: 'unity-2048-007', model: '', userAgent: navigator.userAgent, startedAt: new Date().toISOString(), readyMs: null, metrics: [], events: [], devicePixelRatio, viewport: [], resources: [] }
  const stamp = () => ({ at: Date.now(), sinceLoadMs: Math.round(performance.now()) })
  const record = (type, data = {}) => { report.events.push({ type, ...stamp(), ...data }); if (report.events.length > 200) report.events.shift(); refresh() }
  function layout() { report.viewport.push({ ...stamp(), width: innerWidth, height: innerHeight, visibleHeight: visualViewport?.height ?? null, orientation: screen.orientation?.type ?? null }); if (report.viewport.length > 30) report.viewport.shift() }
  function refresh() {
    const out = document.getElementById('probe-output'); if (!out || !document.getElementById('probe-panel')?.open) return
    report.resources = performance.getEntriesByType('resource').filter(e => e.name.includes('/games/2048/')).map(e => ({ file: new URL(e.name).pathname, durationMs: Math.round(e.duration), transferSize: e.transferSize, encodedBytes: e.encodedBodySize, decodedBytes: e.decodedBodySize }))
    out.textContent = JSON.stringify(report, null, 2)
  }
  const state = () => ({ score: document.querySelector('[aria-label="Controles de la plataforma"] .sr-only')?.textContent ?? null, board: document.querySelector('caption')?.textContent ?? null })
  window.addEventListener('message', event => {
    const frame = document.querySelector('iframe[title="2048 · Unity"]')
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return
    const value = event.data
    if (value?.channel === 'torneos.2048' && value.version === 1 && value.build_id === report.build) {
      if (value.type === 'game.ready') { report.readyMs = Math.round(performance.now()); record('game.ready') }
      if (value.type === 'game.input') record('direction', { direction: value.direction })
      if (value.type === 'game.error') record('game.error')
    }
    if (value?.channel === 'torneos.2048.probe' && value.build === report.build) {
      if (value.type === 'metrics') {
        const { resources, ...metrics } = value.data
        report.capsuleResources = resources
        report.metrics.push({ ...stamp(), ...metrics }); if (report.metrics.length > 120) report.metrics.shift(); refresh()
      }
      else record(value.type, { detail: value.data })
    }
  })
  document.addEventListener('visibilitychange', () => record('visibility', { visibility: document.visibilityState, ...state() }))
  window.addEventListener('pageshow', event => record('pageshow', { persisted: event.persisted }))
  window.addEventListener('resize', layout)
  layout()
  const install = () => {
    if (!document.body || document.getElementById('probe-panel')) return
    const panel = document.createElement('details'); panel.id = 'probe-panel'
    panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:1000;background:#fff;color:#193337;border:1px solid #193337;border-radius:10px;padding:8px;max-width:calc(100vw - 16px);max-height:60vh;overflow:auto;font:14px system-ui'
    panel.innerHTML = '<summary style="min-height:36px;cursor:pointer">Prueba técnica 2048</summary><p>Práctica temporal. Sin cuentas ni torneos. Este informe no equivale a aceptación.</p><label>Modelo / versiones <input id="probe-model" maxlength="100" style="border:1px solid;padding:6px" placeholder="Xiaomi 12 Pro · Android … · Chrome …"></label><p>Inicia, desliza en cuatro direcciones, gira el teléfono y vuelve tras 30–60 s en segundo plano.</p><label>Observaciones <textarea id="probe-notes" maxlength="1000" style="display:block;border:1px solid;width:100%" placeholder="Fluidez, gestos perdidos o duplicados, orientación y regreso"></textarea></label><button id="probe-save" style="min-height:44px;border:1px solid;padding:8px">Guardar informe en el PC</button><p id="probe-receipt" role="status"></p><pre id="probe-output" style="font-size:11px;white-space:pre-wrap"></pre>'
    document.body.appendChild(panel)
    panel.addEventListener('toggle', refresh)
    document.getElementById('probe-save').onclick = async () => {
      report.model = document.getElementById('probe-model').value.trim()
      report.notes = document.getElementById('probe-notes').value.trim()
      record('save', state())
      const notice = document.getElementById('probe-receipt')
      try {
        const response = await fetch('/probe/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
        if (!response.ok) throw Error('save')
        const result = await response.json(); notice.textContent = 'Informe guardado: ' + result.receipt
      } catch { notice.textContent = 'No se pudo guardar. Mantén esta página abierta y vuelve a intentar.' }
    }
    refresh()
  }
  // Hydration can replace the body children after a deferred script runs.
  // Keep the optional recorder mounted without changing React's game subtree.
  const mount = () => {
    install()
    const observer = new MutationObserver(install)
    observer.observe(document.body, { childList: true })
    window.addEventListener('pagehide', event => { if (!event.persisted) observer.disconnect() })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
})()

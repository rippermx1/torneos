// Loaded only by the temporary proxy; the immutable capsule and live host stay untouched.
(() => {
  const send = (type, data) => parent.postMessage({ channel: 'torneos.2048.probe', build: 'unity-2048-007', type, data }, location.origin)
  const samples = []
  const pointer = event => {
    samples.push({ type: event.type, pointerType: event.pointerType, id: event.pointerId, x: Math.round(event.clientX), y: Math.round(event.clientY), at: Math.round(performance.now()) })
    if (samples.length > 20) samples.shift()
    send('pointer', samples.at(-1))
  }
  const attach = () => {
    const surface = document.querySelector('canvas')
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) surface?.addEventListener(type, pointer, { passive: true })
    surface?.addEventListener('webglcontextlost', () => send('contextLost', { at: Date.now() }))
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true })
  else attach()
  const timer = setInterval(() => {
    if (document.visibilityState !== 'visible' || typeof unity === 'undefined' || !unity?.GetMetricsInfo) return
    try {
      const info = unity.GetMetricsInfo(), metrics = {}
      for (const key of ['totalWASMHeapSize', 'usedWASMHeapSize', 'totalJSHeapSize', 'usedJSHeapSize', 'pageLoadTimeToFrame1', 'fps', 'movingAverageFps', 'numJankedFrames', 'assetLoadTime', 'codeDownloadTime', 'webAssemblyStartupTime', 'gameStartupTime']) {
        const value = info[key]; metrics[key] = Number.isFinite(value) && value >= 0 ? value : null
        if (/JSHeapSize/.test(key) && value <= 0) metrics[key] = null
      }
      metrics.canvas = { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight }
      metrics.resources = performance.getEntriesByType('resource').filter(e => e.name.includes('/Build/')).map(e => ({ file: new URL(e.name).pathname, durationMs: Math.round(e.duration), transferSize: e.transferSize, encodedBytes: e.encodedBodySize, decodedBytes: e.decodedBodySize }))
      send('metrics', metrics)
    } catch { send('metricsUnavailable', {}) }
  }, 1000)
  window.addEventListener('pagehide', event => { if (!event.persisted) clearInterval(timer) })
})()

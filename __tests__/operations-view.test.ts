import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const h=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('@/lib/ops/monitor',()=>({loadOperationalDashboard:h.load}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
import OperationsPage from '@/app/(admin)/admin/operations/page'
const now='2026-10-05T12:00:00Z'
beforeEach(()=>{
  h.load.mockReset().mockResolvedValue({snapshot:{observed_at:now,queues:[{key:'retained-prizes',title:'Premios retenidos',count:2,amount_cents:1500000,oldest_at:now,href:'/admin/prize-reviews'}],checks:[],jobs:[]},incidents:[],recovered:[],notifications:[],events:[],watchdog:{last_success_at:now},recentNotificationResults:[]})
})
describe('operations SSR information and failure state',()=>{
  it('shows obligation amount/age and distinguishes bank proof',async()=>{
    const html=renderToStaticMarkup(await OperationsPage())
    expect(html).toContain('Premios retenidos');expect(html).toContain('2 pendientes');expect(html).toContain('Más antiguo:')
    expect(html).toContain('caja bancaria está pendiente');expect(html).toContain('no sumarlos como exposición total')
  })
  it('query failure cannot render a healthy empty dashboard',async()=>{
    h.load.mockRejectedValue(new Error('DB unavailable'))
    const html=renderToStaticMarkup(await OperationsPage());expect(html).toContain('Comprobación operativa incompleta');expect(html).not.toContain('Sin incidentes')
  })
  it('stale watchdog warns that stored incidents can be outdated',async()=>{
    const data=await h.load();data.watchdog={last_success_at:null};h.load.mockResolvedValue(data)
    expect(renderToStaticMarkup(await OperationsPage())).toContain('Monitor sin éxito registrado')
  })
  it('acknowledged incident keeps pending obligation visible and does not offer manual closure',async()=>{
    const data=await h.load();data.incidents=[{id:'fixture',title:'Pagos desconocidos',severity:'critical',details:{},first_seen_at:now,last_seen_at:now,acknowledged_at:now,acknowledged_by:'operator',acknowledgement_note:'Verificación en curso'}];h.load.mockResolvedValue(data)
    const html=renderToStaticMarkup(await OperationsPage());expect(html).toContain('Atención asumida');expect(html).toContain('comprobación posterior de recuperación');expect(html).not.toContain('Cerrar incidente')
  })
  it('provider acceptance remains different from alternate receipt',async()=>{
    const data=await h.load();data.recentNotificationResults=[{id:'a',state:'accepted',subject:'Aviso A',accepted_at:now,provider_id:'provider-ref'},{id:'b',state:'received_manually',subject:'Aviso B',reviewed_at:now,reviewed_by:'operator',review_note:'Llamada documentada'}];h.load.mockResolvedValue(data)
    const html=renderToStaticMarkup(await OperationsPage());expect(html).toContain('Referencia provider-ref');expect(html).toContain('Recepción por otro canal');expect(html).not.toContain('Correo entregado')
  })
  it('attention form requires a concrete plan',async()=>{
    const {OpsAcknowledgement}=await import('@/components/admin/ops-acknowledgement')
    const html=renderToStaticMarkup(createElement(OpsAcknowledgement,{id:'fixture'}));expect(html).toContain('minLength="10"');expect(html).toContain('Asumir atención')
  })
})

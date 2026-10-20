import {describe,expect,it} from 'vitest'
// Installed Next 16.2.10 still exports this helper under its former name.
import {unstable_doesMiddlewareMatch as doesProxyMatch} from 'next/experimental/testing/server'
import {config} from '@/proxy'
import nextConfig from '@/next.config'
describe('Unity static files and application protection',()=>{
  it.each(['index.html','Build/game.wasm','Build/game.data','Build/game.framework.js','build-manifest.json'])('serves Unity %s without the authenticated proxy',file=>{
    expect(doesProxyMatch({config,nextConfig,url:`/games/2048/unity-2048-001/${file}`})).toBe(false)
  })
  it.each(['/admin','/api/tournaments/t1/game/move','/tournaments/t1/play/unity','/play'])('keeps the proxy on %s',url=>{
    expect(doesProxyMatch({config,nextConfig,url})).toBe(true)
  })
  it('only overrides framing for the Unity entry document',async()=>{
    const headers=await nextConfig.headers!()
    const global=headers.find(x=>x.source==='/(.*)') ?? headers[0]
    expect(global.headers.find(x=>x.key==='X-Frame-Options')?.value).toBe('DENY')
    const unity=headers.find(x=>x.source==='/games/:game/:build/index.html')!
    expect(unity.headers.find(x=>x.key==='X-Frame-Options')?.value).toBe('SAMEORIGIN')
    expect(unity.headers.find(x=>x.key==='Content-Security-Policy')?.value).toContain("frame-ancestors 'self'")
  })
})

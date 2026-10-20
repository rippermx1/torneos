import {describe,it,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {mkdirSync,writeFileSync} from 'node:fs'
import {readSnakeSponsor} from '../snake-result-sponsor'
import {SnakeResultSponsor} from '@/components/game/snake-result-sponsor'
import config from '@/config/snake-practice-sponsor.json'
const example={enabled:true,sponsor:'Patrocinador de ejemplo',title:'Tu marca junto a la próxima partida',description:'Vista previa del espacio preparado. Este ejemplo no es un patrocinio activo.',href:'/play'}
describe('prepared result sponsorship',()=>{
  it('ships disabled and adds no placeholder, link, request or whitespace to real results',()=>{
    expect(config.enabled).toBe(false);expect(readSnakeSponsor(config)).toBeNull()
    expect(renderToStaticMarkup(createElement(SnakeResultSponsor))).toBe('')
    for(const enabled of [false,'true',1,null,undefined])expect(readSnakeSponsor({...example,enabled})).toBeNull()
  })
  it('requires a complete bounded creative before rendering',()=>{
    for(const invalid of [{sponsor:''},{title:' '},{href:''},{sponsor:'x'.repeat(61)},{title:'x'.repeat(81)},{description:'x'.repeat(161)},{description:undefined},{href:{url:'/play'}}])expect(readSnakeSponsor({...example,...invalid})).toBeNull()
    expect(readSnakeSponsor({...example,description:''})).not.toBeNull()
    expect(readSnakeSponsor(null)).toBeNull()
  })
  it('rejects unsafe protocols, credentials, scheme-relative links and encoded separators',()=>{
    for(const href of ['javascript:alert(1)','data:text/html,hi','http://brand.example','file:///C:/secret','//brand.example','/\\brand.example','/%2fbrand.example','/a%5cb','https://user:password@brand.example','https://brand.example/\nunsafe'])expect(readSnakeSponsor({...example,href}),href).toBeNull()
    expect(readSnakeSponsor({...example,href:'https://brand.example/campaign?q=snake'})?.href).toBe('https://brand.example/campaign?q=snake')
    expect(readSnakeSponsor(example)?.href).toBe('/play')
  })
  it('labels advertising, escapes text and opens separately without scripts, trackers or player data',()=>{
    const markup=renderToStaticMarkup(createElement(SnakeResultSponsor,{configuration:{...example,title:'<script>not code</script>'}}))
    expect(markup).toContain('Publicidad de patrocinador');expect(markup).toContain('&lt;script&gt;not code&lt;/script&gt;')
    expect(markup).toContain('rel="sponsored nofollow noopener noreferrer"');expect(markup).toContain('target="_blank"')
    for(const absent of ['<script','<iframe','<img','userId','accountXp','setTimeout'])expect(markup).not.toContain(absent)
  })
  it('supports a local visual fixture without enabling the real configuration',()=>{
    const markup=renderToStaticMarkup(createElement(SnakeResultSponsor,{configuration:example}))
    expect(markup).toContain('Este ejemplo no es un patrocinio activo.');expect(config.enabled).toBe(false)
    if(process.env.SNAKE_SPONSOR_PREVIEW==='1'){
      mkdirSync('artifacts/snake-arena/sa146',{recursive:true})
      writeFileSync('artifacts/snake-arena/sa146/sponsor-preview.fragment.html',markup)
    }
  })
})

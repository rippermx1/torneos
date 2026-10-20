import {it,expect} from 'vitest'
import {SNAKE_APPEARANCES,canUseAppearance,cosmeticUnlockNotice,isSnakeAppearance} from '../snake-arena-cosmetics'
import {APPEARANCES} from '../../../games/snake-arena/server/src/cosmetics'
it('web collection matches server identities and preserves the three starting skins',()=>{
  expect(SNAKE_APPEARANCES.map(s=>s.id)).toEqual([...APPEARANCES])
  expect(SNAKE_APPEARANCES.filter(s=>canUseAppearance(s.id,null)).map(s=>s.id)).toEqual(['aurora','nebula','solar'])
  expect(SNAKE_APPEARANCES.filter(s=>canUseAppearance(s.id,200)).map(s=>s.name)).toContain('Cometa')
  expect(canUseAppearance('eclipse',399)).toBe(false);expect(canUseAppearance('prism',700)).toBe(true)
  for(const unknown of [null,'admin',{id:'comet'}])expect(isSnakeAppearance(unknown)).toBe(false)
})
it('announces each newly confirmed unlock once and does not celebrate initial account hydration',()=>{
  expect(cosmeticUnlockNotice(null,895)).toBe('');expect(cosmeticUnlockNotice(199,200)).toContain('Cometa')
  expect(cosmeticUnlockNotice(399,400)).toContain('Eclipse');expect(cosmeticUnlockNotice(699,700)).toContain('Prisma')
  expect(cosmeticUnlockNotice(190,700)).toContain('Cometa, Eclipse, Prisma')
  expect(cosmeticUnlockNotice(700,700)).toBe('');expect(cosmeticUnlockNotice(200,190)).toBe('')
})

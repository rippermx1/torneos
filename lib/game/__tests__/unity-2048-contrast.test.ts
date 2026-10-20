import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const source = readFileSync('games/2048/UnityProject/Assets/Torneos/2048/Runtime/PuzzleClient.cs', 'utf8')
const luminance = (rgb: number[]) => rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0)
const rgb = (values: string) => values.split(',').map(value => Number(value.trim().replace('f', '')))
const ink = rgb(source.match(/Ink = new Color\(([^)]+)\)/)![1])
const palette = [...source.matchAll(/(\d+|_) => new Color\(([^)]+)\)/g)].filter(match => match[1] !== '0')
it.each(palette.map(match => [match[1], rgb(match[2])] as const))('keeps nominal tile %s text contrast above 4.5:1, including smaller viewports', (value, background) => {
  const foreground = Number(value) >= 8 && Number(value) <= 64 ? [1,1,1] : ink
  const light = luminance(foreground), dark = luminance(background)
  const ratio = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05)
  expect(ratio).toBeGreaterThanOrEqual(4.5)
})

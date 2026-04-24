// Paleta visual mejorada — gradientes + glow progresivo
export interface TileVisual {
  background: string
  color: string
  fontSize: string
  textShadow?: string
  boxShadow?: string
}

const TILE_VISUALS: Record<number, TileVisual> = {
  0: {
    background: 'rgba(205,193,180,0.35)',
    color: 'transparent',
    fontSize: '2rem',
  },
  2: {
    background: 'linear-gradient(145deg,#f0e8dc,#eee4da)',
    color: '#776e65',
    fontSize: '2rem',
  },
  4: {
    background: 'linear-gradient(145deg,#f0dfc0,#ede0c8)',
    color: '#776e65',
    fontSize: '2rem',
  },
  8: {
    background: 'linear-gradient(145deg,#f7c08a,#f2b179)',
    color: '#fff',
    fontSize: '2rem',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  16: {
    background: 'linear-gradient(145deg,#f9aa7a,#f59563)',
    color: '#fff',
    fontSize: '2rem',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  32: {
    background: 'linear-gradient(145deg,#f99070,#f67c5f)',
    color: '#fff',
    fontSize: '2rem',
    textShadow: '0 1px 3px rgba(0,0,0,0.25)',
  },
  64: {
    background: 'linear-gradient(145deg,#f87550,#f65e3b)',
    color: '#fff',
    fontSize: '2rem',
    textShadow: '0 1px 3px rgba(0,0,0,0.3)',
    boxShadow: '0 0 12px 2px rgba(246,94,59,0.35)',
  },
  128: {
    background: 'linear-gradient(145deg,#f2d870,#edcf72)',
    color: '#fff',
    fontSize: '1.75rem',
    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
    boxShadow: '0 0 16px 4px rgba(237,207,114,0.55)',
  },
  256: {
    background: 'linear-gradient(145deg,#f2d45e,#edcc61)',
    color: '#fff',
    fontSize: '1.75rem',
    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
    boxShadow: '0 0 20px 5px rgba(237,204,97,0.6)',
  },
  512: {
    background: 'linear-gradient(145deg,#f2cf44,#edc850)',
    color: '#fff',
    fontSize: '1.75rem',
    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
    boxShadow: '0 0 24px 7px rgba(237,200,80,0.65)',
  },
  1024: {
    background: 'linear-gradient(145deg,#f2ca30,#edc53f)',
    color: '#fff',
    fontSize: '1.5rem',
    textShadow: '0 1px 5px rgba(0,0,0,0.35)',
    boxShadow: '0 0 30px 10px rgba(237,197,63,0.75)',
  },
  2048: {
    background: 'linear-gradient(145deg,#f0c41e,#edc22e)',
    color: '#fff',
    fontSize: '1.5rem',
    textShadow: '0 2px 6px rgba(0,0,0,0.4)',
    boxShadow: '0 0 40px 14px rgba(237,194,46,0.85), 0 0 60px 20px rgba(237,194,46,0.4)',
  },
}

const SUPER_TILE: TileVisual = {
  background: 'linear-gradient(145deg,#3d3a2e,#1e1b10)',
  color: '#fff',
  fontSize: '1.25rem',
  textShadow: '0 2px 8px rgba(237,194,46,0.8)',
  boxShadow: '0 0 40px 14px rgba(237,194,46,0.9), 0 0 80px 30px rgba(237,100,20,0.5)',
}

export function getTileVisual(value: number): TileVisual {
  return TILE_VISUALS[value] ?? SUPER_TILE
}

// Compat con código existente que usa getTileStyle
export function getTileStyle(value: number) {
  const v = getTileVisual(value)
  return { bg: '', text: '', fontSize: '' , _visual: v }
}

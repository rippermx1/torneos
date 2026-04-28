import type { GameRandomSource } from './random-source'

export type Board = number[][]
export type Direction = 'up' | 'down' | 'left' | 'right'

export interface MoveResult {
  moved: boolean
  scoreGained: number
  boardAfter: Board
  spawnedTile: SpawnedTile | null
}

export interface SpawnedTile {
  row: number
  col: number
  value: 2 | 4
}

export class Game2048 {
  board: Board
  score: number

  constructor(board?: Board, score = 0) {
    this.board = board ? deepCopy(board) : emptyBoard()
    this.score = score
  }

  // Ejecuta un movimiento y spawnea un tile si hubo cambio.
  // Retorna el resultado completo para persistir en game_moves.
  applyMove(direction: Direction, rng: GameRandomSource): MoveResult {
    const { moved, scoreGained } = this.slide(direction)

    let spawnedTile: SpawnedTile | null = null
    if (moved) {
      this.score += scoreGained
      spawnedTile = this.spawnTile(rng)
    }

    return {
      moved,
      scoreGained,
      boardAfter: deepCopy(this.board),
      spawnedTile,
    }
  }

  // Spawnea un tile en una celda vacía aleatoria usando el RNG determinístico.
  // Retorna null si no hay celdas vacías (no debería ocurrir justo después de un move válido).
  spawnTile(rng: GameRandomSource): SpawnedTile | null {
    const empty = this.emptyCells()
    if (empty.length === 0) return null

    const idx = Math.floor(rng.next() * empty.length)
    const [row, col] = empty[idx]!
    const value = rng.spawnValue()
    this.board[row]![col] = value
    return { row, col, value }
  }

  canMove(): boolean {
    // Hay celda vacía
    if (this.emptyCells().length > 0) return true

    // Hay merge horizontal posible
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        if (this.board[r]![c] === this.board[r]![c + 1]) return true
      }
    }

    // Hay merge vertical posible
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r]![c] === this.board[r + 1]![c]) return true
      }
    }

    return false
  }

  highestTile(): number {
    return Math.max(...this.board.flat())
  }

  emptyCells(): [number, number][] {
    const cells: [number, number][] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r]![c] === 0) cells.push([r, c])
      }
    }
    return cells
  }

  // ── Lógica de slide ─────────────────────────────────────────

  private slide(direction: Direction): { moved: boolean; scoreGained: number } {
    // Normalizamos todo a "deslizar hacia la izquierda" rotando el tablero.
    const rotations = { left: 0, up: 1, right: 2, down: 3 }
    const times = rotations[direction]

    this.board = rotateBoard(this.board, times)
    const { moved, scoreGained } = this.slideLeft()
    this.board = rotateBoard(this.board, 4 - times)

    return { moved, scoreGained }
  }

  // Desliza todas las filas hacia la izquierda.
  private slideLeft(): { moved: boolean; scoreGained: number } {
    let moved = false
    let scoreGained = 0

    for (let r = 0; r < 4; r++) {
      const row = this.board[r]!
      const { newRow, scoreGained: rowScore, changed } = slideRowLeft(row)
      this.board[r] = newRow
      scoreGained += rowScore
      if (changed) moved = true
    }

    return { moved, scoreGained }
  }
}

// ── Funciones puras (exportadas para testing) ────────────────

// Desliza una fila de 4 celdas hacia la izquierda y hace merges.
// Ejemplo: [2, 0, 2, 4] → [4, 4, 0, 0] (score +4)
export function slideRowLeft(row: number[]): {
  newRow: number[]
  scoreGained: number
  changed: boolean
} {
  const original = [...row]

  // 1. Comprimir: quitar ceros
  const tiles = row.filter((v) => v !== 0)

  // 2. Merge: combinar tiles iguales adyacentes (una sola vez por tile)
  let scoreGained = 0
  const merged: number[] = []
  let i = 0
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const value = tiles[i]! * 2
      merged.push(value)
      scoreGained += value
      i += 2
    } else {
      merged.push(tiles[i]!)
      i++
    }
  }

  // 3. Rellenar con ceros a la derecha
  while (merged.length < 4) merged.push(0)

  const changed = !arraysEqual(original, merged)
  return { newRow: merged, scoreGained, changed }
}

// Rota el tablero 90° en sentido antihorario, `times` veces.
// Esto permite tratar up/right/down como variaciones de slideLeft.
export function rotateBoard(board: Board, times: number): Board {
  let result = deepCopy(board)
  const t = ((times % 4) + 4) % 4
  for (let i = 0; i < t; i++) {
    result = rotateCCW(result)
  }
  return result
}

function rotateCCW(board: Board): Board {
  const n = 4
  const result = emptyBoard()
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      result[n - 1 - c]![r] = board[r]![c]!
    }
  }
  return result
}

export function emptyBoard(): Board {
  return Array.from({ length: 4 }, () => Array(4).fill(0))
}

export function deepCopy(board: Board): Board {
  return board.map((row) => [...row])
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// Inicializa un tablero nuevo con 2 tiles spawneados (estado inicial del 2048).
export function initializeBoard(rng: GameRandomSource): Board {
  const game = new Game2048()
  // El primer spawn usa el RNG con moveNumber=0 (pre-game), el segundo con moveNumber=1
  // Pero como spawnTile consume 2 llamadas a rng.next() (posición + valor),
  // usamos rng directamente con el estado actual.
  game.spawnTile(rng)
  game.spawnTile(rng)
  return game.board
}

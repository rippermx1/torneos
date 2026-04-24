import { describe, it, expect } from 'vitest'
import {
  Game2048,
  slideRowLeft,
  rotateBoard,
  deepCopy,
  type Board,
} from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'

// ── slideRowLeft ─────────────────────────────────────────────

describe('slideRowLeft', () => {
  it('merge básico: dos tiles iguales adyacentes', () => {
    const { newRow, scoreGained, changed } = slideRowLeft([2, 2, 0, 0])
    expect(newRow).toEqual([4, 0, 0, 0])
    expect(scoreGained).toBe(4)
    expect(changed).toBe(true)
  })

  it('merge con gap: tiles iguales separados por cero', () => {
    const { newRow, scoreGained } = slideRowLeft([2, 0, 2, 0])
    expect(newRow).toEqual([4, 0, 0, 0])
    expect(scoreGained).toBe(4)
  })

  it('merge doble en la misma fila: [2,2,2,2] → [4,4,0,0]', () => {
    const { newRow, scoreGained } = slideRowLeft([2, 2, 2, 2])
    expect(newRow).toEqual([4, 4, 0, 0])
    expect(scoreGained).toBe(8)
  })

  it('no merge triple: [2,2,2,0] → [4,2,0,0]', () => {
    const { newRow, scoreGained } = slideRowLeft([2, 2, 2, 0])
    expect(newRow).toEqual([4, 2, 0, 0])
    expect(scoreGained).toBe(4)
  })

  it('no merge si tiles distintos', () => {
    const { newRow, scoreGained, changed } = slideRowLeft([2, 4, 2, 4])
    expect(newRow).toEqual([2, 4, 2, 4])
    expect(scoreGained).toBe(0)
    expect(changed).toBe(false)
  })

  it('comprime ceros a la derecha', () => {
    const { newRow, changed } = slideRowLeft([0, 2, 0, 4])
    expect(newRow).toEqual([2, 4, 0, 0])
    expect(changed).toBe(true)
  })

  it('fila vacía no cambia', () => {
    const { newRow, scoreGained, changed } = slideRowLeft([0, 0, 0, 0])
    expect(newRow).toEqual([0, 0, 0, 0])
    expect(scoreGained).toBe(0)
    expect(changed).toBe(false)
  })

  it('fila completa sin merges no cambia', () => {
    const { newRow, changed } = slideRowLeft([2, 4, 8, 16])
    expect(newRow).toEqual([2, 4, 8, 16])
    expect(changed).toBe(false)
  })

  it('tile único se mueve al inicio', () => {
    const { newRow, changed } = slideRowLeft([0, 0, 0, 8])
    expect(newRow).toEqual([8, 0, 0, 0])
    expect(changed).toBe(true)
  })

  it('merge produce tile grande: [1024, 1024, 0, 0] → [2048, 0, 0, 0]', () => {
    const { newRow, scoreGained } = slideRowLeft([1024, 1024, 0, 0])
    expect(newRow).toEqual([2048, 0, 0, 0])
    expect(scoreGained).toBe(2048)
  })

  it('un tile ya a la izquierda no cambia', () => {
    const { changed } = slideRowLeft([4, 0, 0, 0])
    expect(changed).toBe(false)
  })
})

// ── rotateBoard ──────────────────────────────────────────────

describe('rotateBoard', () => {
  const board: Board = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
  ]

  it('0 rotaciones devuelve el mismo tablero', () => {
    expect(rotateBoard(board, 0)).toEqual(board)
  })

  it('4 rotaciones devuelve el tablero original', () => {
    expect(rotateBoard(board, 4)).toEqual(board)
  })

  it('1 rotación CCW: primera columna → última fila, última columna → primera fila', () => {
    const rotated = rotateBoard(board, 1)
    // col 0 del original [1,5,9,13] → última fila del rotado
    expect(rotated[3]).toEqual([1, 5, 9, 13])
    // col 3 del original [4,8,12,16] → primera fila del rotado
    expect(rotated[0]).toEqual([4, 8, 12, 16])
  })

  it('2 rotaciones = 180°: esquina top-left pasa a bottom-right', () => {
    const rotated = rotateBoard(board, 2)
    expect(rotated[0]![0]).toBe(board[3]![3])
    expect(rotated[3]![3]).toBe(board[0]![0])
  })

  it('no muta el tablero original', () => {
    const original = deepCopy(board)
    rotateBoard(board, 1)
    expect(board).toEqual(original)
  })
})

// ── Game2048 ─────────────────────────────────────────────────

function makeRNG(seed = 'test', move = 0) {
  return new DeterministicRNG(seed, move)
}

// Crea un tablero con valores específicos para tests controlados
function makeBoard(values: number[][]): Board {
  return values.map((row) => [...row])
}

describe('Game2048 - movimientos básicos', () => {
  it('slide left: mueve y mergea hacia la izquierda', () => {
    const board = makeBoard([
      [0, 0, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const rng = makeRNG()
    const result = game.applyMove('left', rng)

    expect(result.moved).toBe(true)
    expect(result.scoreGained).toBe(4)
    expect(game.board[0]![0]).toBe(4)
    expect(game.score).toBe(4)
  })

  it('slide right: mueve y mergea hacia la derecha', () => {
    const board = makeBoard([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const result = game.applyMove('right', makeRNG())

    expect(result.moved).toBe(true)
    expect(game.board[0]![3]).toBe(4)
  })

  it('slide up: mueve y mergea hacia arriba', () => {
    const board = makeBoard([
      [0, 2, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    game.applyMove('up', makeRNG())

    expect(game.board[0]![1]).toBe(4)
    expect(game.board[1]![1]).toBe(0)
  })

  it('slide down: mueve y mergea hacia abajo', () => {
    const board = makeBoard([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 2, 0, 0],
      [0, 2, 0, 0],
    ])
    const game = new Game2048(board)
    const result = game.applyMove('down', makeRNG())

    expect(result.moved).toBe(true)
    expect(game.board[3]![1]).toBe(4)
    // [2][1] puede tener un tile spawneado; lo que importa es que el merge ocurrió
    expect(result.scoreGained).toBe(4)
  })

  it('move no-op: tablero sin posibles moves en esa dirección', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const boardBefore = deepCopy(game.board)
    const result = game.applyMove('left', makeRNG())

    expect(result.moved).toBe(false)
    expect(result.scoreGained).toBe(0)
    expect(game.board).toEqual(boardBefore)
    expect(result.spawnedTile).toBeNull()
  })

  it('no spawnea tile si el move no tuvo efecto', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const result = game.applyMove('left', makeRNG())
    expect(result.spawnedTile).toBeNull()
  })

  it('spawnea tile en celda vacía después de un move válido', () => {
    const board = makeBoard([
      [0, 0, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const result = game.applyMove('left', makeRNG())

    expect(result.spawnedTile).not.toBeNull()
    expect([2, 4]).toContain(result.spawnedTile!.value)
    // El tile spawneado no ocupa la posición del merge
    const { row, col } = result.spawnedTile!
    expect(game.board[row]![col]).toBe(result.spawnedTile!.value)
  })

  it('acumula score correctamente a lo largo de varios moves', () => {
    const board = makeBoard([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    game.applyMove('left', makeRNG('seed', 0))
    // [4, 8, 0, 0] + spawn
    expect(game.score).toBe(12) // 4 + 8
  })
})

describe('Game2048 - canMove', () => {
  it('tablero vacío puede moverse', () => {
    const game = new Game2048()
    expect(game.canMove()).toBe(true)
  })

  it('tablero con celdas vacías puede moverse', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 0],
      [2, 4, 8, 16],
    ])
    expect(new Game2048(board).canMove()).toBe(true)
  })

  it('tablero lleno con merges posibles puede moverse', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4],
      [2, 4, 8, 4], // últimas dos columnas de fila 3 son 4,4 → merge posible
    ])
    expect(new Game2048(board).canMove()).toBe(true)
  })

  it('tablero lleno sin merges posibles: game over', () => {
    // Tablero en el que ninguna celda adyacente es igual (clásico game over)
    const board = makeBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
    expect(new Game2048(board).canMove()).toBe(false)
  })

  it('merge posible solo en vertical', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [2, 32, 64, 128],  // primera columna tiene 2,2 → merge vertical
      [256, 512, 1024, 2],
      [4, 8, 16, 32],
    ])
    expect(new Game2048(board).canMove()).toBe(true)
  })
})

describe('Game2048 - highestTile', () => {
  it('retorna el tile más alto del tablero', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 0],
      [0, 0, 0, 0],
    ])
    expect(new Game2048(board).highestTile()).toBe(2048)
  })

  it('tablero vacío retorna 0', () => {
    expect(new Game2048().highestTile()).toBe(0)
  })
})

describe('Game2048 - inmutabilidad', () => {
  it('el constructor con board hace deep copy: no comparte referencia', () => {
    const board = makeBoard([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const game = new Game2048(board)
    board[0]![0] = 999
    expect(game.board[0]![0]).toBe(2)
  })

  it('boardAfter en MoveResult es independiente del estado interno', () => {
    const board = makeBoard([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const game = new Game2048(board)
    const result = game.applyMove('left', makeRNG())
    // Modificar el resultado no afecta el estado interno del game
    result.boardAfter[0]![0] = 9999
    expect(game.board[0]![0]).toBe(4)
  })
})

describe('Game2048 - merges múltiples y casos complejos', () => {
  it('merge en cadena no ocurre: [4,2,2,4] → [4,4,4,0] no [8,4,0,0]', () => {
    const { newRow } = slideRowLeft([4, 2, 2, 4])
    expect(newRow).toEqual([4, 4, 4, 0])
  })

  it('tablero con merges en todas las filas simultáneamente', () => {
    const board = makeBoard([
      [2, 2, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [16, 16, 0, 0],
    ])
    const game = new Game2048(board)
    game.applyMove('left', makeRNG())
    expect(game.score).toBe(4 + 8 + 16 + 32)
    expect(game.board[0]![0]).toBe(4)
    expect(game.board[1]![0]).toBe(8)
    expect(game.board[2]![0]).toBe(16)
    expect(game.board[3]![0]).toBe(32)
  })

  it('merge máximo: dos 1024 producen 2048', () => {
    const board = makeBoard([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    const result = game.applyMove('left', makeRNG())
    expect(game.board[0]![0]).toBe(2048)
    expect(result.scoreGained).toBe(2048)
  })

  it('movimientos consecutivos mantienen estado correcto', () => {
    const board = makeBoard([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game = new Game2048(board)
    game.applyMove('left', makeRNG('s', 0))
    // Ahora hay un 4 en [0][0] y un spawn en algún lugar vacío
    expect(game.board[0]![0]).toBe(4)
    expect(game.score).toBe(4)
  })
})

describe('Game2048 - emptyCells', () => {
  it('tablero vacío tiene 16 celdas', () => {
    expect(new Game2048().emptyCells()).toHaveLength(16)
  })

  it('tablero lleno tiene 0 celdas vacías', () => {
    const board = makeBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
    expect(new Game2048(board).emptyCells()).toHaveLength(0)
  })

  it('cuenta correctamente celdas vacías', () => {
    const board = makeBoard([
      [2, 0, 0, 0],
      [0, 4, 0, 0],
      [0, 0, 8, 0],
      [0, 0, 0, 16],
    ])
    expect(new Game2048(board).emptyCells()).toHaveLength(12)
  })
})

describe('Game2048 - spawnTile', () => {
  it('no spawnea si no hay celdas vacías', () => {
    const board = makeBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
    const game = new Game2048(board)
    const result = game.spawnTile(makeRNG())
    expect(result).toBeNull()
  })

  it('spawnea en una celda que estaba vacía', () => {
    const board = makeBoard([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4],
      [8, 16, 32, 0], // solo una celda vacía
    ])
    const game = new Game2048(board)
    const tile = game.spawnTile(makeRNG())
    expect(tile).not.toBeNull()
    expect(tile!.row).toBe(3)
    expect(tile!.col).toBe(3)
    expect(game.board[3]![3]).toBe(tile!.value)
  })

  it('valor spawneado es 2 o 4', () => {
    for (let i = 0; i < 20; i++) {
      const game = new Game2048()
      const tile = game.spawnTile(new DeterministicRNG('seed', i))
      expect([2, 4]).toContain(tile!.value)
    }
  })

  it('determinístico: mismo seed produce el mismo spawn', () => {
    const board = makeBoard([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const game1 = new Game2048(board)
    const game2 = new Game2048(board)
    const tile1 = game1.spawnTile(new DeterministicRNG('same-seed', 0))
    const tile2 = game2.spawnTile(new DeterministicRNG('same-seed', 0))
    expect(tile1).toEqual(tile2)
  })
})

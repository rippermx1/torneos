'use client'

import { memo, useEffect, useCallback, useRef, useState } from 'react'
import { getTileVisual } from './tile-colors'
import { applyLocalPracticeMove, createLocalPracticeGame } from '@/lib/game/local-practice'
import { predictRemoteMove } from '@/lib/game/optimistic-remote'
import type { Direction } from '@/types/game'

export interface GameConfig {
  mode?: 'local' | 'remote'
  startUrl: string
  moveUrl: string
  timeoutUrl?: string
  extraMovePayload?: Record<string, unknown>
  timeLimitSeconds?: number
  playWindowEnd?: string
  onGameOver?: (score: number) => void
}

interface GameState {
  board: number[][]
  score: number
  seed: string
  moveNumber: number
  gameId?: string
  gameOver: boolean
  bestScore: number
  timedOut: boolean
  deadlineAt?: string
}

// Cada celda sabe exactamente cuánto y en qué dirección se desplaza
interface CellAnim {
  slideX: number   // px, offset de inicio (0 = sin desplazamiento horizontal)
  slideY: number   // px, offset de inicio (0 = sin desplazamiento vertical)
  isMerge: boolean // bump adicional al llegar
  isSpawn: boolean // tile nuevo generado por el servidor (pop-in)
  v: number        // versión → re-mount para re-disparar animación
}

// Un tile por celda: de dónde viene
interface TrackedMove {
  value: number
  fromRow: number
  fromCol: number
  isMerge: boolean
}

// Tamaño de celda en px (tile + gap) para calcular offsets de slide
const CELL = 100 // 90px tile + 10px gap ≈ 100px

const SWIPE_MIN = 30

function boardsEqual(left: number[][], right: number[][]) {
  return left.length === right.length &&
    left.every((row, rowIndex) =>
      row.length === right[rowIndex]?.length &&
      row.every((value, colIndex) => value === right[rowIndex]?.[colIndex])
    )
}

// ── Algoritmo de tracking ────────────────────────────────────
// Simula el deslizamiento de una fila hacia la izquierda y devuelve,
// para cada posición del resultado, qué índice de origen le corresponde.
function slideRowLeft(row: number[]): TrackedMove[] {
  const tiles = row
    .map((v, i) => ({ v, i }))
    .filter((t) => t.v !== 0)

  const result: TrackedMove[] = []
  let i = 0
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i].v === tiles[i + 1].v) {
      // Merge: el tile destino viene "de" el tile más lejano (el que viaja más)
      result.push({
        value: tiles[i].v * 2,
        fromRow: -1, // se rellena afuera
        fromCol: tiles[i + 1].i,
        isMerge: true,
      })
      i += 2
    } else {
      result.push({
        value: tiles[i].v,
        fromRow: -1,
        fromCol: tiles[i].i,
        isMerge: false,
      })
      i++
    }
  }
  return result
}

function computeTileMovements(
  prev: number[][],
  next: number[][],
  dir: Direction,
): Map<string, CellAnim> {
  const map = new Map<string, Omit<CellAnim, 'v'>>()

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < 4; r++) {
      const prevRow = dir === 'right' ? [...prev[r]].reverse() : prev[r]
      const moves = slideRowLeft(prevRow)

      moves.forEach((m, destIdxNorm) => {
        // Convertir índices normalizados (como si fuera left) → reales
        const destC = dir === 'right' ? 3 - destIdxNorm : destIdxNorm
        const fromC = dir === 'right' ? 3 - m.fromCol : m.fromCol
        const slideX = (fromC - destC) * CELL

        map.set(`${r}-${destC}`, {
          slideX,
          slideY: 0,
          isMerge: m.isMerge,
          isSpawn: false,
        })
      })
    }
  } else {
    // up / down: operar sobre columnas
    for (let c = 0; c < 4; c++) {
      const prevCol = prev.map((row) => row[c])
      const colNorm = dir === 'down' ? [...prevCol].reverse() : prevCol
      const moves = slideRowLeft(colNorm)

      moves.forEach((m, destIdxNorm) => {
        const destR = dir === 'down' ? 3 - destIdxNorm : destIdxNorm
        const fromR = dir === 'down' ? 3 - m.fromCol : m.fromCol
        const slideY = (fromR - destR) * CELL

        map.set(`${destR}-${c}`, {
          slideX: 0,
          slideY,
          isMerge: m.isMerge,
          isSpawn: false,
        })
      })
    }
  }

  // Tile spawneado por el servidor: posición en next no cubierta por moves
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (next[r][c] !== 0 && !map.has(`${r}-${c}`)) {
        map.set(`${r}-${c}`, { slideX: 0, slideY: 0, isMerge: false, isSpawn: true })
      }
    }
  }

  return map as Map<string, CellAnim>
}

// ── Componente principal ─────────────────────────────────────

export function GameBoardClient({ config }: { config: GameConfig }) {
  const isLocalMode = config.mode === 'local'
  const [state, setState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const [shaking, setShaking] = useState(false)
  const [scoreFloat, setScoreFloat] = useState<{ delta: number; key: number } | null>(null)
  const [cellAnims, setCellAnims] = useState<Map<string, CellAnim>>(new Map())

  const prevBoardRef = useRef<number[][] | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const animVersionRef = useRef(0)
  const animResetTimeoutRef = useRef<number | null>(null)
  const scoreFloatTimeoutRef = useRef<number | null>(null)
  const shakeTimeoutRef = useRef<number | null>(null)
  const moveRequestIdRef = useRef(0)
  const timeoutReportedRef = useRef(false)

  // Temporizador
  useEffect(() => {
    const deadlineAt = state?.deadlineAt ?? config.playWindowEnd
    if (!deadlineAt) return
    const end = new Date(deadlineAt).getTime()
    if (!Number.isFinite(end)) return

    const reportTimeout = () => {
      if (isLocalMode || !config.timeoutUrl || !state?.gameId || timeoutReportedRef.current) return
      timeoutReportedRef.current = true
      void fetch(config.timeoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: state.gameId }),
      }).catch(() => {
        timeoutReportedRef.current = false
      })
    }

    const tick = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) {
        setState((p) => p ? { ...p, timedOut: true, gameOver: true } : p)
        reportTimeout()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [config.playWindowEnd, config.timeoutUrl, isLocalMode, state?.deadlineAt, state?.gameId])

  const triggerAnims = useCallback(
    (prev: number[][] | null, next: number[][], dir: Direction | null) => {
      animVersionRef.current += 1
      const v = animVersionRef.current

      let map: Map<string, CellAnim>
      if (!prev || !dir) {
        // Inicio de partida: todos los tiles hacen spawn
        map = new Map()
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            if (next[r][c] !== 0) {
              map.set(`${r}-${c}`, { slideX: 0, slideY: 0, isMerge: false, isSpawn: true, v })
            }
          }
        }
      } else {
        const base = computeTileMovements(prev, next, dir)
        map = new Map()
        base.forEach((anim, key) => map.set(key, { ...anim, v }))
      }

      setCellAnims(map)

      if (animResetTimeoutRef.current !== null) {
        window.clearTimeout(animResetTimeoutRef.current)
      }

      animResetTimeoutRef.current = window.setTimeout(() => {
        setCellAnims(new Map())
      }, 350)
    },
    [],
  )

  const applyNewBoard = useCallback(
    (
      newBoard: number[][],
      newScore: number,
      prevScore: number,
      dir: Direction,
      extra: Partial<GameState>,
      options?: { animate?: boolean; notifyGameOver?: boolean }
    ) => {
      const animate = options?.animate ?? true
      const notifyGameOver = options?.notifyGameOver ?? true
      const delta = newScore - prevScore
      if (delta > 0) {
        setScoreFloat({ delta, key: Date.now() })
        if (scoreFloatTimeoutRef.current !== null) {
          window.clearTimeout(scoreFloatTimeoutRef.current)
        }
        scoreFloatTimeoutRef.current = window.setTimeout(() => setScoreFloat(null), 900)
      }
      if (animate) {
        triggerAnims(prevBoardRef.current, newBoard, dir)
      } else {
        setCellAnims(new Map())
      }
      prevBoardRef.current = newBoard
      setState((prev) => {
        if (!prev) return prev
        if (extra.gameOver && notifyGameOver) config.onGameOver?.(newScore)
        return { ...prev, board: newBoard, score: newScore, bestScore: Math.max(prev.bestScore, newScore), ...extra }
      })
    },
    [triggerAnims, config],
  )

  const rollbackState = useCallback((snapshot: GameState, override?: Partial<GameState>) => {
    prevBoardRef.current = snapshot.board
    setCellAnims(new Map())
    setScoreFloat(null)
    setState({
      ...snapshot,
      ...override,
      bestScore: Math.max(snapshot.bestScore, override?.score ?? snapshot.score),
    })
  }, [])

  const loadGame = useCallback(async () => {
    try {
      timeoutReportedRef.current = false
      if (isLocalMode) {
        const localGame = createLocalPracticeGame()

        triggerAnims(null, localGame.board, null)
        prevBoardRef.current = localGame.board
        setState((prev) => ({
          board: localGame.board,
          score: localGame.score,
          seed: localGame.seed,
          moveNumber: localGame.moveNumber,
          gameOver: false,
          timedOut: false,
          deadlineAt: undefined,
          bestScore: prev?.bestScore ?? 0,
        }))
        return
      }

      const res = await fetch(config.startUrl, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al iniciar partida'); return }

      const newBoard = data.board as number[][]
      triggerAnims(null, newBoard, null)
      prevBoardRef.current = newBoard
      setState((prev) => ({
        board: newBoard,
        score: Number(data.score ?? 0),
        seed: data.seed,
        moveNumber: data.moveNumber,
        gameId: data.gameId,
        gameOver: false,
        timedOut: false,
        deadlineAt: typeof data.deadlineAt === 'string' ? data.deadlineAt : config.playWindowEnd,
        bestScore: prev?.bestScore ?? 0,
      }))
    } catch {
      setError('Error de conexión al iniciar partida')
    } finally {
      setLoading(false)
    }
  }, [config.playWindowEnd, config.startUrl, isLocalMode, triggerAnims])

  const startGame = useCallback(() => {
    setLoading(true)
    setError(null)
    timeoutReportedRef.current = false
    prevBoardRef.current = null
    setCellAnims(new Map())
    void loadGame()
  }, [loadGame])

  const sendMove = useCallback(async (direction: Direction) => {
    if (!state || state.gameOver || state.timedOut || moving || loading) return
    const requestId = moveRequestIdRef.current + 1
    moveRequestIdRef.current = requestId
    const baselineState = state
    setMoving(true)
    try {
      if (isLocalMode) {
        const data = applyLocalPracticeMove(state, direction)

        if (!data.moved) {
          setShaking(true)
          if (shakeTimeoutRef.current !== null) {
            window.clearTimeout(shakeTimeoutRef.current)
          }
          shakeTimeoutRef.current = window.setTimeout(() => setShaking(false), 400)
          return
        }

        applyNewBoard(data.board, Number(data.score), state.score, direction, {
          moveNumber: data.moveNumber,
          gameOver: data.gameOver ?? false,
        })
        return
      }

      const payload: Record<string, unknown> = {
        board: baselineState.board,
        score: baselineState.score,
        direction,
        moveNumber: baselineState.moveNumber,
        seed: baselineState.seed,
        clientTimestamp: Date.now(),
        ...config.extraMovePayload,
        ...(baselineState.gameId ? { gameId: baselineState.gameId } : {}),
      }
      const responsePromise = fetch(config.moveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let predictedMove: Awaited<ReturnType<typeof predictRemoteMove>> | null = null
      try {
        predictedMove = await predictRemoteMove(baselineState, direction)
      } catch {
        predictedMove = null
      }

      if (moveRequestIdRef.current !== requestId) {
        return
      }

      let optimisticApplied = false

      if (predictedMove) {
        if (!predictedMove.moved) {
          setShaking(true)
          if (shakeTimeoutRef.current !== null) {
            window.clearTimeout(shakeTimeoutRef.current)
          }
          shakeTimeoutRef.current = window.setTimeout(() => setShaking(false), 400)
        } else {
          optimisticApplied = true
          applyNewBoard(
            predictedMove.board,
            Number(predictedMove.score),
            baselineState.score,
            direction,
            {
              moveNumber: predictedMove.moveNumber,
              gameOver: predictedMove.gameOver,
            },
            {
              notifyGameOver: false,
            }
          )
        }
      }

      const res = await responsePromise
      const data = await res.json()

      if (moveRequestIdRef.current !== requestId) {
        return
      }

      if (!res.ok) {
        if (optimisticApplied) {
          rollbackState(baselineState)
        }
        if (data.timeout) setState((p) => p ? { ...p, timedOut: true, gameOver: true } : p)
        return
      }
      if (!data.moved) {
        if (optimisticApplied) {
          rollbackState(baselineState)
        }
        setShaking(true)
        if (shakeTimeoutRef.current !== null) {
          window.clearTimeout(shakeTimeoutRef.current)
        }
        shakeTimeoutRef.current = window.setTimeout(() => setShaking(false), 400)
        return
      }

      const serverScore = Number(data.score)
      const serverBoard = data.board as number[][]
      const serverGameOver = data.gameOver ?? false

      if (
        optimisticApplied &&
        predictedMove &&
        predictedMove.moveNumber === data.moveNumber &&
        predictedMove.gameOver === serverGameOver &&
        predictedMove.score === serverScore &&
        boardsEqual(predictedMove.board, serverBoard)
      ) {
        setState((prev) => {
          if (!prev) return prev
          if (serverGameOver) config.onGameOver?.(serverScore)
          return {
            ...prev,
            board: serverBoard,
            score: serverScore,
            moveNumber: data.moveNumber,
            gameOver: serverGameOver,
            bestScore: Math.max(prev.bestScore, serverScore),
          }
        })
        prevBoardRef.current = serverBoard
        return
      }

      if (optimisticApplied) {
        applyNewBoard(
          serverBoard,
          serverScore,
          baselineState.score,
          direction,
          {
            moveNumber: data.moveNumber,
            gameOver: serverGameOver,
          },
          {
            animate: false,
          }
        )
        return
      }

      applyNewBoard(serverBoard, serverScore, baselineState.score, direction, {
        moveNumber: data.moveNumber,
        gameOver: serverGameOver,
      })
    } catch {
      rollbackState(baselineState)
      // fallo de red — no bloqueamos
    } finally {
      if (moveRequestIdRef.current === requestId) {
        setMoving(false)
      }
    }
  }, [state, moving, loading, isLocalMode, config, applyNewBoard, rollbackState])

  // Teclado
  useEffect(() => {
    const MAP: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    }
    const handler = (e: KeyboardEvent) => {
      const dir = MAP[e.key]
      if (!dir) return
      e.preventDefault()
      sendMove(dir)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sendMove])

  // Táctil
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) touchStart.current = { x: t.clientX, y: t.clientY }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return
    const dir: Direction = Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? 'right' : 'left'
      : dy > 0 ? 'down' : 'up'
    sendMove(dir)
  }, [sendMove])

  useEffect(() => {
    prevBoardRef.current = null
    const timeoutId = window.setTimeout(() => {
      void loadGame()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadGame])

  useEffect(() => {
    return () => {
      if (animResetTimeoutRef.current !== null) {
        window.clearTimeout(animResetTimeoutRef.current)
      }
      if (scoreFloatTimeoutRef.current !== null) {
        window.clearTimeout(scoreFloatTimeoutRef.current)
      }
      if (shakeTimeoutRef.current !== null) {
        window.clearTimeout(shakeTimeoutRef.current)
      }
    }
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={startGame} className="text-sm border rounded-lg px-4 py-2 hover:bg-muted">
          Reintentar
        </button>
      </div>
    )
  }

  if (loading && !state) return <BoardSkeleton />

  const board = state?.board ?? emptyBoardGrid()
  const bestTile = board.flat().reduce((a, b) => Math.max(a, b), 0)

  return (
    <div className="flex flex-col items-center gap-4 select-none">

      {/* Marcador */}
      <div className="flex items-center justify-between w-full max-w-[380px] gap-2">
        <ScoreBox label="Puntaje" value={state?.score ?? 0} float={scoreFloat} />
        <ScoreBox label="Mejor" value={state?.bestScore ?? 0} />
        {bestTile >= 128 && <BestTileChip value={bestTile} />}
        {timeLeft !== null && (
          <ScoreBox label="Tiempo" value={formatTime(timeLeft)} danger={timeLeft < 60} />
        )}
        {!config.playWindowEnd && (
          <button
            onClick={startGame}
            disabled={loading}
            className="text-sm border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            Nueva
          </button>
        )}
      </div>

      {/* Tablero */}
      <GameBoardSurface
        board={board}
        cellAnims={cellAnims}
        shaking={shaking}
        gameOver={state?.gameOver ?? false}
        timedOut={state?.timedOut ?? false}
        score={state?.score ?? 0}
        allowRestart={!config.playWindowEnd}
        onRestart={startGame}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />

      <p className="text-xs text-muted-foreground text-center">
        Flechas · WASD · desliza en táctil
      </p>
    </div>
  )
}

// ── Tile individual ─────────────────────────────────────────

const GameBoardSurface = memo(function GameBoardSurface({
  board,
  cellAnims,
  shaking,
  gameOver,
  timedOut,
  score,
  allowRestart,
  onRestart,
  onTouchStart,
  onTouchEnd,
}: {
  board: number[][]
  cellAnims: Map<string, CellAnim>
  shaking: boolean
  gameOver: boolean
  timedOut: boolean
  score: number
  allowRestart: boolean
  onRestart: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}) {
  return (
    <div
      className={`relative rounded-2xl p-2.5 touch-none ${shaking ? 'animate-board-shake' : ''}`}
      style={{
        background: 'linear-gradient(135deg,#c5b5a4,#bbada0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <BoardBackground />
      <TilesLayer board={board} cellAnims={cellAnims} />

      {gameOver && (
        <div
          className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 animate-gameover-in"
          style={{ background: 'rgba(187,173,160,0.88)', backdropFilter: 'blur(2px)' }}
        >
          <p className="text-3xl font-bold" style={{ color: '#776e65', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>
            {timedOut ? '⏱ ¡Tiempo!' : '🚫 Sin movimientos'}
          </p>
          <p className="text-xl font-semibold" style={{ color: '#776e65' }}>
            {score.toLocaleString('es-CL')} pts
          </p>
          {allowRestart && (
            <button
              onClick={onRestart}
              className="mt-1 px-7 py-2.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#a07860,#8f7a66)' }}
            >
              Jugar de nuevo
            </button>
          )}
        </div>
      )}
    </div>
  )
})

const BoardBackground = memo(function BoardBackground() {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="w-[78px] h-[78px] sm:w-[90px] sm:h-[90px] rounded-xl"
          style={{ background: 'rgba(205,193,180,0.35)' }}
        />
      ))}
    </div>
  )
})

const TilesLayer = memo(function TilesLayer({
  board,
  cellAnims,
}: {
  board: number[][]
  cellAnims: Map<string, CellAnim>
}) {
  return (
    <div className="absolute inset-2.5 grid grid-cols-4 gap-2.5">
      {board.map((row, r) =>
        row.map((value, c) => {
          const anim = cellAnims.get(`${r}-${c}`)
          return (
            <TileCell
              key={`${r}-${c}`}
              value={value}
              anim={anim ?? null}
            />
          )
        })
      )}
    </div>
  )
})

const TileCell = memo(function TileCell({ value, anim }: { value: number; anim: CellAnim | null }) {
  const v = getTileVisual(value)
  if (value === 0) return <div className="w-[78px] h-[78px] sm:w-[90px] sm:h-[90px] rounded-xl" />

  let animationName = ''
  let customProps: React.CSSProperties = {}

  if (anim) {
    if (anim.isSpawn) {
      animationName = 'tile-spawn 0.2s cubic-bezier(.36,1.56,.64,1) both'
    } else if (anim.isMerge) {
      customProps = {
        '--slide-x': `${anim.slideX}px`,
        '--slide-y': `${anim.slideY}px`,
      } as React.CSSProperties
      animationName = 'tile-slide-merge 0.14s cubic-bezier(.25,.46,.45,.94) both'
    } else if (anim.slideX !== 0 || anim.slideY !== 0) {
      customProps = {
        '--slide-x': `${anim.slideX}px`,
        '--slide-y': `${anim.slideY}px`,
      } as React.CSSProperties
      animationName = 'tile-slide 0.13s cubic-bezier(.25,.46,.45,.94) both'
    }
  }

  return (
    // Re-mount con key que incluye la versión → re-dispara la animación CSS
    <div
      key={anim ? `${value}-${anim.v}` : value}
      className="w-[78px] h-[78px] sm:w-[90px] sm:h-[90px] rounded-xl flex items-center justify-center font-bold"
      style={{
        background: v.background,
        color: v.color,
        fontSize: v.fontSize,
        textShadow: v.textShadow,
        boxShadow: v.boxShadow,
        lineHeight: 1,
        animation: animationName || undefined,
        willChange: animationName ? 'transform' : undefined,
        ...customProps,
      }}
    >
      {value}
    </div>
  )
})

// ── Score box ───────────────────────────────────────────────

function ScoreBox({ label, value, danger = false, float }: {
  label: string
  value: number | string
  danger?: boolean
  float?: { delta: number; key: number } | null
}) {
  return (
    <div className="relative text-center min-w-[64px]">
      {float && (
        <span
          key={float.key}
          className="absolute -top-1 left-1/2 text-sm font-bold text-green-500 pointer-events-none animate-score-float whitespace-nowrap"
          style={{ transform: 'translateX(-50%)' }}
        >
          +{float.delta.toLocaleString('es-CL')}
        </span>
      )}
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${danger ? 'text-red-600 animate-pulse' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString('es-CL') : value}
      </p>
    </div>
  )
}

// ── Chip mejor tile ─────────────────────────────────────────

function BestTileChip({ value }: { value: number }) {
  const v = getTileVisual(value)
  return (
    <div
      className="text-center px-2.5 py-1 rounded-lg min-w-[56px]"
      style={{ background: v.background, color: v.color, boxShadow: v.boxShadow }}
    >
      <p style={{ opacity: 0.85, fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 1 }}>
        Mejor tile
      </p>
      <p style={{ fontSize: '1rem', fontWeight: 700, textShadow: v.textShadow, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function emptyBoardGrid(): number[][] {
  return Array.from({ length: 4 }, () => Array(4).fill(0))
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-between w-full max-w-[380px] gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1 text-center">
            <div className="h-3 w-12 bg-muted rounded animate-pulse mx-auto" />
            <div className="h-6 w-16 bg-muted rounded animate-pulse mx-auto" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-2.5" style={{ background: 'linear-gradient(135deg,#c5b5a4,#bbada0)' }}>
        <div className="grid grid-cols-4 gap-2.5">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="w-[78px] h-[78px] sm:w-[90px] sm:h-[90px] rounded-xl animate-pulse"
              style={{ background: 'rgba(205,193,180,0.35)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

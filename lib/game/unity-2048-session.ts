import { applyLocalPracticeMove, createLocalPracticeGame, type LocalPracticeState } from './local-practice'
import type { Direction } from './engine'
import runtimeBuilds from './runtime-builds.json'

export const UNITY_2048_BUILD = runtimeBuilds['2048']
export const UNITY_2048_CHANNEL = 'torneos.2048'
export interface Unity2048State {
  cells: number[]; score: number; move_number: number; game_over: boolean
  locked: boolean; can_restart: boolean; mode: 'practice' | 'tournament'
  message: string; time_left_seconds: number
  started: boolean
}
export interface TournamentUnityConfig { startUrl: string; moveUrl: string; timeoutUrl: string }
type JsonRequest = (url: string, body?: unknown) => Promise<Record<string, unknown>>
const directions = new Set(['up', 'down', 'left', 'right'])
export function parseUnity2048Input(data: unknown): 'ready' | 'restart' | Direction | null {
  if (!data || typeof data !== 'object') return null
  const x = data as Record<string, unknown>
  if (x.channel !== UNITY_2048_CHANNEL || x.version !== 1) return null
  if (x.type === 'game.ready' && x.build_id === UNITY_2048_BUILD) return 'ready'
  if (x.type === 'game.restart') return 'restart'
  if (x.type === 'game.input' && typeof x.direction === 'string' && directions.has(x.direction)) return x.direction as Direction
  return null
}
function checkedBoard(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 4 || value.some(row => !Array.isArray(row) || row.length !== 4)) throw new Error('Tablero inválido recibido del servidor.')
  const cells = value.flat() as unknown[]
  if (!cells.every(x => Number.isSafeInteger(x) && Number(x) >= 0)) throw new Error('Tablero inválido recibido del servidor.')
  return cells as number[]
}

// The Unity client never submits a score for tournaments: only one direction.
export class Unity2048Session {
  private local?: LocalPracticeState
  private gameId?: string
  private deadline?: number
  private busy = false
  private stopped = false
  private timeoutUncertain = false
  private nextTimeoutCheck = 0
  private state: Unity2048State
  constructor(private publish: (state: Unity2048State) => void,
    private request: JsonRequest, private config?: TournamentUnityConfig) {
    this.state = { cells: Array(16).fill(0), score: 0, move_number: 2, game_over: false,
      locked: true, can_restart: !config, mode: config ? 'tournament' : 'practice',
      message: config ? 'Pulsa Iniciar partida cuando estés listo.' : 'Práctica gratuita · sin premios', time_left_seconds: -1, started: false }
  }
  snapshot() { return { ...this.state, cells: [...this.state.cells] } }
  private emit() { this.publish(this.snapshot()) }
  async start(seed?: string) {
    if (this.busy || this.stopped || (this.config && this.gameId)) return
    if (!this.config) {
      this.local = createLocalPracticeGame(seed)
      this.state = { ...this.state, cells: this.local.board.flat(), score: 0, move_number: 2,
        locked: false, game_over: false, started: true, message: 'Une fichas iguales · flechas, WASD o desliza' }
      this.emit(); return
    }
    this.busy = true; this.state.locked = true; this.state.message = 'Conectando partida…'; this.emit()
    try {
      const data = await this.request(this.config.startUrl)
      if (this.stopped) return
      if (typeof data.gameId !== 'string' || typeof data.deadlineAt !== 'string') throw new Error('Respuesta de partida incompleta.')
      const deadline = Date.parse(data.deadlineAt)
      if (!Number.isFinite(deadline)) throw new Error('Duración de partida inválida.')
      this.acceptServerState(data)
      this.gameId = data.gameId; this.deadline = deadline; this.state.started = true
      this.state.message = data.resuming ? 'Partida recuperada' : 'Partida competitiva · una oportunidad'
    } catch (error) { this.state.message = error instanceof Error ? error.message : 'No se pudo iniciar la partida.'; this.state.locked = true }
    finally { this.busy = false; if (!this.stopped) this.emit() }
  }
  private acceptServerState(data: Record<string, unknown>) {
    const cells = checkedBoard(data.board)
    if (!Number.isSafeInteger(data.score) || Number(data.score) < 0 || !Number.isSafeInteger(data.moveNumber)) throw new Error('Estado de partida inválido.')
    this.state.cells = cells; this.state.score = Number(data.score); this.state.move_number = Number(data.moveNumber)
    this.state.game_over = data.gameOver === true; this.state.locked = this.state.game_over
  }
  async move(direction: Direction) {
    if (this.stopped || this.busy || this.state.locked || !directions.has(direction)) return
    if (!this.config && this.local) {
      const next = applyLocalPracticeMove(this.local, direction)
      this.local = { ...this.local, ...next }
      this.state = { ...this.state, cells: next.board.flat(), score: next.score,
        move_number: next.moveNumber, game_over: next.gameOver, locked: next.gameOver,
        message: next.gameOver ? 'Sin movimientos · prueba una nueva partida' : 'Une fichas iguales · flechas, WASD o desliza' }
      this.emit(); return
    }
    if (!this.config || !this.gameId) return
    if (this.deadline && Date.now() >= this.deadline) { await this.tick(); return }
    this.busy = true; this.state.locked = true; this.emit()
    try {
      const data = await this.request(this.config.moveUrl, { gameId: this.gameId,
        direction, moveNumber: this.state.move_number, clientTimestamp: Date.now() })
      if (this.stopped) return
      // A legal no-op does not include moveNumber in the existing API.
      if (data.moved === false) this.state.locked = false
      else this.acceptServerState(data)
      this.state.message = this.state.game_over ? 'Partida registrada · consulta el ranking' : 'Partida competitiva · puntuación del servidor'
    } catch {
      // An unknown response could have recorded the move. Never repeat it blindly.
      this.state.locked = true; this.state.message = 'No se confirmó el movimiento. Recarga para recuperar el estado del servidor.'
    } finally { this.busy = false; if (!this.stopped) this.emit() }
  }
  async tick() {
    if (this.stopped || !this.deadline || !this.config || !this.gameId || this.state.game_over || this.timeoutUncertain) return
    this.state.time_left_seconds = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000))
    if (this.state.time_left_seconds > 0 || this.busy || Date.now() < this.nextTimeoutCheck) { this.emit(); return }
    this.busy = true; this.state.locked = true; this.emit()
    try {
      const data = await this.request(this.config.timeoutUrl, { gameId: this.gameId })
      if (this.stopped) return
      if (data.timedOut === true) {
        if (Number.isSafeInteger(data.score) && Number(data.score) >= 0) this.state.score = Number(data.score)
        this.state.game_over = true; this.state.message = 'Tiempo terminado · consulta el ranking'
      } else if (data.timedOut === false && typeof data.deadlineAt === 'string' && Number.isFinite(Date.parse(data.deadlineAt))) {
        this.deadline = Date.parse(data.deadlineAt); this.nextTimeoutCheck = Date.now() + 5000
        this.state.message = 'Esperando confirmación del tiempo del servidor…'
      } else throw new Error('Cierre no confirmado')
    } catch { this.timeoutUncertain = true; this.state.message = 'El tiempo terminó. No se confirmó el cierre; recarga para recuperar la partida.' }
    finally { this.busy = false; if (!this.stopped) this.emit() }
  }
  destroy() { this.stopped = true }
}

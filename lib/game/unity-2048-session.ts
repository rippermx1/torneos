import { applyLocalPracticeMove, createLocalPracticeGame, type LocalPracticeState } from './local-practice'
import type { Direction } from './engine'
import runtimeBuilds from './runtime-builds.json'
import { ServerGameClock } from './server-game-clock'
import { gameResultLabel, parseGameSnapshot, type GameSnapshot } from './game-snapshot'

export const UNITY_2048_BUILD = runtimeBuilds['2048']
export const UNITY_2048_CHANNEL = 'torneos.2048'
export interface Unity2048State {
  cells: number[]; score: number; move_number: number; game_over: boolean
  locked: boolean; can_restart: boolean; mode: 'practice' | 'tournament'
  message: string; time_left_seconds: number
  started: boolean
  can_recover?: boolean
  result_status?: 'completed' | 'abandoned'
  end_reason?: string | null
}
export interface TournamentUnityConfig { startUrl: string; moveUrl: string; timeoutUrl: string; existingGameId?: string; leaderboardUrl?: string; resultsUrl?: string }
type JsonRequest = (url: string, body?: unknown) => Promise<Record<string, unknown>>
const directions = new Set(['up', 'down', 'left', 'right'])
export function parseUnity2048Input(data: unknown): 'ready' | Direction | null {
  if (!data || typeof data !== 'object') return null
  const x = data as Record<string, unknown>
  if (x.channel !== UNITY_2048_CHANNEL || x.version !== 1) return null
  if (x.type === 'game.ready' && x.build_id === UNITY_2048_BUILD) return 'ready'
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
  private clock: ServerGameClock
  private busy = false
  private stopped = false
  private timeoutUncertain = false
  private moveUncertain = false
  private closurePending = false
  private resyncPending = false
  private timeSyncInFlight = false
  private nextTimeoutCheck = 0
  private state: Unity2048State
  constructor(private publish: (state: Unity2048State) => void,
    private request: JsonRequest, private config?: TournamentUnityConfig,
    private monotonicNow: () => number = () => performance.now()) {
    this.clock = new ServerGameClock(monotonicNow)
    this.state = { cells: Array(16).fill(0), score: 0, move_number: 2, game_over: false,
      locked: true, can_restart: !config, mode: config ? 'tournament' : 'practice',
      message: 'Pulsa Iniciar partida cuando estés listo.', time_left_seconds: -1, started: false }
  }
  snapshot() { return { ...this.state, cells: [...this.state.cells],
    can_recover: !!this.config && !this.busy && !this.stopped && !this.state.game_over &&
      (this.moveUncertain || this.timeoutUncertain || (!!this.config.existingGameId && !this.state.started)) } }
  private emit() { this.publish(this.snapshot()) }
  private updateClock() {
    this.state.time_left_seconds = this.clock.remainingSeconds()
    this.closurePending = this.state.time_left_seconds === 0
  }
  private async finishRequest() {
    this.busy = false
    this.state.locked = !this.state.started || this.state.game_over || this.moveUncertain || this.timeoutUncertain || this.closurePending
    if (this.stopped) return
    this.emit()
    if (this.resyncPending) {
      this.resyncPending = false
      await this.resynchronizeTime()
    }
  }
  async start(seed?: string) {
    if (this.busy || this.stopped || (this.config && this.gameId)) return
    if (!this.config) {
      this.local = createLocalPracticeGame(seed)
      this.state = { ...this.state, cells: this.local.board.flat(), score: 0, move_number: 2,
        locked: false, game_over: false, started: true, end_reason: null, result_status: undefined,
        message: 'Une fichas iguales · flechas, WASD o desliza' }
      this.emit(); return
    }
    this.busy = true; this.state.locked = true; this.state.message = 'Conectando partida…'; this.emit()
    try {
      const data = await this.request(this.config.startUrl, this.config.existingGameId
        ? { recoverOnly: true, gameId: this.config.existingGameId } : undefined)
      if (this.stopped) return
      const snapshot = parseGameSnapshot(data)
      if (snapshot) {
        this.acceptSnapshot(snapshot, true)
        if (!snapshot.gameOver && !data.resuming) this.state.message = 'Partida competitiva · una oportunidad'
        return
      }
      if (typeof data.gameId !== 'string' || typeof data.deadlineAt !== 'string') throw new Error('Respuesta de partida incompleta.')
      this.clock.synchronize(data)
      this.acceptServerState(data)
      this.gameId = data.gameId; this.state.started = true; this.updateClock()
      this.state.message = data.resuming ? 'Partida recuperada' : 'Partida competitiva · una oportunidad'
    } catch (error) { this.state.message = error instanceof Error ? error.message : 'No se pudo iniciar la partida.'; this.state.locked = true }
    finally { await this.finishRequest() }
  }
  private acceptSnapshot(snapshot: GameSnapshot, recovering = false) {
    const expectedId = this.gameId ?? this.config?.existingGameId
    if (expectedId && snapshot.gameId !== expectedId || snapshot.moveNumber < this.state.move_number) throw new Error('Estado de otra partida o anterior al confirmado.')
    if (!snapshot.gameOver) this.clock.synchronize(snapshot as unknown as Record<string, unknown>)
    this.state.cells = snapshot.board.flat(); this.state.score = snapshot.score; this.state.move_number = snapshot.moveNumber
    this.gameId = snapshot.gameId; this.state.started = true; this.state.game_over = snapshot.gameOver
    this.state.result_status = snapshot.status === 'active' ? undefined : snapshot.status
    this.state.end_reason = snapshot.endReason
    if (snapshot.gameOver) this.state.time_left_seconds = 0
    else this.updateClock()
    if (recovering) { this.moveUncertain = false; this.timeoutUncertain = false }
    this.state.message = snapshot.gameOver
      ? `${gameResultLabel(snapshot.status, snapshot.endReason)} · puntaje final: ${snapshot.score.toLocaleString('es-CL')}`
      : 'Partida recuperada · estado confirmado por el servidor'
  }
  async recover() {
    if (this.stopped || this.busy || !this.config || this.state.game_over) return
    if (!this.gameId) { if (this.config.existingGameId) await this.start(); return }
    this.busy = true; this.state.locked = true; this.emit()
    try {
      const data = await this.request(this.config.startUrl, { recoverOnly: true, gameId: this.gameId })
      if (this.stopped) return
      const snapshot = parseGameSnapshot(data)
      if (!snapshot) throw new Error('Recuperación incompleta. Recarga para recuperar el estado del servidor.')
      this.acceptSnapshot(snapshot, true)
    } catch (error) {
      this.moveUncertain = true; this.state.message = error instanceof Error ? error.message : 'No se pudo recuperar la partida.'
    } finally { await this.finishRequest() }
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
        end_reason: next.gameOver ? 'no_moves' : null,
        message: next.gameOver ? `Práctica terminada · sin movimientos · puntaje final: ${next.score.toLocaleString('es-CL')}` : 'Une fichas iguales · flechas, WASD o desliza' }
      this.emit(); return
    }
    if (!this.config || !this.gameId) return
    this.updateClock()
    if (this.closurePending) { await this.tick(); return }
    this.busy = true; this.state.locked = true; this.emit()
    try {
      const data = await this.request(this.config.moveUrl, { gameId: this.gameId,
        direction, moveNumber: this.state.move_number, clientTimestamp: Date.now() })
      if (this.stopped) return
      const snapshot = parseGameSnapshot(data)
      if (snapshot?.gameOver) { this.acceptSnapshot(snapshot); return }
      // A legal no-op does not include moveNumber in the existing API.
      if (data.moved === false) this.state.locked = false
      else this.acceptServerState(data)
      if (data.serverNow !== undefined) this.clock.synchronize(data)
      this.updateClock()
      this.state.message = this.state.game_over ? 'Partida registrada · consulta el ranking' : 'Partida competitiva · puntuación del servidor'
    } catch {
      // An unknown response could have recorded the move. Never repeat it blindly.
      this.moveUncertain = true; this.state.locked = true; this.state.message = 'No se confirmó el movimiento. Recarga para recuperar el estado del servidor.'
    } finally { await this.finishRequest() }
  }
  async tick() {
    if (this.stopped || !this.config || !this.gameId || this.state.game_over || this.timeoutUncertain) return
    this.updateClock()
    if (!this.closurePending || this.busy || this.monotonicNow() < this.nextTimeoutCheck) { this.emit(); return }
    await this.resynchronizeTime()
  }
  async resynchronizeTime() {
    if (this.stopped || !this.config || this.state.game_over || this.timeoutUncertain) return
    // Coalesce returns from background; never overlap or replay an in-flight move.
    if (this.busy) { if (!this.timeSyncInFlight) this.resyncPending = true; return }
    if (!this.gameId) return
    this.busy = true; this.timeSyncInFlight = true; this.state.locked = true; this.emit()
    try {
      const data = await this.request(this.config.timeoutUrl, { gameId: this.gameId })
      if (this.stopped) return
      const snapshot = parseGameSnapshot(data)
      if (snapshot) {
        if (snapshot.gameId !== this.gameId || snapshot.moveNumber < this.state.move_number) throw new Error('Estado de otra partida o anterior al confirmado.')
        if (snapshot.gameOver || !this.moveUncertain) this.acceptSnapshot(snapshot)
        else { this.clock.synchronize(data); this.updateClock() }
        this.nextTimeoutCheck = this.monotonicNow() + 5000
        return
      }
      if (data.timedOut === true) {
        if (Number.isSafeInteger(data.score) && Number(data.score) >= 0) this.state.score = Number(data.score)
        this.state.game_over = true; this.state.time_left_seconds = 0; this.state.message = 'Tiempo terminado · consulta el ranking'
      } else if (data.timedOut === false && typeof data.deadlineAt === 'string') {
        this.clock.synchronize(data); this.updateClock(); this.nextTimeoutCheck = this.monotonicNow() + 5000
        if (!this.moveUncertain) this.state.message = this.closurePending
          ? 'Esperando confirmación del tiempo del servidor…' : 'Partida competitiva · tiempo sincronizado'
      } else throw new Error('Cierre no confirmado')
    } catch { this.timeoutUncertain = true; this.state.message = 'No se confirmó la vigencia o el cierre; recarga para recuperar la partida.' }
    finally { this.timeSyncInFlight = false; await this.finishRequest() }
  }
  destroy() { this.stopped = true }
}

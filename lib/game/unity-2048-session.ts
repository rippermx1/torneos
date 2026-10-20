import { applyLocalPracticeMove, createLocalPracticeGame, type LocalPracticeState } from './local-practice'
import type { Direction } from './engine'
import runtimeBuilds from './runtime-builds.json'
import { ServerGameClock } from './server-game-clock'
import { gameResultLabel, parseGameSnapshot, type GameSnapshot } from './game-snapshot'
import type { TournamentPresetKey } from '@/types/database'
import { parseSaved2048Practice, type Saved2048Practice } from './2048-practice-checkpoint'
import { copyLocal2048Practice, copyTraining2048State, create2048PracticeId, usefulTraining2048Directions,
  type Training2048Event, type Training2048State } from './2048-training'

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
  training?: Training2048State
}
export interface TournamentUnityConfig { startUrl: string; moveUrl: string; timeoutUrl: string; existingGameId?: string; leaderboardUrl?: string; resultsUrl?: string; presetKey?: TournamentPresetKey }

export interface Practice2048Event {
  type: 'start' | 'move' | 'end' | 'interrupted' | 'training'
  score: number
  highestTile: number
  moves: number
  practiceId?: string
  assisted?: boolean
  training?: Training2048Event
}
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
  private practiceId: string | null = null
  private freeMode: 'practice' | 'daily' = 'practice'
  private checkpoint?: { before: LocalPracticeState; direction: Direction }
  private trainingMoves = 0
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
    private monotonicNow: () => number = () => performance.now(),
    private observePractice?: (event: Practice2048Event) => void) {
    this.clock = new ServerGameClock(monotonicNow)
    this.state = { cells: Array(16).fill(0), score: 0, move_number: 2, game_over: false,
      locked: true, can_restart: !config, mode: config ? 'tournament' : 'practice',
      message: 'Pulsa Iniciar partida cuando estés listo.', time_left_seconds: -1, started: false }
  }
  snapshot() { return { ...this.state, cells: [...this.state.cells],
    ...(this.state.training ? { training: copyTraining2048State(this.state.training) } : {}),
    can_recover: !!this.config && !this.busy && !this.stopped && !this.state.game_over &&
      (this.moveUncertain || this.timeoutUncertain || (!!this.config.existingGameId && !this.state.started)) } }
  private emit() { this.publish(this.snapshot()) }
  practiceCheckpoint() {
    if (this.config || this.freeMode !== 'practice' || !this.local || !this.practiceId || !this.state.started
      || this.state.game_over || this.state.training || this.stopped) return null
    return { practiceId: this.practiceId, state: copyLocal2048Practice(this.local) }
  }
  canRestorePractice(saved: Saved2048Practice) {
    return !this.config && !this.stopped && !this.busy && !this.state.started && this.freeMode === 'practice'
      && !!parseSaved2048Practice(saved, saved.category)
  }
  restorePractice(saved: Saved2048Practice): boolean {
    if (!this.canRestorePractice(saved)) return false
    this.practiceId = saved.practiceId; this.freeMode = 'practice'
    this.local = copyLocal2048Practice(saved.state)
    this.checkpoint = undefined; this.trainingMoves = 0
    this.state = { ...this.state, cells: this.local.board.flat(), score: this.local.score,
      move_number: this.local.moveNumber, started: true, game_over: false, locked: false,
      can_restart: true, training: undefined, end_reason: null, result_status: undefined,
      message: 'Práctica recuperada · sigue jugando' }
    // Attaching a saved board is neither a start nor a move. Observers are restored separately.
    this.emit(); return true
  }
  private practiceEvent(type: Practice2048Event['type']) {
    if (this.config || !this.observePractice || this.state.training?.phase === 'active' || this.state.training?.phase === 'ended') return
    // Optional local storage/observation must never block gameplay. No board or seed leaves here.
    try { this.observePractice({ type, practiceId: this.practiceId ?? undefined, score: this.state.score,
      highestTile: Math.max(...this.state.cells), moves: this.state.move_number - 2 }) } catch { /* best effort */ }
  }
  private trainingEvent(stage: Training2048Event['stage']) {
    const training = this.state.training
    if (this.config || !training || !this.observePractice) return
    try { this.observePractice({ type: 'training', assisted: true, practiceId: training.sourceId,
      score: this.state.score, highestTile: Math.max(...this.state.cells), moves: this.state.move_number - 2,
      training: { stage, sourceId: training.sourceId, continuationId: training.continuationId, validMoves: this.trainingMoves } }) } catch { /* best effort */ }
  }
  private offerTraining() {
    if (this.config || this.freeMode !== 'practice' || !this.practiceId || !this.checkpoint || !this.state.game_over) return
    const alternativeDirections = usefulTraining2048Directions(this.checkpoint.before, this.checkpoint.direction)
    if (!alternativeDirections.length) { this.checkpoint = undefined; return }
    this.trainingMoves = 0
    this.state.training = { phase: 'offered', sourceId: this.practiceId, continuationId: null,
      originalScore: this.state.score, originalHighestTile: Math.max(...this.state.cells), originalMoves: this.state.move_number - 2,
      originalDirection: this.checkpoint.direction, alternativeDirections, awaitingAlternative: false, demonstration: true }
    this.trainingEvent('offered')
  }
  private interruptTraining() {
    if (this.state.training?.phase !== 'active') return
    this.state.training = { ...this.state.training, phase: 'ended', awaitingAlternative: false }
    this.trainingEvent('interrupted')
  }
  beginTrainingDemo(sourceId: string): boolean {
    const training = this.state.training
    if (this.stopped || this.busy || this.config || this.freeMode !== 'practice' || !this.local || !this.checkpoint
      || !this.state.game_over || !training || training.phase !== 'offered'
      || training.sourceId !== sourceId || this.practiceId !== sourceId) return false
    this.local = copyLocal2048Practice(this.checkpoint.before)
    this.checkpoint = undefined // One consumed opportunity; no later assisted checkpoint is retained.
    this.trainingMoves = 0
    this.state = { ...this.state, cells: this.local.board.flat(), score: this.local.score, move_number: this.local.moveNumber,
      game_over: false, locked: false, end_reason: null, result_status: undefined,
      training: { ...training, phase: 'active', continuationId: create2048PracticeId(), awaitingAlternative: true },
      message: 'Demostración asistida · elige otra dirección' }
    this.trainingEvent('started'); this.emit(); return true
  }
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
  async start(seed?: string, options?: { freeMode?: 'practice' | 'daily' }) {
    if (this.busy || this.stopped || (this.config && this.gameId)) return
    if (!this.config) {
      if (this.state.training?.phase === 'active') this.interruptTraining()
      else if (this.local && !this.state.game_over) this.practiceEvent('interrupted')
      this.freeMode = options?.freeMode ?? 'practice'
      this.practiceId = create2048PracticeId()
      this.checkpoint = undefined; this.trainingMoves = 0
      this.local = createLocalPracticeGame(seed)
      this.state = { ...this.state, cells: this.local.board.flat(), score: 0, move_number: 2,
        locked: false, game_over: false, started: true, end_reason: null, result_status: undefined,
        training: undefined, message: 'Une fichas iguales · flechas, WASD o desliza' }
      this.practiceEvent('start'); this.emit(); return
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
      const training = this.state.training?.phase === 'active' ? this.state.training : undefined
      if (training?.awaitingAlternative && !training.alternativeDirections.includes(direction)) return
      const before = !training && this.freeMode === 'practice' ? copyLocal2048Practice(this.local) : undefined
      const next = applyLocalPracticeMove(this.local, direction)
      if (next.moved && before) this.checkpoint = { before, direction }
      this.local = { ...this.local, ...next }
      this.state = { ...this.state, cells: next.board.flat(), score: next.score,
        move_number: next.moveNumber, game_over: next.gameOver, locked: next.gameOver,
        end_reason: next.gameOver ? 'no_moves' : null,
        message: training ? next.gameOver ? 'Demostración asistida terminada · resultado original conservado'
          : 'Demostración asistida · resultado original conservado'
          : next.gameOver ? `Práctica terminada · sin movimientos · puntaje final: ${next.score.toLocaleString('es-CL')}` : 'Une fichas iguales · flechas, WASD o desliza' }
      if (training) {
        if (next.moved) {
          this.trainingMoves++
          this.state.training = { ...training, awaitingAlternative: false }
          this.trainingEvent('move')
        }
        if (next.gameOver) {
          this.state.training = { ...this.state.training!, phase: 'ended', awaitingAlternative: false }
          this.trainingEvent('ended')
        }
      } else {
        if (next.moved) this.practiceEvent('move')
        if (next.gameOver) this.practiceEvent('end')
        if (next.moved && next.gameOver) this.offerTraining()
      }
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
  destroy() {
    this.interruptTraining()
    if (this.state.training?.phase === 'offered') this.state.training = undefined
    this.checkpoint = undefined
    this.stopped = true
  }
}

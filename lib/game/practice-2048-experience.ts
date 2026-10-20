import { Personal2048Progress, PERSONAL_2048_RULES_VERSION, PERSONAL_2048_PROGRESS_KEY } from './personal-2048-progress'
import { Sessions2048 } from './sessions-2048'
import { UNITY_2048_BUILD, type Practice2048Event } from './unity-2048-session'
import { parseSaved2048Practice, type Saved2048Practice } from './2048-practice-checkpoint'

export type Practice2048Snapshot = ReturnType<Personal2048Progress['snapshot']> & {
  bestBefore: number
  currentPracticeId: string | null
}

// The host owns this small adapter; it never submits a practice score to a tournament.
export class Practice2048Experience {
  private progress: Personal2048Progress
  private observations: Sessions2048
  private current: { id: string; startedAt: number } | null = null
  private bestBefore = 0
  private now: () => number
  private uuid: () => string
  private category: 'observed_browser' | 'synthetic'
  constructor(options: {
    getStorage: () => Storage | null
    category?: 'observed_browser' | 'synthetic'
    now?: () => number
    uuid?: () => string
    changed?: (snapshot: Practice2048Snapshot) => void
  }) {
    this.now = options.now ?? Date.now
    this.uuid = options.uuid ?? (() => crypto.randomUUID())
    this.changed = options.changed
    this.category = options.category ?? 'observed_browser'
    this.progress = new Personal2048Progress(options.getStorage, PERSONAL_2048_RULES_VERSION,
      options.category === 'synthetic' ? `${PERSONAL_2048_PROGRESS_KEY}.synthetic` : PERSONAL_2048_PROGRESS_KEY)
    this.observations = new Sessions2048({ ...options, build: UNITY_2048_BUILD,
      rulesVersion: PERSONAL_2048_RULES_VERSION, category: options.category ?? 'observed_browser', mode: 'practice' })
  }
  private changed?: (snapshot: Practice2048Snapshot) => void
  snapshot(): Practice2048Snapshot {
    return { ...this.progress.snapshot(), bestBefore: this.bestBefore, currentPracticeId: this.current?.id ?? null }
  }
  ready() { this.observations.ready() }
  visibility(visible: boolean) { this.observations.visibility(visible) }
  checkpoint() { this.observations.checkpoint() }
  exportJson() { return this.observations.exportJson() }
  checkpointMetadata() { return this.current ? { practiceId: this.current.id, startedAt: this.current.startedAt, bestBefore: this.bestBefore } : null }
  canResume(saved: Saved2048Practice) {
    if (this.current || !parseSaved2048Practice(saved, this.category, this.now())) return false
    const entry = this.progress.latest().history.find(item => item.practiceId === saved.practiceId)
    if (entry && (entry.status !== 'active' || entry.assisted || entry.startedAt !== saved.startedAt
      || entry.moves !== saved.state.moveNumber - 2 || entry.score !== saved.state.score
      || entry.highestTile !== Math.max(...saved.state.board.flat()) || entry.updatedAt > saved.savedAt)) return false
    return this.observations.canResume(saved.practiceId, saved.startedAt, saved.state.moveNumber - 2, saved.savedAt)
  }
  resume(saved: Saved2048Practice) {
    if (!this.canResume(saved)) return false
    this.current = { id: saved.practiceId, startedAt: saved.startedAt }; this.bestBefore = saved.bestBefore
    this.observations.resume(saved.practiceId, saved.startedAt, saved.state.moveNumber - 2, saved.savedAt)
    this.changed?.(this.snapshot()); return true
  }
  observe = (event: Practice2048Event) => {
    if (event.type === 'training' || event.assisted) return
    if (event.type === 'start') {
      const previousId = this.current?.id ?? null
      this.current = { id: event.practiceId ?? this.uuid(), startedAt: this.now() }
      if (previousId) this.observations.restart(previousId, this.current.id)
      else this.observations.start(this.current.id)
    }
    if (!this.current) return
    if (event.practiceId && event.practiceId !== this.current.id) return
    this.progress.upsert({ practiceId: this.current.id, startedAt: this.current.startedAt,
      updatedAt: this.now(), rulesVersion: PERSONAL_2048_RULES_VERSION,
      score: event.score, highestTile: event.highestTile, moves: event.moves, assisted: false,
      status: event.type === 'end' ? 'completed' : event.type === 'interrupted' ? 'interrupted' : 'active' })
    // upsert re-reads browser storage, including marks made by another tab.
    if (event.type === 'start') this.bestBefore = this.progress.snapshot().bestScore
    if (event.type === 'move') this.observations.validMove(this.current.id, event.moves)
    if (event.type === 'end') this.observations.end(this.current.id, 'no_moves')
    if (event.type === 'interrupted') this.observations.interrupt(this.current.id, 'restart')
    this.changed?.(this.snapshot())
  }
}

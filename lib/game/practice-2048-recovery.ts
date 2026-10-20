import { Practice2048CheckpointStore, type Practice2048CheckpointCategory,
  type Practice2048CheckpointStatus, type Practice2048CheckpointStorage, type Saved2048Practice } from './2048-practice-checkpoint'
import { PERSONAL_2048_RULES_VERSION } from './personal-2048-progress'
import type { Unity2048Session } from './unity-2048-session'
import type { Free2048Experience } from './free-2048-experience'

export type Practice2048RecoveryStatus = Practice2048CheckpointStatus | 'unsupported' | 'busy' | 'stale'
export type Practice2048RecoverySnapshot = {
  status: Practice2048RecoveryStatus
  checkpoint: Saved2048Practice | null
  pending: boolean
}
export type AcquirePractice2048Lock = () => Promise<(() => void) | null>

function browserLocksAvailable() {
  try { return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function' }
  catch { return false }
}

/** Hold only a browser-local practice lease; this is not a financial/integrity control. */
function acquireBrowserLock(category: Practice2048CheckpointCategory): Promise<(() => void) | null> {
  return new Promise((resolve, reject) => {
    let answered = false
    void navigator.locks.request(`torneos.2048.practice-recovery.v1.${category}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { answered = true; resolve(null); return }
      let release!: () => void
      const held = new Promise<void>(finish => { release = finish })
      let released = false
      answered = true
      resolve(() => { if (!released) { released = true; release() } })
      await held
    }).catch(error => { if (!answered) reject(error) })
  })
}

function fingerprint(value: Saved2048Practice) {
  return JSON.stringify({ version: value.version, rulesVersion: value.rulesVersion, category: value.category,
    practiceId: value.practiceId, startedAt: value.startedAt, bestBefore: value.bestBefore, state: value.state })
}

/** Private practice recovery. Captures never enter analytics, daily or official results. */
export class Practice2048Recovery {
  private readonly store: Practice2048CheckpointStore
  private readonly now: () => number
  private release: (() => void) | null = null
  private ownedPracticeId: string | null = null
  private status: Practice2048RecoveryStatus = 'ready'
  private pending = false
  private destroyed = false
  private generation = 0
  private writable = false
  private lastFingerprint: string | null = null

  constructor(private options: {
    session: Unity2048Session
    experience: Free2048Experience
    getStorage: () => Practice2048CheckpointStorage | null
    category: Practice2048CheckpointCategory
    now?: () => number
    acquireLock?: AcquirePractice2048Lock
    changed?: (snapshot: Practice2048RecoverySnapshot) => void
  }) {
    this.now = options.now ?? Date.now
    this.store = new Practice2048CheckpointStore(options)
  }

  snapshot(): Practice2048RecoverySnapshot {
    return { status: this.status, checkpoint: this.store.snapshot().checkpoint, pending: this.pending }
  }
  private emit() {
    if (!this.destroyed) {
      try { this.options.changed?.(this.snapshot()) } catch { /* Optional UI cannot stop a practice. */ }
    }
  }
  private read() {
    const read = this.store.read()
    this.status = read.status
    this.lastFingerprint = read.checkpoint ? fingerprint(read.checkpoint) : null
    return read
  }
  ready() {
    if (this.destroyed || this.pending || this.release) return
    const read = this.read()
    if (read.status === 'ready' && !this.options.acquireLock && !browserLocksAvailable()) this.status = 'unsupported'
    this.emit()
  }
  private unlock() {
    const release = this.release
    this.release = null; this.ownedPracticeId = null; this.writable = false
    try { release?.() } catch { /* Disposal must not interrupt ordinary gameplay. */ }
  }
  private async lock(generation: number) {
    if (this.release) return true
    if (!this.options.acquireLock && !browserLocksAvailable()) { this.status = 'unsupported'; return false }
    let release: (() => void) | null
    try { release = await (this.options.acquireLock?.() ?? acquireBrowserLock(this.options.category)) }
    catch { if (!this.destroyed && generation === this.generation) this.status = 'unavailable'; return false }
    if (this.destroyed || generation !== this.generation) { try { release?.() } catch { /* Obsolete acquisition. */ } return false }
    if (!release) { this.status = 'busy'; return false }
    this.release = release
    return true
  }
  private begin() {
    if (this.destroyed || this.pending) return null
    this.pending = true
    const generation = ++this.generation
    this.emit()
    return generation
  }
  private finish(generation: number) {
    if (this.destroyed || generation !== this.generation) return
    this.pending = false; this.emit()
  }

  async start(mode: 'practice' | 'daily', seed?: string): Promise<boolean> {
    if (mode !== 'practice' && mode !== 'daily') return false
    const generation = this.begin()
    if (generation === null) return false
    try {
      if (mode === 'daily') {
        this.clearOwned()
        this.unlock()
      } else if (await this.lock(generation)) {
        if (this.destroyed || generation !== this.generation) return false
        const read = this.read()
        // Explicitly starting a new practice supersedes a valid saved one under our lease.
        this.writable = read.status === 'ready' && this.store.clear()
        if (!this.writable) { this.status = this.store.snapshot().status; this.unlock() }
        else { this.lastFingerprint = null; this.ownedPracticeId = null }
      }
      if (this.destroyed || generation !== this.generation) return false
      await this.options.session.start(seed, { freeMode: mode })
      if (this.destroyed || generation !== this.generation) return false
      this.capture()
      return true
    } catch {
      if (!this.destroyed && generation === this.generation) { this.status = 'unavailable'; this.unlock() }
      return false
    } finally { this.finish(generation) }
  }

  async resume(): Promise<boolean> {
    if (this.destroyed || this.pending) return false
    const active = this.options.session.snapshot()
    if (active.started && !active.game_over) { this.status = 'busy'; this.emit(); return false }
    const generation = this.begin()
    if (generation === null) return false
    try {
      if (!await this.lock(generation) || this.destroyed || generation !== this.generation) return false
      const read = this.read()
      const saved = read.checkpoint
      if (read.status !== 'ready' || !saved || !this.options.experience.canResumePractice(saved)
        || !this.options.session.canRestorePractice(saved)) {
        if (read.status === 'ready') this.status = 'stale'
        this.unlock(); return false
      }
      this.writable = true; this.ownedPracticeId = saved.practiceId
      // Both commits are synchronous. Install observation identity before Session publishes.
      if (!this.options.experience.resumePractice(saved) || !this.options.session.restorePractice(saved)) {
        this.status = 'stale'; this.unlock(); return false
      }
      this.capture()
      return true
    } catch {
      if (!this.destroyed && generation === this.generation) { this.status = 'unavailable'; this.unlock() }
      return false
    } finally { this.finish(generation) }
  }

  private clearOwned() {
    if (!this.release || !this.writable) return
    const current = this.store.snapshot()
    if (current.checkpoint && current.checkpoint.practiceId !== this.ownedPracticeId) { this.status = 'stale'; this.writable = false; return }
    if (!this.store.clear()) { this.status = this.store.snapshot().status; this.writable = false; return }
    this.lastFingerprint = null; this.status = 'ready'
  }

  capture() {
    if (this.destroyed || !this.release) return
    try {
      const checkpoint = this.options.session.practiceCheckpoint()
      if (!checkpoint) { this.clearOwned(); this.unlock(); this.emit(); return }
      if (!this.writable) return
      const metadata = this.options.experience.practiceCheckpointMetadata()
      if (!metadata || metadata.practiceId !== checkpoint.practiceId
        || this.ownedPracticeId !== null && this.ownedPracticeId !== checkpoint.practiceId) {
        this.status = 'stale'; this.writable = false; this.emit(); return
      }
      const saved: Saved2048Practice = { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION,
        category: this.options.category, ...metadata, savedAt: this.now(), state: checkpoint.state }
      const next = fingerprint(saved)
      if (next === this.lastFingerprint) return
      if (!this.store.write(saved)) { this.status = this.store.snapshot().status; this.writable = false }
      else { this.ownedPracticeId = checkpoint.practiceId; this.lastFingerprint = next; this.status = 'ready' }
      this.emit()
    } catch { this.status = 'unavailable'; this.writable = false; this.emit() }
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true; this.generation++; this.pending = false
    // The last confirmed checkpoint survives navigation/unmount.
    this.unlock()
  }
}

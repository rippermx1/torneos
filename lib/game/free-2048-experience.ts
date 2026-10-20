import { Practice2048Experience } from './practice-2048-experience'
import { Daily2048Progress, readDaily2048Challenge, type Daily2048Challenge } from './daily-2048'
import { Retention2048, reportPlayer2048Activity } from './retention-2048'
import { Sessions2048 } from './sessions-2048'
import { UNITY_2048_BUILD, type Practice2048Event } from './unity-2048-session'
import { Training2048Observations } from './2048-training-observations'
import { RewardedObservations } from '../ads/rewarded-observations'
import type { RewardedEvent } from '../ads/rewarded'
import { TicketOfferObservations } from '../games/2048/ticket-offer-observations'
import type { Saved2048Practice } from './2048-practice-checkpoint'
import type { Load2048Diagnostics } from './2048-load-diagnostics'

type FreeMode = 'practice' | 'daily'
type AccountStatus = 'idle' | 'recording' | 'recorded' | 'anonymous' | 'unavailable' | 'skipped'
export type Free2048Snapshot = {
  mode: FreeMode
  personal: ReturnType<Practice2048Experience['snapshot']>
  challenge: Daily2048Challenge | null
  daily: ReturnType<Daily2048Progress['snapshot']>
  retention: ReturnType<Retention2048['snapshot']>
  accountStatus: AccountStatus
  dailyTimeConfirmed: boolean
}

// One real Unity session, two free loops. Neither writes an official tournament result.
export class Free2048Experience {
  private practice: Practice2048Experience
  private daily: Daily2048Progress | null = null
  private dailyObservations: Sessions2048
  private retention: Retention2048
  private trainingObservations: Training2048Observations
  private rewardedObservations: RewardedObservations
  private ticketOfferObservations: TicketOfferObservations
  private mode: FreeMode = 'practice'
  private next: { mode: FreeMode; challenge: Daily2048Challenge | null } = { mode: 'practice', challenge: null }
  private challenge: Daily2048Challenge | null = null
  private practiceId: string | null = null
  private accountStatus: AccountStatus = 'idle'
  private accountDay: string | null = null
  private accountRequest = 0
  private qualifiedDays = new Set<string>()
  private now: () => number
  private dailyNow: () => number
  private uuid: () => string
  constructor(private options: {
    getStorage: () => Storage | null
    category: 'observed_browser' | 'synthetic'
    measureAccountActivity?: boolean
    now?: () => number
    dailyNow?: () => number
    dailyAvailable?: () => boolean
    uuid?: () => string
    changed?: (snapshot: Free2048Snapshot) => void
    recordAccount?: (mode: FreeMode) => ReturnType<typeof reportPlayer2048Activity>
  }) {
    this.now = options.now ?? Date.now
    this.dailyNow = options.dailyNow ?? this.now
    this.uuid = options.uuid ?? (() => crypto.randomUUID())
    const local = { getStorage: options.getStorage, category: options.category, now: this.now, uuid: this.uuid }
    this.practice = new Practice2048Experience(local)
    this.retention = new Retention2048(local)
    this.trainingObservations = new Training2048Observations(local)
    this.rewardedObservations = new RewardedObservations({ getStorage: options.getStorage,
      category: options.category === 'synthetic' ? 'synthetic' : 'demonstration' })
    this.ticketOfferObservations = new TicketOfferObservations(local)
    this.dailyObservations = new Sessions2048({ ...local, build: UNITY_2048_BUILD,
      rulesVersion: '2048-daily-v1', mode: 'daily' })
  }
  ready() { this.practice.ready() }
  practiceCheckpointMetadata() { return this.practice.checkpointMetadata() }
  canResumePractice(saved: Saved2048Practice) {
    return this.mode === 'practice' && this.practiceId === null && this.practice.canResume(saved)
  }
  resumePractice(saved: Saved2048Practice) {
    if (!this.canResumePractice(saved) || !this.practice.resume(saved)) return false
    this.mode = 'practice'; this.next = { mode: 'practice', challenge: null }; this.challenge = null
    this.practiceId = saved.practiceId; this.qualifiedDays.clear()
    this.accountStatus = 'idle'; this.accountDay = null; this.accountRequest++
    // Only a subsequent valid move may record a local play day or account activity.
    this.emit(); return true
  }
  setToday(challenge: Daily2048Challenge) {
    if (!readDaily2048Challenge(challenge)) return
    // The host installs the server-clock anchor first. Do not expire stored goals
    // against a potentially incorrect device clock before the daily response.
    this.daily ??= new Daily2048Progress({ getStorage: this.options.getStorage,
      category: this.options.category, now: this.dailyNow })
    this.emit()
  }
  selectNext(mode: FreeMode, challenge: Daily2048Challenge | null = null) {
    if (mode === 'daily' && (this.options.dailyAvailable?.() === false || !readDaily2048Challenge(challenge)
      || !challenge || this.dailyNow() < challenge.startsAt || this.dailyNow() >= challenge.closesAt)) return false
    this.next = { mode, challenge: mode === 'daily' ? challenge : null }
    return true
  }
  snapshot(): Free2048Snapshot {
    const retention = this.retention.snapshot()
    return { mode: this.mode, personal: this.practice.snapshot(), challenge: this.challenge,
      daily: this.daily?.snapshot(this.challenge?.id) ?? { record: null, entries: [], storageStatus: 'ready' }, retention,
      accountStatus: this.accountDay === retention.today ? this.accountStatus : 'idle', dailyTimeConfirmed: this.options.dailyAvailable?.() !== false }
  }
  private emit() { this.options.changed?.(this.snapshot()) }
  refresh() { this.emit() }
  visibility(visible: boolean) { this.practice.visibility(visible); this.dailyObservations.visibility(visible); this.emit() }
  checkpoint() { this.practice.checkpoint(); this.dailyObservations.checkpoint() }
  exportJson(loadDiagnostics?: ReturnType<Load2048Diagnostics['snapshot']>) {
    this.checkpoint()
    const practice = JSON.parse(this.practice.exportJson())
    const daily = JSON.parse(this.dailyObservations.exportJson())
    return JSON.stringify({ format: 'torneos.2048.free-observations', version: 1,
      scope: 'Observaciones de este navegador; las métricas de cuentas se consultan en el reporte administrativo. El entrenamiento es una demostración local: no impresiones, concesiones publicitarias, ingresos ni retención comercial.',
      // Both trackers share the browser ledger. Export it once to avoid double counts.
      observations: practice.ledger ? practice : daily,
      personalProgress: this.practice.snapshot(), dailyProgress: this.daily?.snapshot() ?? null, localReturn: this.retention.snapshot(),
      trainingDemonstrationObservations: JSON.parse(this.trainingObservations.exportJson()),
      rewardedDemonstrationObservations: this.rewardedObservations.snapshot(),
      ticketOfferObservations: this.ticketOfferObservations.snapshot(),
      ...(loadDiagnostics ? { loadDiagnostics } : {}) }, null, 2)
  }
  // Keep adapter diagnostics outside all ordinary gameplay/lifecycle observers.
  observeRewarded = (event: RewardedEvent) => { this.rewardedObservations.observe(event) }
  observe = (event: Practice2048Event) => {
    // Return before emit/snapshot as even a daily snapshot can expire storage.
    // Session publishes training UI; this channel only writes the demo ledger.
    if (event.type === 'training' || event.assisted) { this.trainingObservations.observe(event); return }
    if (event.type !== 'start' && event.practiceId && event.practiceId !== this.practiceId) return
    if (event.type === 'start') {
      const previousDailyId = this.mode === 'daily' ? this.practiceId : null
      this.mode = this.next.mode; this.challenge = this.next.challenge
      this.practiceId = event.practiceId ?? this.uuid(); this.qualifiedDays.clear()
      this.accountStatus = 'idle'; this.accountDay = null; this.accountRequest++
      if (this.mode === 'daily' && this.challenge) {
        this.dailyObservations.ready()
        if (previousDailyId) this.dailyObservations.restart(previousDailyId, this.practiceId)
        else this.dailyObservations.start(this.practiceId)
        this.daily ??= new Daily2048Progress({ getStorage: this.options.getStorage, category: this.options.category, now: this.dailyNow })
        this.daily.begin(this.challenge, this.practiceId)
      }
    }
    if (this.mode === 'practice') this.practice.observe(event.type === 'start' && this.practiceId ? { ...event, practiceId: this.practiceId } : event)
    else if (this.practiceId) {
      if (event.type !== 'move' || this.options.dailyAvailable?.() !== false) this.daily?.observe(event)
      if (event.type === 'move') this.dailyObservations.validMove(this.practiceId, event.moves)
      if (event.type === 'end') this.dailyObservations.end(this.practiceId, 'no_moves')
      if (event.type === 'interrupted') this.dailyObservations.interrupt(this.practiceId, 'restart')
    }
    if (event.type === 'move' && this.practiceId) {
      const day = this.retention.snapshot().today
      if (day && !this.qualifiedDays.has(day)) {
        this.qualifiedDays.add(day)
        this.retention.recordPlay(this.mode)
        if (this.options.measureAccountActivity && this.options.category === 'observed_browser') {
          const id = this.practiceId
          const request = ++this.accountRequest
          this.accountStatus = 'recording'; this.accountDay = day
          const send = this.options.recordAccount ?? (mode => reportPlayer2048Activity(mode, { category: this.options.category }))
          void send(this.mode).then(result => {
            if (this.practiceId !== id || this.accountRequest !== request || this.retention.snapshot().today !== day) return
            this.accountStatus = result.status; this.emit()
          }).catch(() => { if (this.practiceId === id && this.accountRequest === request && this.retention.snapshot().today === day) { this.accountStatus = 'unavailable'; this.emit() } })
        }
      }
    }
    this.emit()
  }
}

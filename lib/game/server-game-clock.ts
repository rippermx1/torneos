// This is a display/input estimate. Only the server can confirm expiration.
export class ServerGameClock {
  private deadline?: number
  private serverAtSample = 0
  private sampledAt = 0
  constructor(private now: () => number = () => performance.now()) {}

  synchronize(data: Record<string, unknown>) {
    const deadline = typeof data.deadlineAt === 'string' ? Date.parse(data.deadlineAt) : this.deadline
    // Older hosts remain compatible; sample their wall clock once, never on ticks.
    const serverNow = data.serverNow === undefined ? Date.now()
      : typeof data.serverNow === 'string' ? Date.parse(data.serverNow) : NaN
    if (deadline === undefined || !Number.isFinite(deadline) || !Number.isFinite(serverNow)) {
      throw new Error('Referencia de tiempo inválida.')
    }
    this.deadline = deadline
    this.serverAtSample = serverNow
    this.sampledAt = this.now()
  }

  remainingSeconds() {
    if (this.deadline === undefined) return -1
    const elapsed = Math.max(0, this.now() - this.sampledAt)
    return Math.max(0, Math.ceil((this.deadline - this.serverAtSample - elapsed) / 1000))
  }
}

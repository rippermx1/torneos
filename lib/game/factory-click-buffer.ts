/** Input queue only, never currency. The API permits 1..8 clicks per UUID and 4/s sustained. */
export class FactoryClickBuffer {
  private queued = 0
  private inFlight = 0
  readonly capacity = 128
  get count() {return this.queued + this.inFlight}
  enqueue() {if (this.queued + this.inFlight >= this.capacity) return false; this.queued++; return true}
  take() {if (this.inFlight) return 0; const n = Math.min(8, this.queued); this.queued -= n; this.inFlight = n; return n}
  settle(submitted: number, accepted: number) {
    if (!Number.isInteger(accepted) || accepted < 0 || accepted > submitted || submitted < 1 || submitted > 8) throw new Error('Recibo de clics incompatible.')
    this.queued += submitted - accepted
    this.inFlight = 0
  }
}

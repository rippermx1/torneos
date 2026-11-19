// Leave room for the current provider call (8s timeout), DB persistence and heartbeat.
// Stop between durable units; never abort an external mutation and then resend it.
export const WORKER_BUDGET_MS = 35_000

export function workerCanStart(deadlineMs: number): boolean {
  return Date.now() < deadlineMs
}

export function workerDeadline(startedAt = Date.now()): number {
  return startedAt + WORKER_BUDGET_MS
}

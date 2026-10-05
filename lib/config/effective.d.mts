export type EnvMap = Record<string, string | undefined>
export function firstNonEmpty(...values: (string | null | undefined)[]): string | undefined
export function normalizeUrl(value: string): string
export function deploymentEnvironment(env: EnvMap): string
export function resolveFlowBase(env: EnvMap): string
export function effectiveConfig(env: EnvMap): { environment: string; stagingPhase: string; appUrl?: string; publicUrl?: string; serverUrl?: string; browserKey?: string; serverKey?: string; flowBase: string }

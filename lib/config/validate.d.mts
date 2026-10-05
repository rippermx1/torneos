import type { EnvMap } from './effective.mjs'
export interface EnvironmentResult { ok: boolean; environment: string; phase: string; issues: string[]; warnings: string[] }
export interface ValidationOptions { phase?: 'public-build' | 'runtime'; builtPublic?: { url?: string; key?: string; environment?: string; stagingPhase?: string; vercelProjectId?: string | null; aliases?: Record<string, string | null> } }
export function validateEnvironment(env: EnvMap, options?: ValidationOptions): EnvironmentResult
export function assertEnvironment(env: EnvMap, options?: ValidationOptions): EnvironmentResult

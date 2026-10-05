import { firstNonEmpty } from './effective.mjs'

export function providerDispatchBlocked(env = process.env) {
  return firstNonEmpty(env.STAGING_PHASE) === 'preflight'
}

export function assertProviderDispatchAllowed(env = process.env) {
  if (providerDispatchBlocked(env)) throw new Error('Envío a proveedores bloqueado durante preflight de staging')
}

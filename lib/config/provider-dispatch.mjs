import { firstNonEmpty } from './effective.mjs'

export function providerDispatchBlocked(env = process.env) {
  return ['preflight', 'configuration'].includes(firstNonEmpty(env.STAGING_PHASE))
}

export function assertProviderDispatchAllowed(env = process.env) {
  if (providerDispatchBlocked(env)) throw new Error('Envío a proveedores bloqueado durante validación de staging')
}

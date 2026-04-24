import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { getMercadoPagoAccessToken } from '@/lib/env'

// El cliente se instancia una sola vez por proceso.
// Las credenciales deben estar en .env.local.
function createMpClient() {
  const accessToken = getMercadoPagoAccessToken()
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado')
  }
  return new MercadoPagoConfig({ accessToken })
}

export function getMpPreference() {
  return new Preference(createMpClient())
}

export function getMpPayment() {
  return new Payment(createMpClient())
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '')
}

export function getAppUrl(fallback?: string) {
  const value = firstNonEmpty(
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    fallback
  )

  return value ? normalizeUrl(value) : undefined
}

export function getAllowedOrigins() {
  return Array.from(
    new Set(
      [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        getAppUrl(),
      ].filter((origin): origin is string => Boolean(origin))
    )
  )
}

export function getMercadoPagoAccessToken() {
  return firstNonEmpty(
    process.env.MERCADOPAGO_ACCESS_TOKEN,
    process.env.MP_API_TOKEN
  )
}

export function getMercadoPagoWebhookSecret() {
  return firstNonEmpty(
    process.env.MERCADOPAGO_WEBHOOK_SECRET,
    process.env.MP_SECRET_WEBHOOK
  )
}

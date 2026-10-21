const SAFE_REDIRECT_BASE = 'https://redirect.local'
const DEFAULT_ONBOARDING_RETURN_PATH = '/play'

export function getSafeAuthRedirectPath(
  value: string | null | undefined,
  fallback = '/onboarding'
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback
  }

  try {
    const parsed = new URL(value, SAFE_REDIRECT_BASE)
    if (parsed.origin !== SAFE_REDIRECT_BASE) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function withAuthDestination(path: string, destination: string): string {
  return `${path}?${new URLSearchParams({ next: getSafeAuthRedirectPath(destination, DEFAULT_ONBOARDING_RETURN_PATH) })}`
}

// Unwrap once when switching from login to signup; never redirect onboarding to itself.
export function getOnboardingReturnPath(value: unknown): string {
  let destination = getSafeAuthRedirectPath(typeof value === 'string' ? value : null, DEFAULT_ONBOARDING_RETURN_PATH)
  if (new URL(destination, SAFE_REDIRECT_BASE).pathname === '/onboarding') {
    destination = getSafeAuthRedirectPath(new URL(destination, SAFE_REDIRECT_BASE).searchParams.get('next'), DEFAULT_ONBOARDING_RETURN_PATH)
    if (new URL(destination, SAFE_REDIRECT_BASE).pathname === '/onboarding') return DEFAULT_ONBOARDING_RETURN_PATH
  }
  return destination
}

export function getOnboardingPath(value: unknown): string {
  const destination = getOnboardingReturnPath(value)
  return destination === DEFAULT_ONBOARDING_RETURN_PATH ? '/onboarding' : withAuthDestination('/onboarding', destination)
}

// Practice may return only to a tournament's public detail, never a game/payment URL.
export function getTournamentReturnPath(value: unknown): string | null {
  const destination = getSafeAuthRedirectPath(typeof value === 'string' ? value : null, '/tournaments')
  return /^\/tournaments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(destination) ? destination : null
}

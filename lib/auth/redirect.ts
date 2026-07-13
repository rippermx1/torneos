const SAFE_REDIRECT_BASE = 'https://redirect.local'

export function getSafeAuthRedirectPath(
  value: string | null | undefined,
  fallback = '/onboarding'
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
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

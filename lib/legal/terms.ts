export const CURRENT_TERMS_VERSION = '1.3'

export function hasAcceptedCurrentTerms(
  acceptedAt: string | null | undefined,
  acceptedVersion: string | null | undefined
): boolean {
  return Boolean(acceptedAt) && acceptedVersion === CURRENT_TERMS_VERSION
}

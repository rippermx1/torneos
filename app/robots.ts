import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  if (process.env.TORNEOS_ENV !== 'production-free-2048') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return { rules: { userAgent: '*', disallow: '/', allow: [
    '/play$', '/play/2048', '/play/catalog$', '/legal/terminos$', '/legal/privacidad$',
  ] } }
}

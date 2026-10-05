import { effectiveConfig, firstNonEmpty } from './lib/config/effective.mjs';
import { assertEnvironment } from './lib/config/validate.mjs';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { NextConfig } from "next";

export const nextConfig: NextConfig = {
  // Genera una salida standalone para el Dockerfile de producción.
  // next build copia solo las dependencias necesarias en .next/standalone.
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./games/**/*", "./packages/unity-sdk/**/*", "./artifacts/**/*"],
  },
  async redirects() {
    return [
      { source: '/practice', destination: '/play', permanent: true },
      { source: '/support', destination: '/support/dispute', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
      {
        source: "/games/:game/:build/index.html",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'" },
        ],
      },
      { source: "/games/:game/:build/Build/:file.wasm.gz", headers: [
        { key: "Content-Encoding", value: "gzip" }, { key: "Content-Type", value: "application/wasm" },
      ] },
      { source: "/games/:game/:build/Build/:file.js.gz", headers: [
        { key: "Content-Encoding", value: "gzip" }, { key: "Content-Type", value: "application/javascript" },
      ] },
      { source: "/games/:game/:build/Build/:file.data.gz", headers: [
        { key: "Content-Encoding", value: "gzip" }, { key: "Content-Type", value: "application/octet-stream" },
      ] },
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) assertEnvironment(process.env, { phase: 'public-build' });
  const c = effectiveConfig(process.env);
  const aliases = Object.fromEntries(['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED'].map(name => [name, firstNonEmpty(process.env[name]) ?? null]));
  return { ...nextConfig, env: { TORNEOS_BUILD_PUBLIC_CONFIG: JSON.stringify({ url: c.publicUrl, key: c.browserKey, environment: c.environment, aliases }) } };
}

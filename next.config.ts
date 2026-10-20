import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? '.next',
  turbopack: { root: process.cwd() },
  // Genera una salida standalone para el Dockerfile de producción.
  // next build copia solo las dependencias necesarias en .next/standalone.
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./games/**/*", "./packages/unity-sdk/**/*", "./artifacts/**/*"],
  },
  async redirects() {
    return [
      { source: '/', destination: '/play', permanent: false },
      { source: '/play/alien-run', destination: '/play/ted-runner', permanent: true },
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

export default nextConfig;

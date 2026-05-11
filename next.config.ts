import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera una salida standalone para el Dockerfile de producción.
  // next build copia solo las dependencias necesarias en .next/standalone.
  output: "standalone",
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
    ];
  },
};

export default nextConfig;

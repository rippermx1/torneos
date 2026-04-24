import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera una salida standalone para el Dockerfile de producción.
  // next build copia solo las dependencias necesarias en .next/standalone.
  output: "standalone",
};

export default nextConfig;

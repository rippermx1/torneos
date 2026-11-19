# ============================================================
# Dockerfile — Next.js standalone (producción)
#
# Stages:
#   deps     → instala dependencias necesarias para build
#   builder  → compila la app (next build)
#   runner   → imagen final mínima
# ============================================================

# ── 1. Dependencias ─────────────────────────────────────────
FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Builder ───────────────────────────────────────────────
FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS builder
WORKDIR /app

# Copia node_modules del stage anterior
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las variables públicas quedan fijadas al construir la imagen.
# Las credenciales privadas se inyectan exclusivamente en runtime.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Solo las vars que el browser necesita deben entrar como NEXT_PUBLIC_.
# Se hornean en el bundle durante `next build`.
ARG TORNEOS_ENVIRONMENT=production
ARG PRODUCTION_SUPABASE_PROJECT_REF
ARG STAGING_SUPABASE_PROJECT_REF
ARG NEXT_PUBLIC_SITE_URL
ENV TORNEOS_ENVIRONMENT=$TORNEOS_ENVIRONMENT
ENV PRODUCTION_SUPABASE_PROJECT_REF=$PRODUCTION_SUPABASE_PROJECT_REF
ENV STAGING_SUPABASE_PROJECT_REF=$STAGING_SUPABASE_PROJECT_REF
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GOOGLE_AUTH_ENABLED

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_AUTH_ENABLED

RUN node scripts/check-game-builds.mjs
RUN npm run build -- --webpack

# ── 3. Runner ────────────────────────────────────────────────
FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs
RUN mkdir /app/.local-flow && chown nextjs:nodejs /app/.local-flow

# El build standalone incluye solo lo necesario para correr la app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"


CMD ["node", "scripts/start-release.mjs"]

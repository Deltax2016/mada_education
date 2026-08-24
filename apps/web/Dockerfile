# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build servers are usually the smallest machine the project ever runs on, and
# the static generation worker gets SIGKILLed rather than reporting an error when
# it runs out of heap. Cap the heap explicitly so the failure cannot be silent.
ENV NODE_OPTIONS=--max-old-space-size=3072
# --network=none is the point, not an optimisation. next/font/google fetches
# woff2 files from fonts.gstatic.com during the build, which made every
# deployment depend on the build machine reaching Google, and that is exactly how
# this build failed. Fonts are vendored through @fontsource now, so the build
# needs no network at all. If anyone reintroduces a build-time download, it fails
# here on a machine we control instead of on a deploy server.
RUN --network=none npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# HOSTNAME must be set explicitly. Docker sets HOSTNAME to the container id, and
# the Next standalone server binds to whatever HOSTNAME says, so it ends up
# listening on the single interface that id resolves to. A container attached to
# more than one network is then unreachable from every other one, which is what a
# reverse proxy reports as "no available server" while the app logs a clean
# startup.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

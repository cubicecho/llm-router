# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
# Full node image (matches engines >=22.18); builds shared/server/app workspaces.
FROM node:26-slim AS builder

WORKDIR /app

# Copy workspace manifests first so the dependency layer caches independently
# of source changes.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY app/package.json ./app/

RUN npm ci

# Copy the rest of the source (.dockerignore excludes node_modules, data, dist, .git)
COPY . .

# shared typecheck → server tsc (server/dist) → app vite build (app/dist)
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:26-slim

WORKDIR /app

# Workspace manifests + production dependencies. `npm ci --omit=dev` also
# creates the node_modules/@llm-router/shared → ../../shared workspace symlink
# that the server needs at runtime (see below).
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY app/package.json ./app/

RUN npm ci --omit=dev && npm cache clean --force

# NOTE: @llm-router/shared is a source-only TS package — its package.json
# exports point at ./src/index.ts, and server's tsc build compiles only
# server/src, leaving `import ... from '@llm-router/shared'` in server/dist as
# a bare specifier. At runtime Node resolves it through the workspace symlink
# to /app/shared/src/index.ts (outside node_modules after realpath), which
# Node >=23.6 (and thus 26) type-strips natively — so `node server/dist/index.js`
# works with no flags as long as shared/ source is present. If the server build
# ever changes to bundle shared, this COPY becomes harmless dead weight; if
# type stripping ever fails here, switch CMD to a tsx-based start script.
COPY shared ./shared

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/app/dist ./app/dist

ENV NODE_ENV=production
# The config files live under /data — mount a volume here to persist them.
ENV DATA_DIR=/data

# Created and owned by node before VOLUME: a new named volume is seeded from this directory, owner included.
RUN mkdir -p /data && chown node:node /data

VOLUME /data

EXPOSE 3000

USER node

# /healthz needs no token and answers 200 once the server is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e 'fetch("http://localhost:" + (process.env.PORT || 3000) + "/healthz").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["node", "server/dist/index.js"]

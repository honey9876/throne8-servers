# ============================================================
# Dockerfile — thronet-server (PRODUCTION)
# /server/thronet-server/Dockerfile.production
# Place at: server/thronet-server/Dockerfile.production
# ============================================================

# ── Stage 1: Builder ────────────────────────────────────────
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# ✅ FIX 1: --ignore-scripts REMOVE karo — sharp aur baaki native
# packages ki postinstall scripts zaroori hain
# --omit=dev se devDependencies install nahi hongi builder mein bhi
RUN npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

COPY src ./src
COPY server.ts ./

# ── Stage 2: Production Runtime ─────────────────────────────
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init curl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r nodejs --gid=1001 \
    && useradd -r -g nodejs --uid=1001 nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
# ✅ FIX 2: LOG_DIR explicitly set karo
ENV LOG_DIR=/app/logs

COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/server.ts ./

# ✅ FIX 3: logs dir USER se PEHLE banao, phir ownership do
RUN mkdir -p /app/logs /app/temp /app/uploads && \
    chown -R nodejs:nodejs /app/logs /app/temp /app/uploads

USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "server.ts"]

# cache-bust 20260626112636
# cache-bust v2

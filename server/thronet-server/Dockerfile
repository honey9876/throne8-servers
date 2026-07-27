# # ============================================================
# # Dockerfile — thronet-server (PRODUCTION)
# # Place this at: server/thronet-server/Dockerfile.production
# # ============================================================

# # ── Stage 1: Builder ────────────────────────────────────────
# FROM node:18-slim AS builder

# RUN apt-get update && apt-get install -y --no-install-recommends \
#     python3 make g++ git \
#     && rm -rf /var/lib/apt/lists/*

# WORKDIR /app

# # 1. Dependencies first (layer cache)
# COPY package*.json ./
# COPY tsconfig.json ./

# RUN npm install --ignore-scripts --no-audit --no-fund && \
#     npm cache clean --force

# # 2. Source code AFTER install
# COPY src ./src
# # ✅ FIX: server.ts bhi copy karo (pehle miss tha)
# COPY server.ts ./

# # ── Stage 2: Production Runtime ─────────────────────────────
# FROM node:18-slim

# RUN apt-get update && apt-get install -y --no-install-recommends \
#     dumb-init curl ca-certificates wget \
#     && rm -rf /var/lib/apt/lists/* \
#     && groupadd -r nodejs --gid=1001 \
#     && useradd -r -g nodejs --uid=1001 nodejs

# WORKDIR /app

# ENV NODE_ENV=production
# ENV NODE_OPTIONS="--max-old-space-size=2048"

# # Copy from builder
# COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
# COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json ./
# COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
# COPY --from=builder --chown=nodejs:nodejs /app/src ./src
# # ✅ FIX: server.ts production image mein bhi chahiye
# COPY --from=builder --chown=nodejs:nodejs /app/server.ts ./

# # Runtime directories
# RUN mkdir -p logs temp uploads && \
#     chown -R nodejs:nodejs logs temp uploads

# USER nodejs

# # ✅ FIX: Correct port (app 4000 pe chalta hai, 3000 nahi)
# EXPOSE 4000

# # ✅ FIX: Health check sahi port pe
# HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
#     CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

# ENTRYPOINT ["dumb-init", "--"]
# # ✅ No command: override — ye directly chalega, nodemon nahi
# CMD ["node", "--import", "tsx/esm", "server.ts"]









# ============================================================
# Dockerfile — thronet-server (PRODUCTION)
# Place this at: server/thronet-server/Dockerfile.production
# ============================================================

# ── Stage 1: Builder ────────────────────────────────────────
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Dependencies first (layer cache)
COPY package*.json ./
COPY tsconfig.json ./

RUN npm install --ignore-scripts --no-audit --no-fund && \
    npm cache clean --force

# 2. Source code AFTER install
COPY src ./src
# ✅ FIX: server.ts bhi copy karo (pehle miss tha)
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

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
# ✅ FIX: server.ts production image mein bhi chahiye
COPY --from=builder --chown=nodejs:nodejs /app/server.ts ./

# Runtime directories
RUN mkdir -p logs temp uploads && \
    chown -R nodejs:nodejs logs temp uploads

USER nodejs

# ✅ FIX: Correct port (app 4000 pe chalta hai, 3000 nahi)
EXPOSE 4000

# ✅ FIX: Health check sahi port pe
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
# ✅ No command: override — ye directly chalega, nodemon nahi
CMD ["npx", "tsx", "server.ts"]
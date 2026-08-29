












// # Dockerfile.auth
// # Builder stage - Install dependencies
// FROM node:18-slim AS builder

// RUN apt-get update && apt-get install -y --no-install-recommends \
//     python3 \
//     make \
//     g++ \
//     git \
//     && rm -rf /var/lib/apt/lists/*

// WORKDIR /app

// # Copy package files first
// COPY package*.json ./

// # Copy tsconfig if exists
// COPY tsconfig.json* ./

// # Install ALL dependencies (production + dev for TypeScript runtime)
// RUN npm install --ignore-scripts --no-audit --no-fund && \
//     npm cache clean --force

// # 🔥 IMPORTANT: Copy source code AFTER npm install
// COPY src ./src

// # Production stage
// FROM node:18-slim

// RUN apt-get update && apt-get install -y --no-install-recommends \
//     dumb-init \
//     curl \
//     ca-certificates \
//     && rm -rf /var/lib/apt/lists/* \
//     && groupadd -r nodejs --gid=1001 \
//     && useradd -r -g nodejs --uid=1001 nodejs

// WORKDIR /app

// # Set Node environment
// ENV NODE_ENV=production
// ENV NODE_OPTIONS="--max-old-space-size=4096"

// # Copy package files
// COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

// # Copy tsconfig
// COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json* ./

// # Copy ALL node_modules (including ts-node, typescript for runtime)
// COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

// # Copy TypeScript source code
// COPY --from=builder --chown=nodejs:nodejs /app/src ./src

// # Create necessary directories
// RUN mkdir -p logs temp uploads certs && \
//     chown -R nodejs:nodejs logs temp uploads certs

// # Switch to non-root user
// USER nodejs

// # Expose ports
// EXPOSE 3000 9100

// # Health check
// HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
//     CMD curl -f http://localhost:3000/api/health || exit 1

// # Entry point
// ENTRYPOINT ["dumb-init", "--"]

// # Run TypeScript directly with ts-node (production-safe)
// CMD ["node", "--import", "tsx/esm", "server.ts"]
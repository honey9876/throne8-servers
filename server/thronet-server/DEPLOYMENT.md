# Production Deployment Guide: Multi-Tier Redis Caching & Queue Architecture

This document specifies the operational topology, infrastructure configuration, rollout sequencing, monitoring runbooks, and rollback procedures for deploying the Redis caching, BullMQ queueing, and Socket.IO clustering systems across production environments.

---

## 1. Dual Redis Infrastructure Architecture

To guarantee strict isolation between high-throughput cache churn and critical asynchronous background tasks, two distinct Redis server instances MUST be deployed:

```
                            ┌───────────────────────────────────────┐
                            │      Load Balancer (e.g. NGINX)       │
                            │   (Sticky Sessions: ip_hash / cookie) │
                            └──────────────────┬────────────────────┘
                                               │
                    ┌──────────────────────────┴──────────────────────────┐
                    ▼                                                     ▼
        ┌───────────────────────┐                             ┌───────────────────────┐
        │  Server Instance 1    │                             │  Server Instance 2    │
        │  (Express + Socket)   │                             │  (Express + Socket)   │
        └───────────┬───────────┘                             └───────────┬───────────┘
                    │                                                     │
                    ├──────────────────────────┬──────────────────────────┤
                    │                          │                          │
                    ▼                          ▼                          ▼
      ┌───────────────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐
      │   Worker Process (PM2)    │  │   Redis 1: CACHE  │  │   Redis 2: QUEUE (BullMQ) │
      │   (Email / Notif Workers) │  │   Maxmemory: 2GB  │  │   Maxmemory: 2GB          │
      └─────────────┬─────────────┘  │   allkeys-lru     │  │   noeviction              │
                    │                │   appendonly: no  │  │   appendonly: yes (AOF)   │
                    └────────────────┼───────────────────┼───────────────────────────┘
                                     │                   │
                                     ▼                   ▼
                          Cache / Live Rooms / Pres.   Reliable Job Delivery
```

### Redis Instance 1: Primary Cache & Ephemeral State
* **Purpose**: General object caching (Auth, Profile, Chat, Connections, Doubts, Reviews), Leaderboard sorted sets, Socket.IO adapter pub/sub, Presence heartbeats, Live room timers.
* **Maxmemory Eviction Policy**: `maxmemory-policy allkeys-lru`
  * Keys without explicit TTLs or approaching memory limits can be safely evicted under memory pressure using LRU heuristic.
* **Persistence**: Snapshotting (`save 900 1 300 10 60 10000`). `appendonly no` to maximize write throughput and minimize IOPS latency.
* **Configuration snippet (`redis-cache.conf`)**:
  ```ini
  port 6379
  maxmemory 2gb
  maxmemory-policy allkeys-lru
  save 900 1
  save 300 10
  appendonly no
  tcp-keepalive 300
  timeout 0
  ```

### Redis Instance 2: Dedicated Queue Instance (BullMQ)
* **Purpose**: Reliable job execution for email dispatch (`email-queue`) and notification delivery (`notification-queue`).
* **Maxmemory Eviction Policy**: `maxmemory-policy noeviction`
  * **CRITICAL**: BullMQ queues MUST NEVER use eviction policies like `allkeys-lru` or `volatile-lru`. If Redis evicts job metadata or delayed zset keys, jobs are lost or workers stall.
* **Persistence**: `appendonly yes` with `appendfsync everysec` for durable, crash-resilient queue delivery.
* **Configuration snippet (`redis-queue.conf`)**:
  ```ini
  port 6380
  maxmemory 2gb
  maxmemory-policy noeviction
  appendonly yes
  appendfsync everysec
  auto-aof-rewrite-percentage 100
  auto-aof-rewrite-min-size 64mb
  tcp-keepalive 300
  ```

---

## 2. Security: Authentication & TLS Configuration

1. **Passwords**: Both Redis instances must require strong authentication via `requirepass`:
   ```bash
   REDIS_PASSWORD=a_very_long_secure_random_string_min_32_chars
   ```
2. **TLS / SSL**:
   * For cloud managed Redis (e.g. AWS ElastiCache, Upstash, Redis Enterprise), set `REDIS_TLS=true`.
   * For dedicated VMs, provide mutual TLS or specify TLS termination proxy (e.g. Stunnel) with Redis 6+ native TLS support:
   ```ini
   tls-port 6379
   port 0
   tls-cert-file /etc/ssl/redis/redis.crt
   tls-key-file /etc/ssl/redis/redis.key
   tls-ca-cert-file /etc/ssl/redis/ca.crt
   tls-auth-clients yes
   ```
3. **Environment URLs**:
   * Cache URL: `redis://:password@127.0.0.1:6379`
   * Queue URL: `redis://:password@127.0.0.1:6380` or `rediss://` for TLS.

---

## 3. Worker Process Management (PM2 & Docker)

Background queue workers (`email.worker.ts`, `notification.worker.ts`) and socket instances should run in dedicated processes separated from API HTTP traffic.

### A. PM2 Process Topology (`ecosystem.config.js`)
```javascript
module.exports = {
  apps: [
    {
      name: 'thronet-api',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
    {
      name: 'thronet-worker',
      script: './dist/src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        REDIS_QUEUE_URL: 'redis://127.0.0.1:6380',
      },
    },
  ],
};
```

### B. Docker Compose Multi-Container Deployment
```yaml
version: '3.8'

services:
  redis-cache:
    image: redis:7-alpine
    container_name: thronet-redis-cache
    command: ["redis-server", "--maxmemory", "2gb", "--maxmemory-policy", "allkeys-lru", "--appendonly", "no"]
    ports:
      - "6379:6379"
    restart: always

  redis-queue:
    image: redis:7-alpine
    container_name: thronet-redis-queue
    command: ["redis-server", "--maxmemory", "2gb", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    ports:
      - "6380:6379"
    volumes:
      - redis_queue_data:/data
    restart: always

  api:
    build: .
    container_name: thronet-api
    command: ["node", "dist/server.js"]
    ports:
      - "5000:5000"
    environment:
      - REDIS_HOST=redis-cache
      - REDIS_PORT=6379
      - REDIS_QUEUE_URL=redis://redis-queue:6379
    depends_on:
      - redis-cache
      - redis-queue
    restart: always

  worker:
    build: .
    container_name: thronet-worker
    command: ["node", "dist/src/worker.js"]
    environment:
      - REDIS_QUEUE_URL=redis://redis-queue:6379
    depends_on:
      - redis-queue
    restart: always

volumes:
  redis_queue_data:
```

---

## 4. Sticky Sessions for Socket.IO Multi-Instance Clustering

Socket.IO HTTP long-polling handshake requires that HTTP requests originating from the same client session are routed to the **same Node process** until the WebSocket transport connection is fully established.

### NGINX Reverse Proxy Configuration
```nginx
upstream thronet_cluster {
    # Sticky session routing via client IP hash (or sticky cookie)
    ip_hash;

    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    keepalive 64;
}

server {
    listen 80;
    server_name api.thronet.com;

    location /socket.io/ {
        proxy_pass http://thronet_cluster;
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        proxy_pass http://thronet_cluster;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Domain Kill Switches & Phased Rollout Order

All caching layers and background queues are protected by runtime kill switches. Setting an environment variable to `false` instantly forces that domain to bypass Redis and query MongoDB directly, without requiring code changes or application rebuilds.

### Safe Rollout Sequencing:
1. **Phase 1: Foundation**:
   - `CACHE_GLOBAL_ENABLED=true`
   - `BLACKLIST_LEGACY_RAW_KEYS_ENABLED=true`
   - Verify connection health via `/api/v1/health` and `/metrics`.
2. **Phase 2: Master Data & Read Caches**:
   - `CACHE_MASTER_ENABLED=true` (Static reference data)
   - `CACHE_COMPANY_ENABLED=true` (Company public profiles)
   - `CACHE_PROFILE_ENABLED=true` (User profiles)
3. **Phase 3: High-Churn Read Feeds**:
   - `CACHE_LEADERBOARD_ENABLED=true` (Sorted set leaderboards)
   - `CACHE_ANALYTICS_ENABLED=true` (Study session analytics)
   - `CACHE_DOUBT_ENABLED=true` (Group doubt feeds)
   - `CACHE_COMMENT_ENABLED=true` (Post comments)
   - `CACHE_REACTION_ENABLED=true` (Post reactions)
4. **Phase 4: Session, Chat & Graph**:
   - `CACHE_AUTH_ENABLED=true` (Token blacklist & stateless sessions)
   - `CACHE_NOTIFICATION_ENABLED=true` (Unread notification count)
   - `CACHE_CHAT_ENABLED=true` (Conversation lists & unread badges)
   - `CACHE_CONNECTIONS_ENABLED=true` (Degrees of connection & counts)
5. **Phase 5: Real-time Sockets & Background Queues**:
   - `SOCKET_REDIS_ADAPTER_ENABLED=true` (Cross-instance socket pub/sub)
   - `CACHE_SOCKET_ENABLED=true` (Presence heartbeats & live rooms)
   - `CACHE_QUEUE_EMAIL_ENABLED=true` (BullMQ email queue)
   - `CACHE_QUEUE_NOTIFICATION_ENABLED=true` (BullMQ notification queue)

---

## 6. Prometheus Monitoring & Alerting Runbook

Prometheus metrics are exposed at `GET /metrics`. Key metrics to observe in Grafana:

| Metric Name | Type | Description | Alert Threshold |
| :--- | :--- | :--- | :--- |
| `cache_operations_total{status="hit"}` | Counter | Cache hits per domain | Rate ratio < 0.60 |
| `cache_operations_total{status="miss"}` | Counter | Cache misses per domain | Rapid spike indicates key invalidation loop |
| `cache_operations_total{status="error"}` | Counter | Redis command errors & timeouts | > 5 errors/min |
| `bullmq_jobs_waiting{queue="email"}` | Gauge | Jobs waiting in BullMQ email queue | > 500 jobs |
| `bullmq_jobs_failed{queue="email"}` | Gauge | Failed job execution count | > 10 failed |
| `presence_online_users` | Gauge | Cluster-wide concurrent active users | Drop to 0 indicates socket cluster issue |

---

## 7. Emergency Rollback Procedures

If an incident or Redis performance degradation occurs in production:

1. **Instant Domain Kill Switch**:
   * If an issue is localized (e.g. Chat or Leaderboard), disable that domain's flag in runtime environment:
     ```bash
     export CACHE_CHAT_ENABLED=false
     # or via platform dashboard (e.g. Railway, Render, AWS ECS)
     ```
   * Traffic immediately falls back open to authoritative MongoDB queries without restart.
2. **Global Cache Fallback**:
   * If Redis 1 experiences an outage, memory crash, or network partition:
     ```bash
     export CACHE_GLOBAL_ENABLED=false
     export SOCKET_REDIS_ADAPTER_ENABLED=false
     ```
   * The app defaults to in-memory fallback stores and direct MongoDB queries.
3. **Queue Fallback**:
   * If Redis 2 (BullMQ) fails:
     ```bash
     export CACHE_QUEUE_EMAIL_ENABLED=false
     ```
   * `enqueueEmail` automatically catches the failure and dispatches emails synchronously through `NotificationService.sendEmail`.

---

## 8. Explicit List of Deliberately Unchanged Components

To preserve system stability, backwards compatibility, and prevent scope creep, the following components were deliberately left unchanged:

1. **Authoritative Primary Data Stores**:
   * All mutations persist to MongoDB collections first. Redis acts strictly as an acceleration and coordination layer; no primary database records were migrated to Redis.
2. **WebRTC Media & Peer Signaling**:
   * Audio/Video streams, ICE candidates, and SDP handshakes flow strictly peer-to-peer over WebRTC using ephemeral Socket.IO relay events (`webrtc-offer`, `webrtc-answer`, `ice-candidate`). They are NEVER saved to Redis.
3. **Local Per-Socket State**:
   * Per-socket rate-limiting maps and temporary typing indicators (`user-typing`) remain process-local Maps. Sockets exist strictly on a single node; distributing typing debounce over Redis adds unnecessary IOPS without functional benefit.
4. **Existing API Response Schemas**:
   * No API endpoint response structures or payload contracts were altered. Comment counts preserve the true total count (`total`) while dynamically filtering blocked users per viewer.
5. **Existing Authentication Middleware Signatures**:
   * `authenticateJWT` and passport OAuth flows retain identical function signatures and express middleware contracts.

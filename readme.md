# Throne8 Server — Refactoring Changelog

> **Project:** `throne8-server` — Thronet Backend  
> **Repo:** `throne8pvtltd-collab/throne8-servers`

---

## [v2.0.0] — 03 July 2026

> **Focus:** Production Railway Deployment — Redis Fix, Job-Service, Email Integration, Security Hardening

### 1. Redis Cluster → Standalone Fix (Critical)

**Problem:** `redis.service.ts` me `ioredis` ka `Redis.Cluster` client **unconditionally** banta tha, chahe `REDIS_CLUSTER_MODE=false` ho. Railway ka Redis addon standalone hai — Cluster client uspe silently hang ho jaata tha (process alive, CPU idle, no response — classic 502 Bad Gateway).

**Root Cause:**
```typescript
// Before — always Cluster, ignores REDIS_CLUSTER_MODE
this.cluster = new Redis.Cluster(nodes, options);
```

**Fix — `src/services/redis.service.ts`:**
```typescript
// After — conditionally Cluster or Standalone
this.isClusterMode = environmentConfig.REDIS_CLUSTER_MODE;

if (this.isClusterMode) {
    this.cluster = new Redis.Cluster(nodes, options);
} else {
    const node = nodes[0] as { host: string; port: number };
    this.cluster = new Redis({
        host: node.host,
        port: node.port,
        ...options.redisOptions,
        retryStrategy: (times) => {
            if (times > this.MAX_RECONNECT_ATTEMPTS) return null;
            return Math.min(times * 200, 3000);
        },
    });
}
```






**Other fixes in `redis.service.ts`:**
- `getMasterNodes()` helper — standalone me single client return karta hai, cluster me `.nodes('master')`
- `getSlaveNodes()` — sirf cluster mode me meaningful
- `logClusterInfo()` — standalone me gracefully skip karta hai
- `'node error'`, `'+node'`, `'-node'` events — sirf cluster mode me attach hote hain
- `checkHealth()` — `clusterMode: this.isClusterMode` dynamically set
- `getCluster()` — `as unknown as Cluster` cast taaki existing consumers compatible rahein

**Railway Variable:**
```
REDIS_CLUSTER_MODE=false
```

---

### 2. `premiumJobSearch` Redis Race Condition Fix

**Problem:** `premiumJobSearch.service.ts` ke bottom me module-load time pe:
```typescript
export default createJobSearchService(); // synchronous, module import pe chalta hai
```
Andar `JobSearchService.initialize()` → `CacheUtil.getClient().ping()` call hota tha — lekin `CacheUtil` abhi initialized nahi hota startup sequence me.

**Fix — `src/Job-Service/services/premium/premiumJobSearch.service.ts`:**
```typescript
// Before
await CacheUtil.getClient().ping(); // throws if not connected

// After
await CacheUtil.ping(); // gracefully returns 'PONG' even if disconnected
```

---

### 3. Job-Service Enable

**File: `src/app.ts`**
```typescript
// Uncommented:
import jobServiceRoutes from './Job-Service/routers';
app.use('/api/v1/job-service', jobServiceRoutes);
```

**Verified:** Elasticsearch client (`esClient`) already guarded hai:
```typescript
if (!esClient) throw new ExternalServiceError("Elasticsearch client not initialized");
```
Startup pe hang nahi karta (lazy fail on request).

**Live endpoint:** `GET /api/v1/job-service/health` → `200 OK`

---

### 4. `app.ts` Production Hardening

**File: `src/app.ts`** — version `4.0.0 → 4.1.0`

| Change | Details |
|--------|---------|
| NoSQL Injection Protection | `express-mongo-sanitize` — sanitizes `req.body` + `req.params` (Express 5 compatible fix — `req.query` skip kiya kyunki getter-only hai) |
| HTTP Parameter Pollution | `hpp` middleware added |
| 404 Handler | Custom JSON 404 response — pehle Express default page aata tha |
| CORS Error Fix | CORS reject pe ab `403` deta hai (pehle `500` jaata tha) |
| Auth Rate Limiter | `/api/v1/auth` pe stricter limit — 50 req/15min (brute-force protection) |
| Readiness Probe | `GET /api/v1/health/ready` — actual MongoDB connection state check karta hai |

**New packages:**
```bash
npm install express-mongo-sanitize hpp
npm install -D @types/hpp
```

**New endpoints:**
- `GET /api/v1/health` — liveness probe (process alive check)
- `GET /api/v1/health/ready` — readiness probe (MongoDB connected check)

---

### 5. Email — SendGrid Integration

**Problem:** Railway outbound network SMTP ports (587 aur 465) block karta hai — Gmail transporter hamesha timeout deta tha.

**Solution:** SendGrid HTTP API (`@sendgrid/mail`) — already package installed tha, sirf `EMAIL_SERVICE=sendgrid` set karna tha.

**Railway Variables set kiye:**
```
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=<api_key>
EMAIL_USER=throne8pvt.ltd@gmail.com
EMAIL_PASSWORD=<app_password>
EMAIL_FROM=throne8pvt.ltd@gmail.com
EMAIL_FROM_NAME=Thronet
SMTP_USER=throne8pvt.ltd@gmail.com
SMTP_PASSWORD=<app_password_no_spaces>
```

**Sender verified:** `throne8pvt.ltd@gmail.com` — SendGrid Single Sender Verification complete.

**Note:** Domain Authentication (`throne8.com`) pending hai — emails abhi spam me ja sakti hain. Complete karna hai baad me.

---

### 6. CORS Domain Set

```
CORS_ORIGIN=https://throne8.com,https://www.throne8.com
```

---

### 7. Railway Deployment — Confirmed Working

**Live URL:** `https://throne8-servers-production.up.railway.app/api/v1`

| Endpoint | Status |
|----------|--------|
| `GET /api/v1/health` | ✅ 200 OK |
| `GET /api/v1/health/ready` | ✅ 200 OK (mongodb: connected) |
| `GET /api/v1/job-service/health` | ✅ 200 OK |
| `GET /api/v1` | ✅ 200 OK (Thronet API is running) |

---

### Files Changed

| File | Change |
|------|--------|
| `src/services/redis.service.ts` | Redis cluster/standalone conditional fix |
| `src/Job-Service/services/premium/premiumJobSearch.service.ts` | `CacheUtil.getClient().ping()` → `CacheUtil.ping()` |
| `src/app.ts` | Job-Service enabled, production hardening (v4.1.0) |
| `package.json` | `express-mongo-sanitize`, `hpp` added |

### Known Pending Issues

| Issue | Priority | Notes |
|-------|----------|-------|
| 636 TS errors (132 files) | 🟡 Medium | Pre-existing, non-blocking (Docker build succeeds via `tsx`) |
| Redis cluster-only method guards | 🟡 Medium | `block.service.ts`, `network.service.ts` etc. `.nodes('master')` calls unguarded |
| SendGrid Domain Authentication | 🟡 Medium | `throne8.com` DNS records pending — emails going to spam |
| Gmail email transporter | 🟢 Low | Replaced by SendGrid, no action needed |

---

## [v1.0.0] — 23 May 2026

> **Focus:** Architecture Cleanup — Kafka removal, Monitoring removal, Entry point refactor

### 1. Kafka & Zookeeper Removal

**Problem:** Monolithic architecture me Kafka unnecessary tha.

**Changes — `docker-compose.yml`:**

| Action | Service |
|--------|---------|
| Removed | `zookeeper` |
| Removed | `kafka-1`, `kafka-2` |
| Removed | `kafka-ui` |

**Volumes removed:** `zookeeper-data`, `zookeeper-logs`, `kafka-*-data`

**`app.ts` se remove kiya:**
```typescript
// Removed:
import AuditProducer from './shared/kafka/producers/audit.producer';
await AuditProducer.connect();
await AuditProducer.disconnect();
```

---

### 2. Monitoring Stack Removal

**Removed services:** Prometheus, Grafana, node-exporter, Elasticsearch, Kibana

**`app.ts` se remove kiya:**
```typescript
import { prometheusRouter } from './shared/observability/...';
import { recordHttpRequest } from './shared/observability/...';
import { initializeTracer } from './shared/observability/...';
// ... etc
```

---

### 3. Redis Cluster Fix (Local Docker)

**Problem:** Redis 7.2 me `--cluster-announce-ip hostname` invalid tha (sirf IPv4/IPv6 accept karta hai).

**Fix:** `--cluster-announce-ip` flag remove kiya teenon nodes se.

---

### 4. Environment Variables — `.env` Setup

`.env` file banai, `docker-compose.yml` me `env_file:` use kiya — secrets hardcoded band kiye.

---

### 5. Entry Point Refactor — `app.ts` → `server.ts` + `app.ts`

**New structure:**
```
thronet-server/
├── server.ts     ← Entry point (DB connect, cache init, HTTP server)
├── src/
│   └── app.ts    ← Express config only (middleware, routes, error handler)
```

**`package.json` scripts:**
```json
"exec": "npx tsx server.ts",
"start": "node --import tsx/esm server.ts"
```

---

### Services Status (v1.0.0)

| Service | Port | Status |
|---------|------|--------|
| `thronet-server` | `4000` | ✅ Running |
| `redis-node-1/2/3` | `7001-7003` | ✅ Running |
| Kafka/Zookeeper | — | ❌ Removed |
| Prometheus/Grafana | — | ❌ Removed |
| Elasticsearch/Kibana | — | ❌ Removed |
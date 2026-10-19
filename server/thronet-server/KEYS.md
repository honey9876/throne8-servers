# Production Redis Key Architecture & Catalogue (KEYS.md)

> **Generated on:** 2026-10-15T18:09:01.896Z  
> **Total Distinct Key Patterns:** 47  
> **Total Discovered Live Keys Scanned:** 5120  

## Architecture Overview
- **Key Prefixing Standard:** All application domains follow hierarchical colon-delimited namespacing (`app:v1:<domain>:<resource>`).
- **Eviction Safety:** Non-persistent caches utilize monotonic version tags (`:v:<version>`) ensuring O(1) atomicity and eliminating expensive, cluster-blocking wildcard `SCAN` operations.
- **Isolation Policy:** Background queues (`bull:*`) operate under `noeviction` isolation, while read caches operate under bounded TTLs with jitter.
- **Hash Tagging:** Cluster partition-sensitive resources use Redis hash tags (`{roomId}`) to enforce same-slot co-location.

## Key Schema Matrix

| Domain | Key Pattern | Redis TYPE | Default TTL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `auth:blacklist:access:{sha256(token)}` | `STRING` | 192s | Revoked access token blacklist with remaining JWT TTL |
| **Auth** | `auth:blacklist:refresh:{sha256(token)}` | `STRING` | 600103s | Revoked refresh token blacklist |
| **Auth** | `auth:session:{sessionId}` | `STRING` | 86400s | Cached user session details |
| **Auth** | `auth:session:guard:{userId}:{sessionId}` | `STRING` | 1800s | Distributed session activity guard and concurrency lock |
| **Chat** | `app:v1:chat:convs:{userId}:v:{version}` | `STRING` | 67s | Cached user conversations list (versioned) |
| **Chat** | `app:v1:chat:thread:{threadId}` | `STRING` | 3600s | Chat thread messages and metadata cache |
| **Chat** | `app:v1:chat:unread:{userId}` | `STRING` | 300s | Total unread chat message counter |
| **Chat** | `app:v1:chat:v:{userId}` | `STRING` | 600069s | Monotonic chat conversation list version key |
| **Comments** | `app:v1:comments:post:{postId}` | `STRING` | 84s | Cached top comments thread per post |
| **Company** | `app:v1:company:profile:{companyId}` | `STRING` | 7200s | Company profile and follower count cache |
| **Connections** | `app:v1:connections:blocks:{userId}` | `SET` | 7200s | Cached set of blocked user IDs for privacy filtering |
| **Connections** | `app:v1:connections:count:{userId}` | `STRING` | 7200s | Active connection count cache |
| **Connections** | `app:v1:connections:pending:{userId}` | `STRING` | 600s | Cached pending connection requests for user |
| **Connections** | `app:v1:connections:set:{userId}` | `SET` | Persistent (No TTL) | Redis Set of active user connections (used for SINTER mutuals) |
| **Connections** | `app:v1:connections:v:{userId}` | `STRING` | Persistent (No TTL) | Monotonic connection list version key |
| **Doubts** | `app:v1:doubt:detail:{doubtId}` | `STRING` | 3600s | Academic doubt question and answers thread cache |
| **General** | `app:v1:liveroom:{room_seed_12}:state` | `HASH` | 3600s | System cache entry |
| **General** | `app:v1:mentorship_availability:slots:mentor_alpha_101:v{id}:{id}:AsiaKolkata` | `STRING` | 1349s | System cache entry |
| **General** | `app:v1:mentorship_availability:slots:mentor_beta_202:v{id}:{id}:AsiaKolkata` | `STRING` | 1862s | System cache entry |
| **General** | `app:v1:mentorship_availability:slots:mentor_evict_test_{id}:v{id}:{id}:AsiaKolkata` | `STRING` | 1877s | System cache entry |
| **General** | `app:v1:test:date_serialization` | `STRING` | 61s | System cache entry |
| **General** | `app:v1:test:hit_miss_key_{id}` | `STRING` | 57s | System cache entry |
| **General** | `app:v1:test:stampede_protection` | `STRING` | 57s | System cache entry |
| **General** | `auth:access_token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYm9vdF8yMDc1NDEwNiIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbklkIjoiYTFhYjBkOTJmZTJhZDEzODAxZDBlOWQ4OGMyMDBhZjAwMTlmZWNiY2Y1OGUxYWRmODAzNWMxOWNhOTY5NjAzNSIsImRldmljZUlkIjoiZjlkZmYzZTczY2E4NzIxYTdlYzUzOGFkYjMxOWUxNzMiLCJpYXQiOjE3OTIwODc2NjAsImV4cCI6MTc5MjA4ODU2MH0.aztiG5uuxUkexZ5lmyJtK_eG53y2w_hN2wFYD42BvW4` | `STRING` | 890s | System cache entry |
| **General** | `auth:access_token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYm9vdF8yNWVlMTk2OCIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbklkIjoiNTVkZTVlNmRlZTE3MDQ0MTAzZTE2NTUwMDIyYzQwZDVlMWE1YTE2ZTRiNWVlNDhmNmZiN2MwNDY0MjYxMDhlMSIsImRldmljZUlkIjoiY2Q4ZTY1MjdkYzJhOGI3ZTE2NmU2YmRhMTg2NjljYjkiLCJpYXQiOjE3OTIwODcxMDIsImV4cCI6MTc5MjA4ODAwMn0.AKXlkKxoCXKDLaYXvy3oqeZDvrTA7TWuIF0bkGHEqMY` | `STRING` | 332s | System cache entry |
| **General** | `auth:access_token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYm9vdF8yYzBkMGM1OCIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbklkIjoiNGQyZTQ0MzUyZjgyOTNhNDUyNDE5MWZlOWZiODk3ZDgzMTg3NWM5YzI4NDE3NzQwMTY5ZGFiZDc5MDJjNTVkYiIsImRldmljZUlkIjoiZTMwNTg2NTMzZjNhNzE3OTZkMzUwNjMxMDUwNWY5MTIiLCJpYXQiOjE3OTIwODc3MzgsImV4cCI6MTc5MjA4ODYzOH0.jeXPdK7pahoWuDjsIiX2RHGuz-wDmMqDQX3zWyK8xZE` | `STRING` | 896s | System cache entry |
| **General** | `auth:access_token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYm9vdF9hN2MxNGM1OSIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbklkIjoiY2Q0OTE4ZTZlM2Y3OGY2NmE3MzllNDY1N2NkNzJmM2FkNzIxOTU4N2U1NDNhYWExMzNlZDk0ZTFlOTZmZjMyNyIsImRldmljZUlkIjoiZWZhZmU2YjcxZGUzZGFkNGI4MDY2MWE1ZTRlYTBlODgiLCJpYXQiOjE3OTIwODY5NjEsImV4cCI6MTc5MjA4Nzg2MX0.U8dQkzGu8VEnA_R0mHXJKeMjp5X5SQHfPZ9tePcEehU` | `STRING` | 191s | System cache entry |
| **General** | `auth:access_token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYm9vdF9lYWFlOGNlNyIsInJvbGUiOiJ1c2VyIiwic2Vzc2lvbklkIjoiNThhZGRlOWUzNjYxZTMwYmUwZGIzNmU4NDE5MzdhZmI1YWEyOWQ5NmUxMzM0NDRlNjM3MThiMjFiODY2OGIxYyIsImRldmljZUlkIjoiMmFjNGIyOWVjMzA4NDljYWI3MzMyZDZhOTRlMmI4MmEiLCJpYXQiOjE3OTIwODcyMjUsImV4cCI6MTc5MjA4ODEyNX0.SFvyiFfTI_ULVmNRiW7Or9YCZCPRcHQiQdAWSAF35nM` | `STRING` | 456s | System cache entry |
| **General** | `auth:compat_test_key_counter` | `STRING` | 60s | System cache entry |
| **General** | `auth:rl:login:ip:127.0.0.1` | `STRING` | 50s | System cache entry |
| **General** | `authaudit:events` | `STREAM` | Persistent (No TTL) | System cache entry |
| **General** | `authblacklist:refresh:{id}` | `STRING` | 599757s | System cache entry |
| **Leaderboards** | `app:v1:leaderboard:{category}:{timeframe}` | `ZSET` | 86365s | Redis Sorted Set (ZSET) for ranks and scores |
| **Master Data** | `app:v1:master:{category}` | `STRING` | 84074s | Lookup taxonomy cache (skills, colleges, degrees, industries) |
| **Mentorship** | `app:v1:mentorship_availability:list:{mentorId}:v{version}:{date}` | `STRING` | 1215s | Cached mentor availability schedule per date (eviction-safe versioned) |
| **Mentorship** | `app:v1:mentorship_availability:mentor_ver:{mentorId}` | `STRING` | Persistent (No TTL) | Monotonic availability schedule version key (O(1) bump) |
| **Mentorship** | `app:v1:mentorship:availability:{mentorId}` | `STRING` | 1800s | Mentor available session slots cache |
| **Mentorship** | `app:v1:mentorship:lock:{slotId}` | `STRING` | 15s | Distributed mutex lock during booking concurrency checks |
| **Notifications** | `app:v1:notification:list:{userId}:v:{version}:{page}:{limit}` | `STRING` | 13s | Paginated user notification feed cache |
| **Notifications** | `app:v1:notification:unread:{userId}` | `STRING` | 120s | Unread notification count (strictly capped at 120s TTL) |
| **Notifications** | `app:v1:notification:v:{userId}` | `STRING` | 604757s | Monotonic notification list version key |
| **Profile** | `app:v1:profile:public:{userId}:v:{version}` | `STRING` | 1328s | Public profile sanitized payload (eviction-safe versioned) |
| **Profile** | `app:v1:profile:v:{userId}` | `STRING` | 604200s | Monotonic profile version key (O(1) bump) |
| **Queues (BullMQ)** | `bull:email-queue:{sub}` | `HASH` | Persistent (No TTL) | BullMQ internal job queue state (email-queue) |
| **Queues (BullMQ)** | `bull:notification-queue:{sub}` | `HASH` | Persistent (No TTL) | BullMQ internal job queue state (notification-queue) |
| **Socket & Presence** | `app:v1:liveroom:group:{groupId}:members` | `ZSET` | 86384s | Sorted set of active live room members and presence timestamps |
| **Socket & Presence** | `app:v1:presence:user:{userId}` | `SET` | 86384s | Live socket connection presence and active node map |

## Test Suite Execution Durations (Local Execution Breakdown)

| Suite Index | Test Suite File | Duration (s) |
| :---: | :--- | :---: |
| 1 | `src/shared/cache/__tests__/cache.test.ts` | 1.02s |
| 2 | `src/shared/cache/__tests__/mentorship-cache.test.ts` | 1.12s |
| 3 | `src/auth/__tests__/password-change.test.ts` | 7.86s |
| 4 | `src/shared/cache/__tests__/book-range-concurrency.test.ts` | 3.41s |
| 5 | `src/shared/cache/__tests__/mentor-version-eviction.test.ts` | 0.93s |
| 6 | `src/shared/cache/__tests__/pre-update-hooks.test.ts` | 4.28s |
| 7 | `src/shared/cache/__tests__/write-gap-invalidation.test.ts` | 1.86s |
| 8 | `src/shared/cache/__tests__/behavioural-e2e.test.ts` | 2.05s |
| 9 | `src/shared/cache/__tests__/token-blacklist.test.ts` | 1.58s |
| 10 | `src/shared/cache/__tests__/auth-cache.test.ts` | 0.89s |
| 11 | `src/auth/__tests__/sessionless-auth.test.ts` | 1.89s |
| 12 | `src/shared/queues/__tests__/queue.test.ts` | 0.90s |
| 13 | `src/shared/cache/__tests__/notification-cache.test.ts` | 2.08s |
| 14 | `src/shared/cache/__tests__/chat-cache.test.ts` | 2.32s |
| 15 | `src/shared/cache/__tests__/profile-cache.test.ts` | 2.09s |
| 16 | `src/shared/cache/__tests__/connection-cache.test.ts` | 1.99s |
| 17 | `src/shared/cache/__tests__/study-cache.test.ts` | 2.00s |
| 18 | `src/shared/cache/__tests__/doubt-company-comment-cache.test.ts` | 16.93s |
| 19 | `src/shared/cache/__tests__/master-cache.test.ts` | 1.72s |
| 20 | `src/shared/cache/__tests__/socket-adapter-presence.test.ts` | 4.10s |
| 21 | `src/shared/cache/__tests__/prometheus-metrics.test.ts` | 1.33s |
| 22 | `src/shared/cache/__tests__/headline-allowlist.test.ts` | 1.72s |
| 23 | `src/shared/cache/__tests__/testSafetyGuard.test.ts` | 0.39s |
| 24 | `src/shared/cache/__tests__/real-server-boot-blacklist.test.ts` | 7.36s |
| **TOTAL** | **All 24 Suites** | **71.84s** |


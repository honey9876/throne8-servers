# 🚀 Production Checklist — Mentorship & StudyGroup

> Status: Use this file to track every item before going live.
> Mark each item: ✅ Done | ⚠️ Partial | ❌ Missing

---

## 📦 MODULE 1 — MENTORSHIP

### 1. MODELS AUDIT
| File | Check |
|------|-------|
| `Mentor.ts` | Schema has required fields, indexes, timestamps? |
| `SessionMentor.ts` | Session status enum complete (scheduled/ongoing/completed/cancelled)? |
| `Availability.ts` + `TimeSlot.ts` | Timezone-aware dates? Overlap validation logic? |
| `Package.ts` + `PackageCredit.ts` | Credit deduction logic tied to sessions? |
| `MentorshipReview.ts` | Rating validation (1-5), one review per session enforced? |
| `Waitlist.ts` | Position tracking, auto-assign on cancellation? |
| `CancellationLog.ts` + `RescheduleLog.ts` | Audit trail complete? |
| `MatchScore.ts` | Score fields defined, algo output stored? |
| `Coupon.ts` | Expiry, usage limit, discount type (% vs flat)? |
| `Query.ts` | Status lifecycle (open/answered/closed)? |
| `GroupSession.ts` | Max participants cap enforced? |
| `Resume.ts` + `Portfolio.ts` | File URL storage, file size limit? |
| `AdminAction.ts` | All admin operations logged? |
| `mentorshipAnalytics.ts` | Aggregation-friendly schema? |
| `Notification.ts` | Read/unread status, type enum complete? |

---

### 2. SERVICES AUDIT
| File | Check |
|------|-------|
| `mentor.service.ts` | Profile create/update/delete/get all working? |
| `booking.service.ts` | ⚠️ **CRITICAL** — Double booking prevention? Atomic slot locking? |
| `availability.service.ts` | Recurring slots generation? DST handling? |
| `mentorshipSession.service.ts` | Session lifecycle (create→confirm→start→end)? |
| `refund.service.ts` | Refund policy matrix implemented? (cancel before 24h = full refund?) |
| `recommendation.service.ts` | Cold start problem handled? |
| `matching.service (matchingAlgorithm.ts)` | Scoring weights configurable? |
| `calendarSync.service.ts` | Google/Outlook OAuth token refresh handled? |
| `video.service.ts` | ⚠️ daily_co not configured — fallback exists? |
| `email.service.ts` | ⚠️ Email disabled in current env — fixed for prod? |
| `sms.service.ts` | Rate limiting on OTP sends? |
| `waitlist.service.ts` | FIFO order maintained? Notification on slot open? |
| `report.service.ts` | PDF generation tested? Large data pagination? |
| `portfolio.service.ts` | File upload size/type validation? |
| `resume.service.ts` | ATS scanner (`atsScanner.ts`) tested? |
| `cron.service.ts` | All cron jobs idempotent? (safe to re-run) |
| `timezone.service.ts` | All datetime ops timezone-aware? |
| `health.service.ts` | Health check returns correct dependency status? |

---

### 3. CONTROLLERS AUDIT
| File | Check |
|------|-------|
| `mentor.controller.ts` | Auth guard on all write routes? |
| `session.controller.ts` | Role check (only mentor/mentee of that session)? |
| `admin.controller.ts` | Admin-only middleware applied? |
| `package.controller.ts` | Payment verification before package activation? |
| `availability.controller.ts` | Input sanitization on date/time fields? |
| `waitlist.controller.ts` | Duplicate join prevention? |
| `query.controller.ts` | Query ownership check before edit/delete? |
| `mentorshipReview.controller.ts` | One review per session enforced at controller level? |
| `ai.controller.ts` | AI API key set? Rate limit on AI endpoints? |
| `search.controller.ts` | Elasticsearch fallback if ES down? |
| `notification.controller.ts` | Pagination on notification list? |

---

### 4. VALIDATORS AUDIT
| File | Check |
|------|-------|
| `mentor.validator.ts` | All mentor profile fields validated (bio length, skills array)? |
| `session.validator.ts` | Date/time format, min session duration validated? |
| `review.validator.ts` | Rating range, comment max length? |
| `query.validator.ts` | Query text length, category enum? |

---

### 5. UTILS AUDIT
| File | Check |
|------|-------|
| `slotGenerator.ts` | Handles DST, leap years, timezone offsets? |
| `refundCalculator.ts` | All refund scenarios covered? |
| `icsGenerator.ts` | .ics file valid for Google/Apple/Outlook calendar? |
| `pdfGenerator.ts` | Tested with large data? Memory leak check? |
| `atsScanner.ts` | Tested with real resume formats (PDF/DOCX)? |
| `securityHelper.ts` | Sensitive data (aadhaar, phone) masked in logs? |
| `elasticSerach.service.ts` | Fallback to MongoDB if ES unavailable? |
| `matchingAlgorithm.ts` | Edge cases (new mentor, no skills match)? |

---

### 6. ROUTES AUDIT
| Route File | Auth | Rate Limit | Validation |
|------------|------|------------|------------|
| `mentor.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `session.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `availability.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `package.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `search.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `review.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `waitlist.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `admin.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `ai.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |
| `analytics.routes.ts` | ✅/❌ | ✅/❌ | ✅/❌ |

---

### 7. MENTORSHIP — CRITICAL PRODUCTION ITEMS
```
❌ / ✅  Double booking prevention with Redis distributed lock
❌ / ✅  Payment gateway integrated (Razorpay/Stripe) for packages
❌ / ✅  Video call platform configured (daily.co keys in .env)
❌ / ✅  Calendar OAuth (Google/Outlook) tokens stored securely
❌ / ✅  Email service working in production environment
❌ / ✅  Refund flow end-to-end tested
❌ / ✅  Mentor onboarding flow complete (apply → review → approve)
❌ / ✅  Session reminder emails/SMS working (cron tested)
❌ / ✅  Waitlist auto-notify on cancellation working
❌ / ✅  ATS scanner tested with real files
❌ / ✅  All sensitive fields excluded from API responses
❌ / ✅  Mentor payout logic implemented (if applicable)
```

---
---

## 📚 MODULE 2 — STUDYGROUP

### 1. MODELS AUDIT
| File | Check |
|------|-------|
| `Group.model.ts` | joinCode unique, maxMembers enforced, visibility enum? |
| `GroupMember.model.ts` | Role enum (admin/moderator/member), status (active/banned/left)? |
| `Message.model.ts` | Soft delete, edited flag, reply threading? |
| `Task.model.ts` | Priority + status enums complete, assignee ref? |
| `Assignment.model.ts` | Deadline, submission link, grading fields? |
| `Attendance.model.ts` | Session ref, present/absent/late enum? |
| `Streak.model.ts` | Freeze credits, max streak, last active date? |
| `Progress.model.ts` | % calculation accurate, per-member tracking? |
| `Ranking.model.ts` | Scoring formula defined, tie-breaking rule? |
| `Badge.model.ts` | Trigger conditions defined (e.g. 7-day streak)? |
| `Goal.model.ts` | Target date, completion %, milestone steps? |
| `Doubt.model.ts` | Status (open/resolved), upvote count? |
| `LiveRoom.model.ts` | Participant list, host ref, recording URL? |
| `StudySession.model.ts` | Timer data, focus score, break intervals? |
| `Test.model.ts` | Question refs, time limit, attempts allowed? |
| `Report.model.ts` | Report type, resolution status, moderator action? |

---

### 2. SERVICES AUDIT
| File | Check |
|------|-------|
| `group.service.ts` | Create/join/leave/delete all covered? |
| `groupMember.service.ts` | Role change, ban/unban, invite system? |
| `chat.service.ts` | ⚠️ **CRITICAL** — Message pagination? Media attachments? Profanity filter? |
| `webrtc.service.ts` | ⚠️ **CRITICAL** — TURN/STUN server configured? Fallback for poor network? |
| `streak.service.ts` | Timezone-safe midnight reset? Freeze credit logic? |
| `ranking.service.ts` | Leaderboard recalculation efficient (not N+1 query)? |
| `task.service.ts` | Assignment + completion notifications? |
| `attendance.service.ts` | Auto-mark absent if no check-in? |
| `progress.service.ts` | Real-time progress update on task completion? |
| `doubt.service.ts` | AI auto-answer integration? Upvote dedup? |
| `test.service.ts` | Anti-cheat (tab switch detection)? Timer accuracy? |
| `timer.service.ts` | Pomodoro intervals configurable? Data persisted? |
| `search.service.ts` | Search across groups/members/content? |
| `notification.service.ts` | Batching to avoid spam? Quiet hours setting? |
| `share.service.ts` | Share link expiry? Preview generation? |
| `qrCode.service.ts` | QR code for group join working? |
| `backup.service.ts` | Backup frequency, storage location defined? |
| `cron.service.ts` | All cron jobs idempotent? |
| `analytics.service.ts` | Group-level + platform-level metrics? |

---

### 3. SOCKET AUDIT — CRITICAL
| File | Check |
|------|-------|
| `socket.ts` | Auth middleware applied to all socket connections? |
| `chatHandler.ts` | Room join/leave on connect/disconnect? Message ACK? |
| `liveRoomHandler.ts` | Max participants enforced? Host transfer on host leave? |
| `notificationHandler.ts` | User-room mapping for targeted notifications? |
| `presenceHandler.ts` | Online/offline/away states? Heartbeat interval? |
| `typingHandler.ts` | Debounced? Stops on disconnect? |

**Socket Production Checks:**
```
❌ / ✅  Redis adapter for Socket.IO (horizontal scaling)
❌ / ✅  Socket authentication middleware tested
❌ / ✅  Rate limiting on socket events
❌ / ✅  Max connections per user enforced
❌ / ✅  Graceful reconnection handling on client
❌ / ✅  Socket room cleanup on group delete
```

---

### 4. JOBS AUDIT
| File | Check |
|------|-------|
| `streakCheck.job.ts` | Runs at midnight per user timezone? |
| `rankingUpdate.job.ts` | Efficient batch update? Not one-by-one? |
| `attendanceReset.job.ts` | Runs after session ends? |
| `goalReminder.job.ts` | Respects user notification preferences? |
| `dataCleanup.job.ts` | Soft-deleted data cleanup schedule defined? |
| `reportGeneration.job.ts` | PDF/CSV both supported? Email delivery working? |

---

### 5. CONTROLLERS AUDIT
| File | Check |
|------|-------|
| `admin.controller.ts` | Platform admin vs group admin separated? |
| `moderation.controller.ts` | Ban, warn, remove message — all working? |
| `liveRoom.controller.ts` | Only group members can join? Host-only controls? |
| `assignment.controller.ts` | Submission deadline enforced? Late submission flag? |
| `test.controller.ts` | Start/submit/timeout all handled? |
| `dashboard.controller.ts` | Data aggregation optimized? Cached? |
| `member.controller.ts` | Invite-only vs open join respected? |
| `file.controller.ts` | File type whitelist? Size limit? Virus scan? |

---

### 6. STUDYGROUP — CRITICAL PRODUCTION ITEMS
```
❌ / ✅  TURN/STUN server configured for WebRTC (LiveRoom)
❌ / ✅  Redis adapter for Socket.IO (multi-instance support)
❌ / ✅  File upload storage configured (AWS S3 / Cloudinary)
❌ / ✅  Chat message pagination implemented
❌ / ✅  Profanity/abuse filter in chat
❌ / ✅  Streak timezone handling correct
❌ / ✅  Leaderboard caching (Redis) to avoid DB hammering
❌ / ✅  Group join code expiry/regeneration
❌ / ✅  Max members cap enforced at DB + service level
❌ / ✅  Soft delete on messages (not hard delete)
❌ / ✅  Report/moderation flow end-to-end tested
❌ / ✅  Badge award triggers automated
❌ / ✅  Data backup tested and restorable
```

---
---

## 🔒 COMMON PRODUCTION CHECKLIST (Both Modules)

### Security
```
❌ / ✅  All routes behind auth middleware
❌ / ✅  Role-based access control (RBAC) working
❌ / ✅  Input sanitization on all user inputs
❌ / ✅  SQL/NoSQL injection prevention
❌ / ✅  File upload validation (type + size + malware)
❌ / ✅  Rate limiting on all public endpoints
❌ / ✅  Sensitive data (passwords, tokens) never in logs
❌ / ✅  JWT expiry + refresh token rotation working
❌ / ✅  CORS configured for production domain only
❌ / ✅  Helmet.js headers configured
```

### Error Handling
```
❌ / ✅  All services wrapped in try/catch
❌ / ✅  Global error handler returns consistent format
❌ / ✅  No stack traces exposed in production responses
❌ / ✅  404 and 500 handlers in place
❌ / ✅  Circuit breakers tested (database, redis, external-api)
❌ / ✅  Graceful shutdown on SIGTERM/SIGINT
```

### Performance
```
❌ / ✅  Database queries have proper indexes
❌ / ✅  N+1 query problems resolved (use populate wisely)
❌ / ✅  Pagination on ALL list endpoints
❌ / ✅  Response compression enabled (gzip)
❌ / ✅  Heavy operations in queues (email, PDF, media)
❌ / ✅  Redis caching on frequently read data
❌ / ✅  Elasticsearch for search (not MongoDB regex)
```

### Logging & Monitoring
```
❌ / ✅  Request/response logging working
❌ / ✅  Error logs going to file + monitoring tool
❌ / ✅  Prometheus metrics exposed
❌ / ✅  Grafana dashboards set up
❌ / ✅  Alerts configured for error spikes
❌ / ✅  Kafka dead letter queue monitored
```

### Environment & Config
```
❌ / ✅  .env.production file ready (separate from dev)
❌ / ✅  All required env vars documented
❌ / ✅  Video platform (daily.co) keys configured
❌ / ✅  Email SMTP working in production
❌ / ✅  AWS S3 configured for file storage
❌ / ✅  Redis Cluster configured (or standalone with persistence)
❌ / ✅  MongoDB replica set in production
❌ / ✅  Kafka brokers production config set
```

### Testing Minimum Bar
```
❌ / ✅  Mentorship booking flow — happy path tested
❌ / ✅  Mentorship booking — double booking tested
❌ / ✅  Mentorship refund flow tested
❌ / ✅  StudyGroup create/join/leave tested
❌ / ✅  StudyGroup chat send/receive tested
❌ / ✅  StudyGroup LiveRoom join/leave tested
❌ / ✅  Streak increment/reset tested
❌ / ✅  Leaderboard ranking tested
❌ / ✅  Notification delivery tested (email + socket)
❌ / ✅  All cron jobs manually triggered once
```

---

## 🎯 PRIORITY ORDER — KYA PEHLE FIX KARO

### Week 1 (Blocker — bina iske live mat karo)
1. Double booking prevention (Mentorship) — Redis distributed lock
2. WebRTC TURN/STUN server setup (StudyGroup)
3. Socket.IO Redis adapter (StudyGroup scale ke liye)
4. Email service fix in production
5. Payment gateway integration (if needed for packages)
6. File upload storage (AWS S3 ya Cloudinary)

### Week 2 (Important but not blocker)
7. Streak timezone fix
8. Leaderboard Redis caching
9. Chat pagination
10. All cron jobs testing
11. Refund flow end-to-end

### Week 3 (Polish)
12. Profanity filter in chat
13. Badge automation
14. Analytics dashboards
15. Load testing

---

## 📋 .ENV REQUIRED VARIABLES CHECKLIST

```env
# Mentorship
DAILY_CO_API_KEY=                    ❌ Missing
DAILY_CO_DOMAIN=                     ❌ Missing
GOOGLE_CALENDAR_CLIENT_ID=           ❌ Check
GOOGLE_CALENDAR_CLIENT_SECRET=       ❌ Check
RAZORPAY_KEY_ID=                     ❌ Check
RAZORPAY_KEY_SECRET=                 ❌ Check

# StudyGroup  
TURN_SERVER_URL=                     ❌ Missing
TURN_SERVER_USERNAME=                ❌ Missing
TURN_SERVER_CREDENTIAL=              ❌ Missing

# Common (already in logs but verify)
REDIS_CLUSTER_NODES=                 ⚠️ Timeout issue
AWS_ACCESS_KEY_ID=                   ❌ Missing
AWS_SECRET_ACCESS_KEY=               ❌ Missing
AWS_REGION=                          ❌ Missing
AWS_S3_BUCKET=                       ❌ Missing
ELASTICSEARCH_URL=                   ❌ Check
```

---

*Last updated: May 2026 | Throne8 Platform*
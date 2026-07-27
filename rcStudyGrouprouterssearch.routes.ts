[1mdiff --git a/server/thronet-server/log.txt b/server/thronet-server/log.txt[m
[1mindex 7e38e12..57cb7b0 100644[m
Binary files a/server/thronet-server/log.txt and b/server/thronet-server/log.txt differ
[1mdiff --git a/server/thronet-server/src/StudyGroup/routers/index.ts b/server/thronet-server/src/StudyGroup/routers/index.ts[m
[1mindex a88d907..1af5b72 100644[m
[1m--- a/server/thronet-server/src/StudyGroup/routers/index.ts[m
[1m+++ b/server/thronet-server/src/StudyGroup/routers/index.ts[m
[36m@@ -322,7 +322,7 @@[m [mimport streakRoutes from './streak.routes';[m
 // ===== GROUP B (DISABLED) =====[m
 import attendanceRoutes from './attendance.routes';[m
 import rankingRoutes from './ranking.routes';[m
[31m-import leaderboardRoutes from './leaderboard.routes';[m
[32m+[m[32m// import leaderboardRoutes from './leaderboard.routes';[m
 // import notificationRoutes from './notification.routes';[m
 // import shareRoutes from './share.routes';[m
 // import moderationRoutes from './moderation.routes';[m
[36m@@ -382,7 +382,7 @@[m [mrouter.use('/doubts', doubtRoutes);[m
 // GROUP B - DISABLED[m
 router.use('/attendance', attendanceRoutes);[m
 router.use('/ranking', rankingRoutes);[m
[31m-router.use('/leaderboard', leaderboardRoutes);[m
[32m+[m[32m// router.use('/leaderboard', leaderboardRoutes);[m
 // router.use('/notifications', notificationRoutes);[m
 // router.use('/share', shareRoutes);[m
 // router.use('/moderation', moderationRoutes);[m

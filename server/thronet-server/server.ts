/**
 * /server/thronet-server/server.ts
 * Main Entry Point — HTTP server bootstrap
 */
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";

// ============================================================
// ENVIRONMENT
// ============================================================

// Always ensure both local server .env and root .env are loaded
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ============================================================
// IMPORTS
// ============================================================

import { Server } from "http";
import mongoose from "mongoose";

// App
import { app, NotificationService } from "./src/app";

// Feature flags
import { FEATURES, enabledFeatures } from "./src/config/features";

// Database
import MongoConnection from "./src/database/sharding/connection";

// Utils
import CacheUtil from "./src/shared/cache.util";
import { LoggerUtil } from "./src/shared/logger.util";

// Socket
import { initializeSocketIO } from "./src/socket";

// ============================================================
// LOGGER
// ============================================================

const logger = LoggerUtil;

// ============================================================
// TYPES
// ============================================================

interface AppLocals {
  server?: Server;
}

// ============================================================
// APPLICATION INITIALIZATION
// ============================================================

async function initializeApp(): Promise<void> {
  try {
    // ========================================================
    // STEP 1 — APPLICATION START
    // ========================================================

    logger.info("========================================");
    logger.info("Starting application initialization");
    logger.info("========================================");

    logger.info("Environment information", {
      nodeEnv: process.env["NODE_ENV"],
      nodeVersion: process.version,
      port: process.env["PORT"] || "4000",
      enabledFeatures: enabledFeatures(),
    });

    // ========================================================
    // STEP 2 — MONGODB
    // ========================================================

    logger.info("STEP 1: Starting MongoDB connection...");

    await MongoConnection.connect();

    logger.info("MongoDB connected");

    // ========================================================
    // STEP 3 — REDIS / CACHE
    // ========================================================

    logger.info("STEP 2: Starting Redis initialization...");

    try {
      // 1. Initialize primary ioredis connection pool
      const { initRedis } = await import("./src/shared/cache/redisConnection");
      const ioredisConnected = await initRedis();
      logger.info("IOREDIS CONNECTION INITIALIZED", { connected: ioredisConnected });

      // 2. Initialize redisService instance (used by Feeds, Posts, and Analytics)
      const { connectRedis } = await import("./src/services/redis.service");
      await connectRedis().catch((err: any) => {
        logger.warn("redisService connection failed", { error: err.message });
      });

      // 3. Initialize CacheUtil legacy manager
      const cacheResult = await CacheUtil.init();

      logger.info("CACHE INIT FINISHED", {
        result: cacheResult,
        status: CacheUtil.status,
      });

      if (cacheResult || ioredisConnected) {
        logger.info("Redis cache initialized successfully");

        // Item I: Warm up / rebuild leaderboards on startup from MongoDB truth (non-blocking)
        import("./src/shared/cache/studyCache").then(({ LeaderboardCacheRepository }) => {
          LeaderboardCacheRepository.rebuildAllLeaderboards().catch((err: any) => {
            logger.warn("Initial leaderboard cache rebuild failed (non-critical)", { error: err.message });
          });
        }).catch(() => {});

        // Item M: Warm up master/reference data cache without blocking startup (non-blocking)
        import("./src/shared/cache/masterCache").then(({ MasterDataCacheRepository }) => {
          MasterDataCacheRepository.warmUp().catch((err: any) => {
            logger.warn("Initial master data cache warm-up failed (non-critical)", { error: err.message });
          });
        }).catch(() => {});
      } else {
        logger.warn(
          "Redis cache initialization returned false. Using in-memory fallback.",
        );
      }
    } catch (err: any) {
      logger.error("CACHE INIT ERROR", {
        error: err?.message || "Unknown Redis error",
        stack: err?.stack,
      });

      logger.warn(
        "Cache initialization failed, continuing with in-memory fallback",
      );
    }

    // ========================================================
    // STEP 4 — MUTUAL CONNECTIONS SERVICE (only if connections on)
    // ========================================================

    if (FEATURES.connections) {
      logger.info("STEP 3: Starting Mutual Connections Service...");

      try {
        const { mutualService } =
          await import("./src/connections/services/mutual.service");

        await mutualService.initialize();

        logger.info("Mutual connections service initialized");
      } catch (err: any) {
        logger.warn("Mutual service initialization failed, using mock mode", {
          error: err?.message || "Unknown mutual service error",
          stack: err?.stack,
        });
      }
    } else {
      logger.info("STEP 3: Mutual Connections Service skipped (connections disabled)");
    }

    // ========================================================
    // STEP 5 — NOTIFICATION SERVICE
    // ========================================================

    logger.info("STEP 4: Starting Notification Service...");

    try {
      const notificationInitialized = await NotificationService.initialize();

      if (notificationInitialized) {
        logger.info("Notification service initialized");
      } else {
        logger.warn(
          "Notification service initialization failed (non-critical)",
        );
      }
    } catch (error: any) {
      logger.warn("Notification service initialization failed (non-critical)", {
        error:
          error instanceof Error ? error.message : "Unknown notification error",

        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // ========================================================
    // STEP 5.5 — SCHEDULED JOBS (mentorship crons)
    // ========================================================

    logger.info("STEP 4.5: Starting scheduled jobs...");

    try {
      const { default: ReminderCron } = await import("./src/jobs/reminderCron");
      ReminderCron.init();
      logger.info("Session reminder cron initialized");

      // Sirf explicit testing ke liye. Production me ye env set mat karna.
      if (process.env["RUN_REMINDER_ON_BOOT"] === "true") {
        ReminderCron.triggerManually().catch((err: unknown) =>
          logger.error("Manual reminder trigger failed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } catch (error: any) {
      logger.error(
        "Session reminder cron failed to initialize (non-critical)",
        {
          error: error instanceof Error ? error.message : "Unknown cron error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
    }

    try {
      const { default: waitlistCron } = await import("./src/jobs/waitlistCron");
      waitlistCron.init();
      logger.info("Waitlist cron initialized");
    } catch (error: any) {
      logger.error("Waitlist cron failed to initialize (non-critical)", {
        error:
          error instanceof Error
            ? error.message
            : "Unknown waitlist cron error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // ========================================================
    // STEP 6 — HTTP SERVER
    // ========================================================

    logger.info("STEP 5: Starting HTTP server...");

    const port: number = Number(process.env["PORT"]) || 4000;

    const server = app.listen(port, () => {
      logger.info("========================================");
      logger.info("Server started successfully");
      logger.info("========================================");

      logger.info("Server information", {
        port,
        environment: process.env["NODE_ENV"],
        version: process.env["APP_VERSION"] || "1.0.0",
      });

      // ====================================================
      // SOCKET.IO
      // ====================================================

      try {
        logger.info("Starting Socket.IO initialization...");

        initializeSocketIO(server);

        logger.info("Socket.IO initialized");
      } catch (error: any) {
        logger.error("Socket.IO initialization failed", {
          error:
            error instanceof Error ? error.message : "Unknown Socket.IO error",

          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      logger.error("HTTP server emitted an error event", {
        code: err?.code,
        message: err?.message,
      });
    });

    // ========================================================
    // SAVE SERVER INSTANCE
    // ========================================================

    (app.locals as AppLocals).server = server;

    logger.info("Application initialization complete");

    logger.info("========================================");
    logger.info("APPLICATION READY");
    logger.info("========================================");
  } catch (error: any) {
    logger.error("Application initialization failed", {
      error:
        error instanceof Error ? error.message : "Unknown initialization error",

      stack: error instanceof Error ? error.stack : undefined,
    });

    process.exit(1);
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown...`);

  try {
    const locals = app.locals as AppLocals;

    if (locals.server) {
      logger.info("Closing HTTP server...");

      await new Promise<void>((resolve) => {
        locals.server!.close(() => {
          resolve();
        });
      });

      logger.info("HTTP server closed");
    }

    try {
      logger.info("Closing MongoDB connection...");

      await mongoose.connection.close();

      logger.info("MongoDB disconnected");
    } catch (error: any) {
      logger.warn("MongoDB shutdown failed", {
        error: error?.message,
      });
    }

    try {
      logger.info("Closing Redis connection...");

      await CacheUtil.shutdown();

      logger.info("Cache shutdown complete");
    } catch (err: any) {
      logger.warn("Cache shutdown failed", {
        error: err?.message,
      });
    }

    logger.info("Graceful shutdown complete");

    process.exit(0);
  } catch (error: any) {
    logger.error("Error during graceful shutdown", {
      error: error instanceof Error ? error.message : "Unknown shutdown error",

      stack: error instanceof Error ? error.stack : undefined,
    });

    process.exit(1);
  }
}

// ============================================================
// PROCESS SIGNAL HANDLERS
// ============================================================

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

// ============================================================
// UNHANDLED PROMISE REJECTION
// ============================================================

process.on("unhandledRejection", (reason: unknown) => {
  const errorMessage = (reason as any)?.message || String(reason);

  const errorStack = (reason as any)?.stack;

  if (errorMessage.includes("schemas/ids")) {
    logger.warn("Schema validation error ignored (OpenTelemetry)");
    return;
  }

  logger.error("Unhandled promise rejection", {
    reason: errorMessage,
    stack: errorStack,
  });
});

// ============================================================
// UNCAUGHT EXCEPTION
// ============================================================

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception in server file", {
    error: error.message,
    stack: error.stack,
  });

  const criticalErrors = ["EADDRINUSE", "MODULE_NOT_FOUND"];

  const isCritical = criticalErrors.some((criticalError) =>
    error.message.includes(criticalError),
  );

  if (isCritical) {
    gracefulShutdown("UNCAUGHT_EXCEPTION");
  }
});

// ============================================================
// START APPLICATION
// ============================================================

logger.info("BOOTSTRAP: Calling initializeApp()");

initializeApp();
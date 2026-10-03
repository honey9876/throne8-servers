import cron from 'node-cron';
import { LoggerUtil as logger } from '@/shared/logger.util';
import PymkNotificationState from '@/notifications/models/PymkNotificationState.model';
// NOTE: getSuggestionCards is intentionally NOT imported statically here.
// network.service.ts imports connection.service.ts which is also imported by
// connections/routes/index.ts (our caller), creating a circular dependency that
// causes this module to resolve as `undefined` at startup. The dynamic import
// below breaks the cycle by deferring resolution until runBatch() is called,
// by which point all modules are fully initialized.
import NotificationService from '@/notifications/services/notification.service';
import { FilterQuery, Types } from 'mongoose';
import User, { IUser } from '@/auth/models/User.model'; // check IUser is actually exported here

const PER_CALL_TIMEOUT_MS = 15000;
const BATCH_MAX_RUNTIME_MS = 5 * 60 * 1000;

interface StopSignal {
  stopped: boolean;
}

/**
 * Races a promise against a timeout WITHOUT leaving the loser running silently.
 * The underlying promise still resolves/rejects eventually, but callers only need
 * to handle the timeout branch as a normal error, and it's clearly labeled per call.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

class PymkSuggestionCron {
  private static isRunning = false;
  private static initialized = false;

  static init(): void {
    // Guard against duplicate registration if init() is ever called more than
    // once (e.g. loadRoutes() re-invoked by a module reload / restart).
    if (this.initialized) {
      logger.warn('PymkSuggestionCron.init() called more than once — ignoring duplicate registration');
      return;
    }
    this.initialized = true;
    // Run weekly on Monday at 10:00 AM IST
    cron.schedule('0 10 * * 1', async () => {
      if (this.isRunning) {
        logger.warn('PYMK cron skipped — previous run still in progress');
        return;
      }
      this.isRunning = true;

      // Cooperative cancellation: instead of racing runBatch() against a timeout
      // (which leaves the loser running unobserved in the background), we hand
      // runBatch() a stop signal it checks at each safe checkpoint. This means
      // the 5-minute ceiling actually stops real work instead of just declaring
      // the tick "over" while the batch keeps running detached underneath it.
      const stopSignal: StopSignal = { stopped: false };
      const watchdog = setTimeout(() => {
        stopSignal.stopped = true;
        logger.error('PYMK batch exceeded max runtime (5m) — signaling batch to stop at next checkpoint');
      }, BATCH_MAX_RUNTIME_MS);

      try {
        logger.info('Running PYMK suggestion cron job');
        await this.runBatch(stopSignal);
        logger.info('PYMK suggestion cron job completed');
      } catch (error) {
        logger.error('Error in PYMK suggestion cron job', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      } finally {
        clearTimeout(watchdog);
        this.isRunning = false;
      }
    }, { timezone: 'Asia/Kolkata' });
  }

  private static async runBatch(stopSignal: StopSignal): Promise<void> {
    // Lazy import once (breaks circular dependency with connections/routes/index.ts)
    const { getSuggestionCards } = await import('@/connections/services/network.service');

    let lastId: Types.ObjectId | null = null;
    const batchSize = 100;
    let processedCount = 0;
    let notifiedCount = 0;

   while (!stopSignal.stopped) {
  const query: FilterQuery<IUser> = lastId ? { _id: { $gt: lastId } } : {};

  const users: Array<Pick<IUser, '_id' | 'userId'>> = await User.find(query)
    .sort({ _id: 1 })
    .limit(batchSize)
    .select('_id userId')
    .maxTimeMS(PER_CALL_TIMEOUT_MS)
    .lean();

  if (!users || users.length === 0) {
    break;
  }
  // ...

      for (const user of users) {
        if (stopSignal.stopped) break;

        try {
          const state = await PymkNotificationState.findOne({ userId: user.userId })
            .maxTimeMS(PER_CALL_TIMEOUT_MS)
            .lean();

          // If notified within the last 7 days, skip
          if (state?.lastNotifiedAt) {
            const daysSinceLast = (Date.now() - state.lastNotifiedAt.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLast < 7) {
              continue;
            }
          }

        
          // Fetch top 10 suggestions
          const suggestions = await withTimeout(
            getSuggestionCards(user.userId, 10),
            PER_CALL_TIMEOUT_MS,
            'getSuggestionCards'
          );
          if (!suggestions || suggestions.length === 0) continue;

          const notifiedSet = new Set(state?.notifiedSuggestionIds || []);
          const newSuggestions = suggestions.filter((s: any) => !notifiedSet.has(s.id));

          // Minimum threshold: 3 new suggestions (intentional — prevents weekly spam)
          if (newSuggestions.length >= 3) {
            await withTimeout(
              NotificationService.notifyPymk(user.userId, newSuggestions),
              PER_CALL_TIMEOUT_MS,
              'NotificationService.notifyPymk'
            );

            const newIds = newSuggestions.map((s: any) => s.id);

            // Update state with cap/trim strategy ($slice: -100)
            await withTimeout(
              PymkNotificationState.findOneAndUpdate(
                { userId: user.userId },
                {
                  $set: { lastNotifiedAt: new Date() },
                  $push: {
                    notifiedSuggestionIds: {
                      $each: newIds,
                      $slice: -100
                    }
                  }
                },
                { upsert: true }
              ),
              PER_CALL_TIMEOUT_MS,
              'PymkNotificationState.findOneAndUpdate'
            );

            notifiedCount++;
          }
        } catch (err) {
          logger.error('PYMK cron failed for user', {
            userId: user.userId,
            error: err instanceof Error ? err.message : 'unknown',
          });
          // Continue to next user
        }
      }

      processedCount += users.length;
      lastId = users[users.length - 1]._id;

      // Small delay between batches to avoid spikes
      await new Promise(r => setTimeout(r, 100));
    }

    if (stopSignal.stopped) {
      logger.warn('PYMK cron batch stopped early — exceeded max runtime', { processedCount, notifiedCount });
    } else {
      logger.info('PYMK cron batch completed', { processedCount, notifiedCount });
    }
  }
}

export default PymkSuggestionCron;
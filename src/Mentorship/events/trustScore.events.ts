import { EventEmitter } from 'events';
import { TrustScoreService } from '../services/trustScore.service';
import LoggerUtil from '@/shared/logger.util';

class TrustScoreEventEmitter extends EventEmitter {
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_DELAY_MS = 30000; // 30 seconds debounce

  constructor() {
    super();
    this.setupListeners();
  }

  private setupListeners(): void {
    const triggerRecalculation = (mentorId: string, eventName: string) => {
      LoggerUtil.info(`[TrustScoreEvents] Received event: ${eventName} for mentor: ${mentorId}`);
      this.debounceRecalculate(mentorId);
    };

    // Review Events
    this.on('ReviewCreated', (payload) => triggerRecalculation(payload.mentorId, 'ReviewCreated'));
    this.on('ReviewUpdated', (payload) => triggerRecalculation(payload.mentorId, 'ReviewUpdated'));
    this.on('ReviewDeleted', (payload) => triggerRecalculation(payload.mentorId, 'ReviewDeleted'));

    // Session Events
    this.on('SessionCompleted', (payload) => triggerRecalculation(payload.mentorId, 'SessionCompleted'));
    this.on('SessionCancelled', (payload) => triggerRecalculation(payload.mentorId, 'SessionCancelled'));
    
    // Group Session Events
    this.on('GroupSessionCompleted', (payload) => triggerRecalculation(payload.mentorId, 'GroupSessionCompleted'));
    this.on('GroupSessionCancelled', (payload) => triggerRecalculation(payload.mentorId, 'GroupSessionCancelled'));

    // Profile Events
    this.on('ProfileUpdated', (payload) => triggerRecalculation(payload.mentorId, 'ProfileUpdated'));
    this.on('VerificationUpdated', (payload) => triggerRecalculation(payload.mentorId, 'VerificationUpdated'));
  }

  private debounceRecalculate(mentorId: string): void {
    if (this.debounceMap.has(mentorId)) {
      clearTimeout(this.debounceMap.get(mentorId)!);
    }

    const timeout = setTimeout(async () => {
      this.debounceMap.delete(mentorId);
      try {
        await TrustScoreService.recalculate(mentorId);
      } catch (error) {
        LoggerUtil.error(`[TrustScoreEvents] Failed to recalculate score for mentor ${mentorId}`, {
          error: (error as Error).message,
        });
      }
    }, this.DEBOUNCE_DELAY_MS);

    this.debounceMap.set(mentorId, timeout);
  }
}

export const TrustScoreEvents = new TrustScoreEventEmitter();

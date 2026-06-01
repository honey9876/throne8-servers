/**
 * user.emitter.ts
 * Professional-level event emitter for user events in auth-service-phase3-kafka
 * Emits user events to Kafka and local listeners
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module events/emitters/user.emitter
 * @version 3.0.0
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import LoggerUtil from '@/shared/logger.util';
import UserProducer from '@/shared/kafka/producers/user.producer';
import { EVENT_TYPES, UserEventType } from '@/shared/events/types/event.types';
import NotificationService from '@/auth/services/notification.service';

// ==================== INTERFACES ====================

interface UserEvent {
    eventId: string;
    userId: string;
    action: string;
    eventType: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'USER_DEACTIVATED';
    ipAddress: string;
    timestamp: string;
    metadata: Record<string, any>;
}

interface UserEventMetadata {
    [key: string]: any;
}

// ==================== USER EMITTER CLASS ====================

class UserEmitter extends EventEmitter {
    private producer: typeof UserProducer;

    constructor() {
        super();
        this.setupWelcomeNotificationListener();
        this.producer = UserProducer;
    }

    /**
     * Emit user event to local listeners and Kafka
     * 
     * @param userId - User ID
     * @param action - Action type (must be from EVENT_TYPES.USER)
     * @param ipAddress - IP address of the request
     * @param metadata - Additional event metadata
     * @throws Error if event type is invalid or Kafka send fails
     */
    async emitUserEvent(
        userId: string,
        action: string,
        ipAddress: string,
        metadata: UserEventMetadata = {}
    ): Promise<void> {
        const event: UserEvent = {
            eventId: uuidv4(),
            userId,
            action,
            eventType: action as 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'USER_DEACTIVATED',
            ipAddress,
            timestamp: new Date().toISOString(),
            metadata,
        };

        try {
            // Validate event
            if (!EVENT_TYPES.USER.includes(action as UserEventType)) {
                throw new Error(`Invalid user event type: ${action}`);
            }

            // Emit locally
            this.emit(action, event);
            LoggerUtil.info('User event emitted locally', {
                eventId: event.eventId,
                action
            });

            // Send to Kafka
            await this.producer.connect();
            await this.producer.sendUserEvent(event);
            LoggerUtil.info('User event sent to Kafka', {
                eventId: event.eventId,
                action
            });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to emit user event', {
                error: (error as Error).message,
                event
            });
            throw error;
        } finally {
            await this.producer.disconnect().catch((err: Error) =>
                LoggerUtil.error('Producer disconnect failed', {
                    error: err.message
                })
            );
        }
    }

    /**
     * Register event listener
     * 
     * @param event - Event name
     * @param listener - Event listener function
     */
    onUserEvent(event: string, listener: (data: UserEvent) => void): this {
        return this.on(event, listener);
    }

    /**
     * Register one-time event listener
     * 
     * @param event - Event name
     * @param listener - Event listener function
     */
    onceUserEvent(event: string, listener: (data: UserEvent) => void): this {
        return this.once(event, listener);
    }

    /**
     * Remove event listener
     * 
     * @param event - Event name
     * @param listener - Event listener function
     */
    offUserEvent(event: string, listener: (data: UserEvent) => void): this {
        return this.off(event, listener);
    }

    /**
     * Remove all listeners for an event
     * 
     * @param event - Event name (optional)
     */
    removeAllUserListeners(event?: string): this {
        return this.removeAllListeners(event);
    }

    /**
     * Get listener count for an event
     * 
     * @param event - Event name
     * @returns Number of listeners
     */
    getUserEventListenerCount(event: string): number {
        return this.listenerCount(event);
    }

    /**
 * Welcome email listener — fires after user:registered event
 */
    private setupWelcomeNotificationListener(): void {
        this.on('user:registered', async (data: any) => {
            try {
                LoggerUtil.info('user:registered event received, sending welcome email', {
                    userId: data.userId,
                    email: data.email,
                });

                await NotificationService.sendWelcomeEmail({
                    email: data.email,
                    firstName: data.firstName || 'User',
                    lastName: data.lastName,
                    location: data.location,
                    userType: data.userType,
                });
            } catch (error: any) {
                // Non-blocking
                LoggerUtil.error('Welcome notification failed (non-critical)', {
                    error: error.message,
                    userId: data.userId,
                });
            }
        });

        LoggerUtil.info('Welcome notification listener registered');
    }
}

// ==================== SINGLETON EXPORT ====================

export default new UserEmitter();

export { UserEmitter, UserEvent, UserEventMetadata };
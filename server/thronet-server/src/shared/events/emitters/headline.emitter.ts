/**
 * headline.emitter.ts
 * Production-level event emitter for headline events
 * Emits headline events to local listeners
 * 
 * @module events/emitters/headline.emitter
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { LoggerUtil } from '@/shared/logger.util';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

interface HeadlineEvent {
    headlineId: string;
    timestamp: Date;
    [key: string]: any;
}

// ==================== HEADLINE EMITTER CLASS ====================

class HeadlineEmitter extends EventEmitter {
    constructor() {
        super();
        this.setupEventListeners();
    }

    /**
     * Setup default event listeners
     */
    private setupEventListeners(): void {
        // Log all headline events
        this.on('headline:created', (data: HeadlineEvent) => {
            logger.info('Headline created event', {
                headlineId: data.headlineId,
                type: data.type,
                timestamp: data.timestamp,
            });
        });

        this.on('headline:updated', (data: HeadlineEvent) => {
            logger.info('Headline updated event', {
                headlineId: data.headlineId,
                timestamp: data.timestamp,
            });
        });

        this.on('headline:deleted', (data: HeadlineEvent) => {
            logger.info('Headline deleted event', {
                headlineId: data.headlineId,
                deletedBy: data.deletedBy,
                timestamp: data.timestamp,
            });
        });

        this.on('headline:published', (data: HeadlineEvent) => {
            logger.info('Headline published event', {
                headlineId: data.headlineId,
                timestamp: data.timestamp,
            });
        });

        this.on('headline:expired', (data: HeadlineEvent) => {
            logger.info('Headline expired event', {
                headlineId: data.headlineId,
                timestamp: data.timestamp,
            });
        });
    }

    /**
     * Register event listener
     */
    onHeadlineEvent(event: string, listener: (data: HeadlineEvent) => void): this {
        return this.on(event, listener);
    }

    /**
     * Register one-time event listener
     */
    onceHeadlineEvent(event: string, listener: (data: HeadlineEvent) => void): this {
        return this.once(event, listener);
    }

    /**
     * Remove event listener
     */
    offHeadlineEvent(event: string, listener: (data: HeadlineEvent) => void): this {
        return this.off(event, listener);
    }

    /**
     * Remove all listeners for an event
     */
    removeAllHeadlineListeners(event?: string): this {
        return this.removeAllListeners(event);
    }

    /**
     * Get listener count for an event
     */
    getHeadlineEventListenerCount(event: string): number {
        return this.listenerCount(event);
    }
}

// ==================== SINGLETON EXPORT ====================

export default new HeadlineEmitter();

export { HeadlineEmitter, HeadlineEvent };
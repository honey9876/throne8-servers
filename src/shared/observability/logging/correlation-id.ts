/**
 * correlation-id.ts
 * Professional-level correlation ID management for auth-service-phase3-kafka
 * Generates and tracks request correlation IDs
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

const correlationIdStorage = new AsyncLocalStorage<string>();

function generateCorrelationId(): string {
    return uuidv4();
}

function getCorrelationId(): string {
    return correlationIdStorage.getStore() || 'unknown';
}

function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
    correlationIdStorage.run(correlationId, () => {
        res.setHeader('X-Correlation-Id', correlationId);
        next();
    });
}

export { generateCorrelationId, getCorrelationId, correlationIdMiddleware };
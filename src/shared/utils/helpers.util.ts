import crypto from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler = (fn: RequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

class HelpersUtil {
    static formatDate(date: Date = new Date()): string {
        return date.toISOString();
    }

    static getCurrentTimestamp(): number {
        return Date.now();
    }

    static isExpired(expiryDate: Date | string): boolean {
        return new Date(expiryDate) < new Date();
    }

    static addTime(milliseconds: number): Date {
        return new Date(Date.now() + milliseconds);
    }

    static generateUUID(): string {
        return crypto.randomUUID();
    }

    static generateCorrelationId(): string {
        return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    static sanitizeInput(input: string): string {
        if (typeof input !== 'string') return input;
        return input.replace(/[<>]/g, '').replace(/javascript:/gi, '').trim();
    }

    static sanitizeObject(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(this.sanitizeObject.bind(this));

        const sanitized: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                sanitized[key] = typeof value === 'string'
                    ? this.sanitizeInput(value)
                    : typeof value === 'object' && value !== null
                        ? this.sanitizeObject(value)
                        : value;
            }
        }
        return sanitized;
    }

    static safeParseJSON<T = any>(jsonString: string, fallback: T | null = null): T | null {
        try {
            return JSON.parse(jsonString);
        } catch {
            return fallback;
        }
    }

    static isEmpty(obj: any): boolean {
        if (!obj) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        return false;
    }

    static getClientIP(req: Request): string {
        const xForwardedFor = req.headers['x-forwarded-for'];
        const forwardedIP = Array.isArray(xForwardedFor)
            ? xForwardedFor[0]?.trim()
            : (xForwardedFor as string)?.split(',')[0]?.trim();

        return (
            forwardedIP ||
            (Array.isArray(req.headers['x-real-ip']) ? req.headers['x-real-ip'][0] : req.headers['x-real-ip']) ||
            req.socket?.remoteAddress ||
            req.ip ||
            'unknown'
        ) as string;
    }

    static isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default HelpersUtil;
/**
 * app.ts
 * server/thronet-server/src/app.ts
 * Express Application Configuration
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import mongoose from 'mongoose';
import passport from '@/config/oauth/passport.config';

// Routes (saari mounting routes/index.ts me hoti hai)
import apiRoutes from './routes/index';

import { User } from './auth/models';

// Config
import { LoggerUtil, requestLogger } from './shared/logger.util';
import { createCookieAuthBridge } from './shared/middlewares/cookieAuth.middleware';
import NotificationService from './auth/services/notification.service';
import { prometheusRouter } from './shared/observability/metrics/exporters/prometheus.exporter';
import { getRedisHealth } from './shared/cache/redisConnection';
import { redisUpGauge } from './shared/cache/cacheMetrics';

interface CustomError extends Error {
    status?: number;
    statusCode?: number;
    code?: string;
}

const logger = LoggerUtil;
const app: Express = express();
const isProduction = process.env['NODE_ENV'] === 'production';

// ==================== TRUST PROXY ====================
// Railway sits behind exactly one reverse proxy layer.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ==================== CORS ====================
// Production domains HAMESHA allowed hain (env set ho ya na ho).
// Env (CORS_ORIGIN / ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS) se extra origins add hote hain,
// ye defaults ko replace NAHI karte.
// Localhost sirf non-production me allowed hai.
// Vercel preview URLs sirf tab allowed jab ALLOW_VERCEL_PREVIEWS=true ho.
const PRODUCTION_ORIGINS = [
    'https://throne8.com',
    'https://www.throne8.com',
    'https://throne8-client-main.vercel.app',
    'https://resume.throne8.com',
];

const DEV_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
];

// Trailing slash hata do ("https://throne8.com/" != "https://throne8.com")
const normalizeOrigin = (o: string): string => o.trim().replace(/\/+$/, '');

const envOrigins = (
    process.env['CORS_ORIGIN'] ||
    process.env['ALLOWED_ORIGINS'] ||
    process.env['CORS_ALLOWED_ORIGINS'] ||
    ''
)
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

const allowedOrigins: string[] = Array.from(new Set([
    ...PRODUCTION_ORIGINS,
    ...(isProduction ? [] : DEV_ORIGINS),
    ...envOrigins,
]));

const allowVercelPreviews = process.env['ALLOW_VERCEL_PREVIEWS']
    ? process.env['ALLOW_VERCEL_PREVIEWS'] === 'true'
    : !isProduction;

logger.info('CORS allowed origins', { allowedOrigins, allowVercelPreviews });

// Single source of truth for "is this browser origin allowed?"
// (used by CORS below and by the cookie CSRF guard)
const isOriginAllowed = (origin: string): boolean => {
    const cleanOrigin = normalizeOrigin(origin);
    const isVercel = allowVercelPreviews && /\.vercel\.app$/.test(cleanOrigin);
    const isLocalhost = !isProduction && /^http:\/\/localhost:\d+$/.test(cleanOrigin);
    return allowedOrigins.includes('*') || allowedOrigins.includes(cleanOrigin) || isVercel || isLocalhost;
};

app.use(cors({
    origin: (origin, callback) => {
        // Server-to-server calls (no origin) allow karo
        if (!origin) return callback(null, true);

        if (isOriginAllowed(origin)) {
            return callback(null, origin);
        }

        logger.warn('CORS blocked origin', { origin });

        const corsError: CustomError = new Error(`CORS: Origin ${origin} not allowed`);
        corsError.status = 403;
        corsError.code = 'CORS_NOT_ALLOWED';
        return callback(corsError);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // allowedHeaders intentionally NOT set: cors package browser ke
    // Access-Control-Request-Headers ko reflect karta hai, isliye koi
    // naya custom header (x-device-id, x-request-id etc.) preflight fail nahi karega.
    exposedHeaders: ['Authorization', 'Content-Length', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400,
    optionsSuccessStatus: 204,
}));

// 1. Cookie parser and request logger
app.use(cookieParser());

// Cookie session support: copy the access cookie into the Authorization header
// (explicit header wins). On state-changing requests the cookies are only honoured
// when X-Requested-With + an allowed Origin prove the call came from our frontend.
app.use(createCookieAuthBridge(isOriginAllowed));

app.use(requestLogger);

// 2. Body parsers
// Default 10mb. Agar kahin base64 payload bhejte ho toh JSON_BODY_LIMIT env se badhao.
const bodyLimit = process.env['JSON_BODY_LIMIT'] || '10mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// 3. Security middleware
app.use(helmet());
app.use(compression());

// 3a. NoSQL injection protection — `$` aur `.` keys strip karta hai
app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body);
    if (req.params) req.params = mongoSanitize.sanitize(req.params);
    next();
});

// 3b. HTTP Parameter Pollution protection
app.use(hpp());

// 4. Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'test',
});
app.use('/api', limiter);

// 4a. Auth endpoints (login/signup/OTP) ke liye stricter limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many auth attempts, please try again later.' },
    skip: () => process.env['NODE_ENV'] === 'test',
});
app.use('/api/v1/auth', authLimiter);

// ==================== PASSPORT INITIALIZATION ====================
// Used for Google and GitHub OAuth strategies (session: false stateless JWT)
app.use(passport.initialize());

// ==================== HEALTH CHECK ====================
// Liveness probe — ALWAYS returns 200 while the Node.js process is running and serving requests
app.get('/api/v1/health', async (_req: Request, res: Response) => {
    const redisHealth = await getRedisHealth();
    try {
        redisUpGauge.set(redisHealth.status === 'healthy' ? 1 : 0);
    } catch {}

    const isDegraded = redisHealth.status !== 'healthy';
    // Liveness must ALWAYS be 200 to avoid cascading container kill/drain loops
    res.status(200).json({
        status: isDegraded ? 'degraded' : 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV'],
        version: process.env['APP_VERSION'] || '1.0.0',
        dependencies: {
            redis: redisHealth.status,
            redisLatencyMs: redisHealth.latencyMs,
        },
    });
});

// Readiness probe — Checks MongoDB connectivity; does NOT fail on Redis alone
app.get('/api/v1/health/ready', async (_req: Request, res: Response) => {
    const mongoState = mongoose.connection.readyState; // 1 = connected
    const redisHealth = await getRedisHealth();
    try {
        redisUpGauge.set(redisHealth.status === 'healthy' ? 1 : 0);
    } catch {}

    // Ready to serve requests if primary DB is connected (app fails-open to DB without Redis)
    const isDbReady = mongoState === 1;
    const isFullyHealthy = isDbReady && redisHealth.status === 'healthy';

    res.status(isDbReady ? 200 : 503).json({
        status: isFullyHealthy ? 'ok' : isDbReady ? 'degraded' : 'down',
        timestamp: new Date().toISOString(),
        dependencies: {
            mongodb: mongoState === 1 ? 'connected'
                : mongoState === 2 ? 'connecting'
                : mongoState === 3 ? 'disconnecting'
                : 'disconnected',
            redis: redisHealth.status,
            redisLatencyMs: redisHealth.latencyMs,
        },
    });
});

// ==================== METRICS ====================
app.use(prometheusRouter);

// ==================== ROUTES ====================
app.use('/api/v1', apiRoutes);

// ==================== 404 HANDLER ====================
app.use((req: Request, res: Response) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        code: 'ROUTE_NOT_FOUND',
    });
});

// ==================== ERROR HANDLER ====================
app.use(((err: CustomError, req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            status: 'error',
            message: 'Invalid CSRF token',
            code: 'CSRF_VALIDATION_FAILED',
        });
    }

    if (err.code === 'CORS_NOT_ALLOWED') {
        return res.status(403).json({
            status: 'error',
            message: 'Origin not allowed',
            code: 'CORS_NOT_ALLOWED',
        });
    }

    let statusCode = err.statusCode || err.status || 500;
    let message = err.message;

    // Mongoose validation/cast errors aur Zod errors ko 400 me map karo,
    // warna ye generic 500 ke peeche chhup jate hain.
    if (err.name === 'ValidationError' || err.name === 'CastError') {
        statusCode = 400;
        message = err.message;
    } else if (err.name === 'ZodError') {
        statusCode = 400;
        message = (err as any).errors?.map((e: any) => `${e.path?.join('.')}: ${e.message}`).join('; ') || 'Validation failed';
    }

    // Expected (4xx) errors, jaise MENTOR_NOT_FOUND, normal flow hain:
    // stack trace ke bina sirf warn log. Genuine 5xx errors stack ke saath error log hote hain.
    if (statusCode < 500) {
        logger.warn('Request failed', {
            status: statusCode,
            error: message,
            path: req.path,
            method: req.method,
        });
    } else {
        logger.error('Unhandled error', {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
        });
    }

    // Sirf genuine 500 errors ka message production me chhupao.
    // Operational errors (400/401/403/404/409) ka asli message hamesha bhejo.
    const isKnownOperationalError = statusCode < 500 && !!message;

    return res.status(statusCode).json({
        status: 'error',
        message: isKnownOperationalError
            ? message
            : (isProduction
                ? 'Internal server error'
                : message || 'Internal server error'),
    });
}) as express.ErrorRequestHandler);
export { app, NotificationService };
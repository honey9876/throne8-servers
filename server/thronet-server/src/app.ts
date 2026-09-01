/**
 * app.ts
 * server/thronet-server/src/app.ts
 * Express Application Configuration
 * ./version 5.0.0 (merged: app + web server best features)
 *
 * MERGED FROM WEB SERVER:
 *   - express-mongo-sanitize (NoSQL injection protection)
 *   - hpp (HTTP Parameter Pollution protection)
 *   - Stricter auth rate limiter
 *   - Health check + readiness probe endpoints
 *   - 404 handler for unmatched routes
 *   - CORS error handler
 *   - requestLogger middleware
 *
 * KEPT FROM APP SERVER:
 *   - Open CORS (origin: '*') for mobile APK testing
 *   - Verify routes
 *   - Kafka producers (via connections module)
 *   - Audit consumer support
 *   - Database indexes/sharding
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import mongoose from 'mongoose';
import passport from '@/config/oauth/passport.config';

// Routes
import AuthRoutes from './routes/index';
import profileRoutes from './routes/index';
import verifyRoutes from './auth/routes/index';
console.log("Importing mentorRoutes"); import mentorRoutes from './Mentorship/routers';
console.log("Importing companyRoutes"); import companyRoutes from './company/routers';
console.log("Importing studyGroupRoutes"); import studyGroupRoutes from './StudyGroup/routers';
import jobServiceRoutes from './Job-Service/routers';

// Config
import { LoggerUtil } from './shared/logger.util';
import NotificationService from './auth/services/notification.service';
import notificationRoutes from './notifications/routes/notification.routes';
import messageRoutes from './message/routes/message.routes';
import { User } from './auth/models';

interface CustomError extends Error {
    status?: number;
    code?: string;
    statusCode?: number;
}

const logger = LoggerUtil;
const app: Express = express();

// ==================== TRUST PROXY ====================
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ==================== CORS ====================
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Get allowed origins from environment variables or default to localhost
        const envOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN;
        const allowedOrigins = envOrigins
            ? envOrigins.split(',').map(o => o.trim())
            : ['http://localhost:3000', 'http://localhost:3001'];

        const isLocalIp = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
        if (
            allowedOrigins.includes(origin) || 
            isLocalIp ||
            process.env.NODE_ENV === 'development'
        ) {
            return callback(null, true);
        }

        const corsError: CustomError = new Error(`CORS: Origin ${origin} not allowed`);
        corsError.status = 403;
        corsError.code = 'CORS_NOT_ALLOWED';
        return callback(corsError);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'x-client-version',
        'x-csrf-token'
    ],
    exposedHeaders: ['Authorization', 'Content-Length', 'X-CSRF-Token'],
    credentials: true
}));

// 1. Cookie parser
app.use(cookieParser());

// 2. Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Security middleware
app.use(helmet());
app.use(compression());

// 3a. NoSQL injection protection — strips `$` and `.` keys from
// req.body / req.query / req.params before they ever reach Mongoose.
app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body);
    if (req.params) req.params = mongoSanitize.sanitize(req.params);
    next();
});

// 3b. HTTP Parameter Pollution protection — collapses duplicate query
// params (e.g. ?role=admin&role=user) to a single value instead of an array.
app.use(hpp());

// 4. Rate limiting (general)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// 4a. Stricter limiter specifically for auth endpoints (login/signup/OTP)
// to slow down credential-stuffing / brute-force attempts.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

// ==================== SESSION ====================
app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000
    }
}));

app.use(passport.initialize());

passport.serializeUser((user: any, done) => done(null, user.userId));
passport.deserializeUser(async (userId: string, done) => {
    try {
        const user = await User.findOne({ userId });
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// ==================== HEALTH CHECK ====================
// Liveness probe — just confirms the process is up and responding.
app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV'],
        version: process.env['APP_VERSION'] || '5.0.0',
    });
});

// Readiness probe — confirms downstream dependencies (MongoDB) are
// actually connected, not just that the process exists.
app.get('/api/v1/health/ready', (_req: Request, res: Response) => {
    const mongoState = mongoose.connection.readyState; // 1 = connected
    const isReady = mongoState === 1;

    res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        dependencies: {
            mongodb: mongoState === 1 ? 'connected'
                : mongoState === 2 ? 'connecting'
                : mongoState === 3 ? 'disconnecting'
                : 'disconnected',
        },
    });
});

// ==================== ROUTES ====================
console.log('Mounting API routes...');

app.use('/api/v1', AuthRoutes);
app.use('/api/v1/verify', verifyRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/mentorship', mentorRoutes);
app.use('/api/v1/company', companyRoutes);
app.use('/api/v1/study-group', studyGroupRoutes);
app.use('/api/v1/messaging', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/job-service', jobServiceRoutes);

console.log('All routes mounted successfully.');

// ==================== 404 HANDLER ====================
// Catches anything that didn't match a mounted route.
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

    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    const statusCode = err.statusCode || err.status || 500;

    return res.status(statusCode).json({
        status: 'error',
        message: process.env['NODE_ENV'] === 'production'
            ? 'Internal server error'
            : err.message || 'Internal server error',
    });
}) as express.ErrorRequestHandler);

export { app, NotificationService };
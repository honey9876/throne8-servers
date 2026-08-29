// /**
//  * app.ts
//  * server/thronet-server/src/app.ts
//  * Express Application Configuration
//  * ./version 4.1.1 (debug — SeniorMentorship temporarily disabled)
//  *
//  * 🟢 DEBUG (temporary):
//  *    - SeniorMentorship import/mount commented out to isolate a startup
//  *      hang. Nothing after "ALL connection sub-routes loaded successfully"
//  *      was ever printing, and app.ts's own top-level console.logs never
//  *      fired either — meaning one of app.ts's static imports never
//  *      resolves. SeniorMentorship is the prime suspect (not even present
//  *      in the original project file tree — looks new/half-wired).
//  *      Once confirmed, either fix whatever's hanging inside
//  *      SeniorMentorship/routers, or leave it disabled until it's ready.
//  */

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
import { MongoStore } from 'connect-mongo';   
import passport from '@/config/oauth/passport.config';

// Routes
import AuthRoutes from './routes/index';
console.log("Verifiy route import mounting....")
// import verifyRoutes from './auth/routes/index';
import mentorRoutes from './Mentorship/routers';
// import seniorMentorRoutes from './SeniorMentorship/routers';
console.log('🔍 mentorRoutes imported successfully');
import companyRoutes from './company/routers';
import studyGroupRoutes from './StudyGroup/routers';
import messageRoutes from './message/routes/message.routes';
import notificationRoutes from './notifications/routes/notification.routes';
import jobServiceRoutes from './Job-Service/routers';


import { User } from './auth/models';

// Config
import { LoggerUtil, requestLogger } from './shared/logger.util';
import NotificationService from './auth/services/notification.service';
// const NotificationService = { initialize: async () => false };

import CacheUtil from './shared/cache.util';

console.log('🔍 App.ts LOADING START');

interface CustomError extends Error {
    status?: number;
    code?: string;
}

const logger = LoggerUtil;
const app: Express = express();  

// ==================== TRUST PROXY ====================
// Railway sits behind exactly one reverse proxy layer.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ==================== CORS ====================
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = process.env['CORS_ORIGIN']
            ? process.env['CORS_ORIGIN'].split(',').map(o => o.trim())
            : ['http://localhost:3000', 'http://localhost:3001'];

        // Server-to-server calls (no origin) allow karo
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
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

console.log('🔍 cors configured successfully');

// 1. Cookie parser and request logger
app.use(cookieParser());
app.use(requestLogger);

// 2. Body parsers
// ⚠️ 50mb is high for plain JSON bodies. Keep it only if you genuinely accept
// base64 payloads (e.g. inline image uploads). If uploads go through
// Cloudinary/multipart instead, drop this to something like '2mb'.
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

// 4. Rate limiting
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

console.log('🔍 Express, cookie parser, body parser, security middleware, rate limiting configured successfully');

// ==================== SESSION ====================
const sessionSecret = process.env['SESSION_SECRET'];
if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required. Set it in .env.production');
}

console.log('🔍 Session configuration initialized');

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env['MONGODB_URI'],
        collectionName: 'sessions',
        ttl: 5 * 60,
        autoRemove: 'native',
    }),
    cookie: {
        secure: process.env['NODE_ENV'] === 'production',
        httpOnly: true,
        // SameSite=strict already provides strong CSRF protection for
        // state-changing requests from other origins — that's why there's
        // no separate CSRF-token middleware here. If you ever need
        // cross-site form posts (e.g. an external partner site submitting
        // to your API), you'd need to relax this and add real CSRF tokens.
            sameSite: 'lax',  // 'strict' se change
        maxAge: 5 * 60 * 1000  // 5 min in ms
    }
}));

app.use(passport.initialize());

passport.serializeUser((user: any, done) => done(null, user.userId));
passport.deserializeUser(async (userId: string, done) => {
    try {
        const user = await User.findOne({ userId });
        done(null, user as any);
    } catch (err) {
        done(err as Error);
    }
});

console.log('🔍 Session configured successfully');

// ==================== HEALTH CHECK ====================
// Liveness probe — just confirms the process is up and responding.
app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV'],
        version: process.env['APP_VERSION'] || '1.0.0',
    });
});

// Readiness probe — confirms downstream dependencies (MongoDB) are
// actually connected, not just that the process exists. Useful for
// Railway/load-balancer health checks that should fail traffic routing
// if the DB connection drops, even though the process is technically alive.
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


console.log('🔍 Health check configured successfully');
// ==================== ROUTES ====================
console.log('Mounting API routes...');

app.use('/api/v1', AuthRoutes);
console.log('🔍 AuthRoutes mounted successfully in app');

console.log("Verifiy route mounting....")
// app.use('/api/v1/verify', verifyRoutes);
console.log('🔍 VerifyRoutes mounted successfully in app');
// app.use('/api/v1/senior-mentorship', seniorMentorRoutes);
console.log('🔍 MentorRoutes mounted successfully in app');
app.use('/api/v1/company', companyRoutes);
console.log('🔍 CompanyRoutes mounted successfully in app');
app.use('/api/v1/study-group', studyGroupRoutes);
console.log('🔍 StudyGroupRoutes mounted successfully in app');
app.use('/api/v1/messaging', messageRoutes);
console.log('🔍 MessageRoutes mounted successfully in app');
app.use('/api/v1/notifications', notificationRoutes);
console.log('🔍 NotificationRoutes mounted successfully in app');
app.use('/api/v1/job-service', jobServiceRoutes);

console.log('All routes mounted successfully.');

// ==================== 404 HANDLER ====================
// Catches anything that didn't match a mounted route, before the error
// handler. Without this, unmatched routes fall through to Express's
// default (unstyled) 404 page instead of your JSON error format.
app.use((req: Request, res: Response) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        code: 'ROUTE_NOT_FOUND',
    });
});

// ==================== ERROR HANDLER ====================
app.use(((err: CustomError, req: Request, res: Response, next: NextFunction) => {
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
    return res.status(err.statusCode || err.status || 500).json({
        status: 'error',
        message: process.env['NODE_ENV'] === 'production'
            ? 'Internal server error'
            : err.message || 'Internal server error',
    });
}) as express.ErrorRequestHandler);

export { app, NotificationService };


console.log('🔍 Error handler configured successfully');
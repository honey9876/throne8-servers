/**
 * app.ts
 * server/thronet-server/src/app.ts
 * Express Application Configuration
 * ./version 4.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from '@/config/oauth/passport.config';

// Routes
import AuthRoutes from './routes/index';
import profileRoutes from './routes/index';
import verifyRoutes from './auth/routes/index';
import mentorRoutes from './Mentorship/routers';
import companyRoutes from './company/routers';
import studyGroupRoutes from './StudyGroup/routers';
// import jobServiceRoutes from './Job-Service/routers';

// Config
import { LoggerUtil } from './shared/logger.util';
import NotificationService from './auth/services/notification.service';
import notificationRoutes from './notifications/routes/notification.routes';
import messageRoutes from './message/routes/message.routes';
import { User } from './auth/models';

interface CustomError extends Error {
    status?: number;
    code?: string;
}

const logger = LoggerUtil;
const app: Express = express();

// ==================== TRUST PROXY ====================
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ==================== CORS ====================
app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
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


// Cors in Production ke liye dynamic origin handling
// app.use(cors({
//     origin: (origin, callback) => {
//         // Allowed origins env se ya default dev origins
//         const allowedOrigins = process.env['CORS_ORIGIN']
//             ? process.env['CORS_ORIGIN'].split(',').map(o => o.trim())
//             : ['http://localhost:3000', 'http://localhost:3001'];

//         // Server-to-server calls (no origin) allow karo
//         if (!origin) return callback(null, true);

//         if (allowedOrigins.includes(origin)) {
//             return callback(null, true);
//         }
//         return callback(new Error(`CORS: Origin ${origin} not allowed`));
//     },
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: [
//         'Content-Type',
//         'Authorization',
//         'X-Requested-With',
//         'Accept',
//         'x-client-version',
//         'x-csrf-token'
//     ],
//     exposedHeaders: ['Authorization', 'Content-Length', 'X-CSRF-Token'],
//     credentials: true
// }));

// 1. Cookie parser
app.use(cookieParser());

// 2. Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Security middleware
app.use(helmet());
app.use(compression());

// 4. Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// ==================== SESSION ====================
app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
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
// app.use('/api/v1/job-service', jobServiceRoutes);

// ==================== ERROR HANDLER ====================
app.use(((err: CustomError & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            status: 'error',
            message: 'Invalid CSRF token',
            code: 'CSRF_VALIDATION_FAILED',
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
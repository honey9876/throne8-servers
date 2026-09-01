import mongoose, { Schema, Document, Model } from 'mongoose';
import validator from 'validator';
import { LoggerUtil } from '@/shared/logger.util';
import UserProfile from './UserProfile.model';
// import userEmitter from '../events/emitters/user.emitter';

const logger = LoggerUtil;

export interface IDevice {
    type?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
}

export interface ILocation {
    country?: string;
    city?: string;
    timezone?: string;
}

export interface IAuditLog extends Document {
    userId?: string;
    userEmail?: string;
    userName?: string;
    action: string;
    resourceType?: 'USER' | 'PROFILE' | 'SESSION' | 'MFA' | 'REFRESH_TOKEN';
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    device?: IDevice;
    location?: ILocation;
    status: 'SUCCESS' | 'FAILURE' | 'WARNING' | 'FAILED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    suspicious: boolean;
    sessionId?: string;
    metadata?: Map<string, any>;
    retentionDate: Date;
    timestamp: Date;
}

export interface IAuditLogModel extends Model<IAuditLog> {
    logAction(data: Partial<IAuditLog>): Promise<IAuditLog>;
    getRecentActivity(userId: string, options?: { limit?: number }): Promise<IAuditLog[]>;
    getSuspiciousActivity(options?: { timeframeHours?: number; limit?: number }): Promise<IAuditLog[]>;
}

const auditLogSchema = new Schema<IAuditLog, IAuditLogModel>(
    {
        userId: {
            type: String,
            required: false,
            index: true,
        },
        userEmail: String,
        userName: String,
        action: {
            type: String,
            required: true,
            enum: [
                'USER_LOGIN',
                'USER_LOGOUT',
                'USER_UPDATE',
                'USER_REGISTERED',
                'REGISTRATION_FAILED',
                'REGISTRATION_SUCCESS',
                'LOGIN_FAILED',
                'LOGIN_SUCCESS',
                'LOGIN_ATTEMPT_BLOCKED',
                'LOGOUT_SUCCESS',
                'AUTH_ERROR',
                'PASSWORD_CHANGE',
                'PASSWORD_RESET_REQUEST',
                'TWO_FACTOR_ENABLED',
                'TWO_FACTOR_DISABLED',
                'ACCOUNT_LOCKED',
                'FAILED_LOGIN_ATTEMPT',
                'SUSPICIOUS_ACTIVITY',
                'TOKEN_REFRESH_FAILED',
                'TOKEN_REFRESH_SUCCESS',
                'DEVICE_REGISTERED',
                'DEVICE_REVOKED',
                'API_KEY_CREATED',
                'API_KEY_REVOKED',
                'GET_HEALTH',
                'SETTINGS_CHANGE',
                'VALIDATION_ERROR',
                'VALIDATION_FAILED',
                'EMAIL_VERIFICATION_LINK_SENT',
                'EMAIL_VERIFICATION_LINK_FAILED',
                'EMAIL_VERIFICATION_OTP_SENT',
                'EMAIL_VERIFICATION_OTP_FAILED',
                'EMAIL_VERIFIED',
                'EMAIL_VERIFICATION_FAILED',
                'EMAIL_RESEND_REQUESTED',
                'EMAIL_RESEND_FAILED',
                'PHONE_OTP_SENT',
                'PHONE_OTP_SEND_FAILED',
                'PHONE_OTP_VERIFIED',
                'PHONE_OTP_VERIFY_FAILED',
                'PHONE_OTP_RESEND',
                'REFRESH_TOKEN_CREATED',
                'REFRESH_TOKEN_REVOKED',
                'ALL_REFRESH_TOKENS_REVOKED',
            ],
            index: true,
        },
        resourceType: {
            type: String,
            enum: ['USER', 'PROFILE', 'SESSION', 'MFA', 'REFRESH_TOKEN'],
        },
        resourceId: String,
        ipAddress: {
            type: String,
            required: false,
            validate: [validator.isIP, 'Invalid IP address'],
        },
        userAgent: String,
        device: {
            type: { type: String, enum: ['desktop', 'mobile', 'tablet'] },
            browser: String,
            os: String,
        },
        location: {
            country: String,
            city: String,
            timezone: String,
        },
        status: {
            type: String,
            enum: ['SUCCESS', 'FAILURE', 'WARNING', 'FAILED'],
            required: true,
        },
        severity: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH'],
            default: 'LOW',
            index: true,
        },
        suspicious: {
            type: Boolean,
            default: false,
        },
        sessionId: String,
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },
        retentionDate: {
            type: Date,
            index: { expireAfterSeconds: 0 },
        },
    },
    {
        timestamps: { createdAt: 'timestamp' },
        collection: 'audit_logs',
        shardKey: { userId: 'hashed' },
    }
);

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, severity: 1 });

auditLogSchema.statics.logAction = async function (data: Partial<IAuditLog>): Promise<IAuditLog> {
    try {
        if (data.userId) {
            try {
                const profile = await UserProfile.findByUserIdCached(data.userId);
                if (profile) {
                    data.userEmail = data.userEmail || profile.contact?.email;
                    data.userName = data.userName || profile.displayName;
                }
            } catch (profileError) {
                logger.warn('UserProfile fetch failed in audit log (non-critical)', {
                    error: (profileError as Error).message,
                    userId: data.userId,
                });
            }
        }

        const retentionDays: Record<string, number> = {
            SUSPICIOUS_ACTIVITY: 730,
            FAILED_LOGIN_ATTEMPT: 365,
            PASSWORD_CHANGE: 365,
            EMAIL_VERIFICATION_LINK_SENT: 90,
            EMAIL_VERIFICATION_OTP_SENT: 90,
            EMAIL_VERIFIED: 365,
        };

        data.retentionDate = new Date(Date.now() + (retentionDays[data.action!] || 90) * 24 * 60 * 60 * 1000);

        const log = new this(data);
        await log.save();

        if (data.action === 'FAILED_LOGIN_ATTEMPT') {
            const recentFailures = await this.countDocuments({
                userId: data.userId,
                action: 'FAILED_LOGIN_ATTEMPT',
                timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
            });

            if (recentFailures >= 5) {
                log.suspicious = true;
                log.severity = 'HIGH';
                await log.save();

                // userEmitter.emit('audit:suspicious', {
                //     userId: data.userId,
                //     action: data.action,
                //     logId: log._id,
                //     timestamp: new Date(),
                // });
            }
        }

        if (log.severity === 'HIGH') {
            // userEmitter.emit('audit:high_severity', {
            //     logId: log._id,
            //     userId: data.userId,
            //     action: data.action,
            //     timestamp: new Date(),
            // });
        }

        return log;
    } catch(error : any) {
        logger.error('Audit log creation failed', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            action: data.action,
            userId: data.userId,
        });
        throw error;
    }
};

// auditLogSchema.statics.getRecentActivity = async function (userId: string, { limit = 50 }: { limit?: number } = {}): Promise<IAuditLog[]> {
//     try {
//         const logs = await this.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean();
//         return logs;
//     } catch(error : any) {
//         logger.error('Recent activity retrieval failed', { error: (error as Error).message });
//         throw error;
//     }
// };

// auditLogSchema.statics.getSuspiciousActivity = async function ({
//     timeframeHours = 24,
//     limit = 100,
// }: {
//     timeframeHours?: number;
//     limit?: number;
// } = {}): Promise<IAuditLog[]> {
//     try {
//         const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
//         await this.find({
//             $or: [{ suspicious: true }, { severity: 'HIGH' }],
//             timestamp: { $gte: since },
//         })
//             .sort({ timestamp: -1 })
//             .limit(limit)
//             .lean();
        
//     } catch(error : any) {
//         logger.error('Suspicious activity retrieval failed', { error: (error as Error).message });
//         throw error;
//     }
// };

const AuditLog = mongoose.model<IAuditLog, IAuditLogModel>('AuditLog', auditLogSchema);
export default AuditLog;
import jwt, { SignOptions } from 'jsonwebtoken';

interface JWTPayload {
    userId: string;
    email?: string;
    sessionId: string;
    deviceId?: string;
    role?: string;
    type: string;
}

interface TokenResult {
    valid: boolean;
    decoded?: any;
    userId?: string;
    email?: string;
    sessionId?: string;
    deviceId?: string;
    role?: string;
    error?: string;
    errorType?: string;
}

interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
}

class JWTUtil {
    static generateAccessToken(payload: Partial<JWTPayload>): string {
        const { userId, email, sessionId, deviceId, role = 'user' } = payload;

        if (!userId || !sessionId) {
            throw new Error('userId and sessionId are required');
        }

        const options: SignOptions = {
            expiresIn: '15m',
            issuer: 'auth-service',
            audience: 'api-gateway',
            algorithm: 'HS256',
        };

        return jwt.sign(
            { userId, email, sessionId, deviceId, role, type: 'access', iat: Math.floor(Date.now() / 1000) },
            process.env.JWT_SECRET!,
            options
        );
    }

    static generateRefreshToken(payload: Partial<JWTPayload>): string {
        const { userId, sessionId, deviceId } = payload;

        if (!userId || !sessionId || !deviceId) {
            throw new Error('userId, sessionId, and deviceId are required');
        }

        const options: SignOptions = {
            expiresIn: '7d',
            issuer: 'auth-service',
            audience: 'auth-service',
            algorithm: 'HS256',
        };

        return jwt.sign(
            { userId, sessionId, deviceId, type: 'refresh', iat: Math.floor(Date.now() / 1000) },
            process.env.JWT_REFRESH_SECRET!,
            options
        );
    }

    static verifyAccessToken(token: string): TokenResult {
        try {
            if (!token) throw new Error('Access token is required');

            const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
                issuer: 'auth-service',
                audience: 'api-gateway',
                algorithms: ['HS256'],
            }) as JWTPayload;

            if (decoded.type !== 'access') throw new Error('Invalid token type');

            return {
                valid: true,
                decoded,
                userId: decoded.userId,
                email: decoded.email,
                sessionId: decoded.sessionId,
                deviceId: decoded.deviceId,
                role: decoded.role,
            };
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Token expired', errorType: 'EXPIRED' };
            }
            if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'Invalid token', errorType: 'INVALID' };
            }
            return { valid: false, error: error.message, errorType: 'VERIFICATION_FAILED' };
        }
    }

    static verifyRefreshToken(token: string): TokenResult {
        try {
            if (!token) throw new Error('Refresh token is required');

            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!, {
                issuer: 'auth-service',
                audience: 'auth-service',
                algorithms: ['HS256'],
            }) as JWTPayload;

            if (decoded.type !== 'refresh') throw new Error('Invalid token type');

            return {
                valid: true,
                decoded,
                userId: decoded.userId,
                sessionId: decoded.sessionId,
                deviceId: decoded.deviceId,
            };
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Refresh token expired', errorType: 'EXPIRED' };
            }
            return { valid: false, error: error.message, errorType: 'VERIFICATION_FAILED' };
        }
    }

    static refreshTokens(payload: Partial<JWTPayload>): TokenPair {
        const { userId, email, sessionId, deviceId, role } = payload;

        if (!userId || !sessionId || !deviceId) {
            throw new Error('userId, sessionId, and deviceId are required');
        }

        return {
            accessToken: this.generateAccessToken({ userId, email, sessionId, deviceId, role }),
            refreshToken: this.generateRefreshToken({ userId, sessionId, deviceId }),
            expiresIn: 900,
            tokenType: 'Bearer',
        };
    }

    static decodeToken(token: string): any {
        return jwt.decode(token, { complete: true });
    }
}

export default JWTUtil;
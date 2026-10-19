import { getAccessTokenFromCookieHeader } from '@/shared/utils/authCookies.util';
import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger, { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';

import User from '@/auth/models/User.model';


interface DecodedToken {
    userId: string;
    email: string;
    role: string;
}

export const socketAuthMiddleware = async (socket: Socket, next: (err?: any) => void) => {
    try {
        // ✅ Extract token from handshake auth or query
        // (falls back to the httpOnly access cookie sent with the handshake)
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
            getAccessTokenFromCookieHeader(socket.handshake.headers?.cookie);

        if (!token) {
            return next(new ErrorResponse('Authentication token required', HttpStatus.UNAUTHORIZED));
        }

        let decoded: DecodedToken;
        try {
            decoded = User.verifyToken(token, 'access') as DecodedToken;
        } catch (jwtError: any) {
            logger.warn('Socket auth: JWT verification failed', {
                category: LogCategory.AUTH,
                data: { error: jwtError.message },
            });
            return next(new ErrorResponse('Invalid or expired token', HttpStatus.UNAUTHORIZED));
        }

        // ✅ Attach user info to socket
        socket.data.userId = decoded.userId;
        socket.data.email = decoded.email;
        socket.data.role = decoded.role;

        logger.debug('Socket authenticated', {
            category: LogCategory.AUTH,
            data: {
                socketId: socket.id,
                userId: decoded.userId,
            },
        });

        next();
    } catch (error: any) {
        logger.error('Socket authentication failed', {
            category: LogCategory.AUTH,
            data: { error: error instanceof Error ? error.message : 'Unknown error' },
        });

        next(new ErrorResponse('Invalid or expired token', HttpStatus.UNAUTHORIZED));
    }
};
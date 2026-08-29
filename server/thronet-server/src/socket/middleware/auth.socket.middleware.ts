import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger, { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';

//////////////////////changed
import User from '@/auth/models/User.model';


interface DecodedToken {
    userId: string;
    email: string;
    role: string;
}

export const socketAuthMiddleware = async (socket: Socket, next: (err?: any) => void) => {
    try {
        // ✅ Extract token from handshake auth or query
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '');

        console.log('🔍 [Socket Auth] Received token:', token?.substring(0, 20) + '...');
        console.log('🔍 [Socket Auth] Auth object:', socket.handshake.auth);
        console.log('🔍 [Socket Auth] Headers:', socket.handshake.headers?.authorization);
        console.log("jwt token aaya =>>>>>>>>>>>", environmentConfig.JWT_SECRET)

        if (!token) {
            return next(new ErrorResponse('Authentication token required', HttpStatus.UNAUTHORIZED));
        }

        // ✅ ADD DETAILED ERROR LOGGING
        let decoded: DecodedToken;
        try {
            /////////////////////changed
             decoded = User.verifyToken(token, 'access') as DecodedToken;

            console.log("jwt token aaya =>>>>>>>>>>>", environmentConfig.JWT_SECRET)
            console.log('✅ [Socket Auth] Token decoded:', decoded); // ✅ ADD
        } catch (jwtError: any) {
            console.error('❌ [Socket Auth] JWT verification failed:', jwtError.message); // ✅ ADD
            console.error('❌ [Socket Auth] JWT Secret:', environmentConfig.JWT_SECRET?.substring(0, 10) + '...'); // ✅ ADD
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
    } catch (error : any) {
        logger.error('Socket authentication failed', {
            category: LogCategory.AUTH,
            data: { error: error instanceof Error ? error.message : 'Unknown error' },
        });

        next(new ErrorResponse('Invalid or expired token', HttpStatus.UNAUTHORIZED));
    }
};
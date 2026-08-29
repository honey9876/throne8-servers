import { Server, Socket } from 'socket.io';
import logger, { LogCategory } from '@/shared/logger.util';
import { AuthenticatedSocket } from '../index';

export const setupConnectionHandlers = (io: Server, socket: AuthenticatedSocket) => {
    const userId = socket.data.userId || socket.userId;
    console.log('🔍 [DEBUG] Setting up handlers for userId:', userId); // ✅ ADD


    if (!userId) {
        console.error('❌ [Socket] No userId found, cannot join room');
        return;
    }

    // ✅ Join user's personal room
    socket.join(`user:${userId}`);
    console.log(`✅ [Socket] User ${userId} joined room: user:${userId}`);

    // Company room join karne ke liye (admin use karega)
    socket.on('join:company', (companyId: string) => {
        socket.join(`company:${companyId}`);
        logger.info('Admin joined company room', {
            category: LogCategory.CONNECTION,
            data: { userId, companyId }
        });
    });

    socket.on('leave:company', (companyId: string) => {
        socket.leave(`company:${companyId}`);
    });

    // ✅ Listen for connection request events (optional)
    socket.on('connection:request:sent', (data) => {
        logger.debug('Connection request sent event', {
            category: LogCategory.CONNECTION,
            data: { from: userId, to: data.toUserId },
        });
    });

    // ✅ Listen for typing indicators (optional future feature)
    socket.on('connection:typing', (data) => {
        socket.to(`user:${data.toUserId}`).emit('connection:typing', {
            fromUserId: userId,
            isTyping: data.isTyping,
        });
    });
};

// ✅ Emit connection request to receiver
export const emitConnectionRequest = (
    io: Server,
    toUserId: string,
    payload: {
        requestId: string;
        fromUserId: string;
        fromUserName: string;
        fromUserPhoto?: string;
        message?: string;
        timestamp: string;
    }
) => {
    console.log('🔍 [DEBUG] Emitting to room:', `user:${toUserId}`); // ✅ ADD
    console.log('🔍 [DEBUG] Payload:', payload); // ✅ ADD
    io.to(`user:${toUserId}`).emit('connection:request:received', payload);

    logger.info('Connection request emitted', {
        category: LogCategory.CONNECTION,
        data: { toUserId, requestId: payload.requestId },
    });
};

// ✅ Emit connection accepted notification
export const emitConnectionAccepted = (
    io: Server,
    toUserId: string,
    payload: {
        connectionId: string;
        acceptedByUserId: string;
        acceptedByUserName: string;
        acceptedByUserPhoto?: string;
        timestamp: string;
    }
) => {
    io.to(`user:${toUserId}`).emit('connection:request:accepted', payload);

    logger.info('Connection accepted emitted', {
        category: LogCategory.CONNECTION,
        data: { toUserId, connectionId: payload.connectionId },
    });
};

// ✅ Emit connection declined notification
export const emitConnectionDeclined = (
    io: Server,
    toUserId: string,
    payload: {
        requestId: string;
        declinedByUserId: string;
        timestamp: string;
    }
) => {
    io.to(`user:${toUserId}`).emit('connection:request:declined', payload);

    logger.info('Connection declined emitted', {
        category: LogCategory.CONNECTION,
        data: { toUserId, requestId: payload.requestId },
    });
};

// Company admin apni company ka room join kare
export const emitCompanyAnalyticsUpdate = (
    io: Server,
    companyObjectId: string,
    data: Record<string, unknown>
) => {
    io.to(`company:${companyObjectId}`).emit('analytics:update', {
        ...data,
        timestamp: new Date()
    });

    logger.info('Analytics update emitted', {
        category: LogCategory.CONNECTION,
        data: { companyObjectId }
    });
};
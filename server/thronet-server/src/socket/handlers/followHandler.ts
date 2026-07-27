import { Server } from 'socket.io';
import logger, { LogCategory } from '@/shared/logger.util';

// ✅ Emit "new follower" event to the user who got followed
export const emitFollowReceived = (
    io: Server,
    toUserId: string,
    payload: {
        followerId: string;
        followerName?: string;
        followerPhoto?: string;
        timestamp: string;
    }
) => {
    io.to(`user:${toUserId}`).emit('follow:received', payload);

    logger.info('Follow received event emitted', {
        category: LogCategory.CONNECTION,
        data: { toUserId, followerId: payload.followerId },
    });
};

// ✅ Emit "unfollowed" event to the user who lost a follower
export const emitUnfollowReceived = (
    io: Server,
    toUserId: string,
    payload: {
        followerId: string;
        timestamp: string;
    }
) => {
    io.to(`user:${toUserId}`).emit('follow:removed', payload);

    logger.info('Unfollow event emitted', {
        category: LogCategory.CONNECTION,
        data: { toUserId, followerId: payload.followerId },
    });
};
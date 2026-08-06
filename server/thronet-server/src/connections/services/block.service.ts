// thronet-server/src/connections/services/block.service.ts
import ConnectionBlock, { BlockReason } from '../models/ConnectionBlock';
import { LoggerUtil } from '@/shared/logger.util';

class BlockService {
    static async blockUser(blockerId: string, blockedId: string, reason: BlockReason = BlockReason.OTHER, customReason?: string) {
        if (blockerId === blockedId) {
            throw new Error('Cannot block yourself');
        }

        const already = await ConnectionBlock.isBlocked(blockerId, blockedId);
        if (already) {
            throw new Error('User already blocked');
        }

        const block = new ConnectionBlock({
            blockerId,
            blockedId,
            reason,
            customReason,
            isActive: true,
        });
        await block.save();

        LoggerUtil.info('User blocked', { blockerId, blockedId, reason });

        return { blockId: block._id, blockedAt: block.blockedAt };
    }

    static async unblockUser(blockerId: string, blockedId: string) {
        const block = await ConnectionBlock.findOne({ blockerId, blockedId, isActive: true });
        if (!block) {
            throw new Error('Block not found');
        }
        await block.unblock();

        LoggerUtil.info('User unblocked', { blockerId, blockedId });

        return { blockId: block._id, unblockedAt: block.unblockedAt };
    }

    static async isUserBlocked(currentUserId: string, userId: string) {
        const [isBlockedByCurrentUser, isBlockingCurrentUser] = await Promise.all([
            ConnectionBlock.isBlocked(currentUserId, userId),
            ConnectionBlock.isBlocked(userId, currentUserId),
        ]);

        return {
            isBlocked: isBlockedByCurrentUser || isBlockingCurrentUser,
            isBlockedByCurrentUser,
            isBlockingCurrentUser,
            canInteract: !isBlockedByCurrentUser && !isBlockingCurrentUser,
        };
    }

    static async getBlockedUsers(blockerId: string) {
        const blocks = await ConnectionBlock.find({ blockerId, isActive: true })
            .sort({ blockedAt: -1 })
            .lean();
        return blocks;
    }
}

export default BlockService;
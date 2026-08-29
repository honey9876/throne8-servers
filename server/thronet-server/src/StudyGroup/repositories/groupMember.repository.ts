import mongoose from 'mongoose';
import GroupMember from '../models/GroupMember.model';
import { IGroupMember, MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import Group from '../models/Group.model';
import { logger } from '@/shared/logger.util';

class GroupMemberRepository {

    async create(data: any, session?: mongoose.ClientSession): Promise<IGroupMember> {
        const members = await GroupMember.create([data], { session });
        return members[0].toObject();
    }

    async findOne(groupId: string, userId: string): Promise<IGroupMember | null> {
        return await GroupMember.findOne({ groupId, userId }).lean();
    }

    async findActiveOne(groupId: string, userId: string): Promise<IGroupMember | null> {
        return await GroupMember.findOne({
            groupId,
            userId,
            status: MemberStatus.ACTIVE
        }).lean();
    }

    async findByGroupId(groupId: string): Promise<IGroupMember[]> {
    // logger.info('findByGroupId called with:', groupId); // ← ADD
    const result = await GroupMember.find({ groupId, status: MemberStatus.ACTIVE })
        .sort({ joinedAt: 1 })
        .lean();
    logger.info('findByGroupId result:', result); // ← ADD
    return result;
}

    // async findByUserId(userId: string): Promise<IGroupMember[]> {
    //     return await GroupMember.find({ userId, status: MemberStatus.ACTIVE })
    //         .populate({
    //             path: 'groupId',
    //             match: { isActive: true },
    //             populate: { path: 'leaderId', select: 'name email avatar' }
    //         })
    //         .lean();
    // }

    async findByUserId(userId: string): Promise<IGroupMember[]> {
        // Pehle memberships lo
        const memberships = await GroupMember.find({
            userId,
            status: MemberStatus.ACTIVE
        }).lean();

        // Phir groupIds se groups fetch karo
        const groupIds = memberships.map(m => m.groupId);
        const groups = await Group.find({
            groupId: { $in: groupIds },
            isActive: true
        }).lean();

        // Merge karo
        return memberships.map(m => ({
            ...m,
            groupId: groups.find(g => g.groupId === m.groupId) || m.groupId
        })) as any;
    }

    async updateStatus(
        groupId: string,
        userId: string,
        status: MemberStatus
    ): Promise<IGroupMember | null> {
        const member = await GroupMember.findOneAndUpdate(
            { groupId, userId },
            { $set: { status, ...(status === MemberStatus.ACTIVE && { joinedAt: new Date() }) } },
            { new: true }
        );
        if (!member) return null;
        return member.toObject();
    }

    async deleteById(id: string, session?: mongoose.ClientSession): Promise<boolean> {
        const result = await GroupMember.findByIdAndDelete(id, { session });
        return !!result;
    }

    async updateMany(
        filter: any,
        updates: any,
        session?: mongoose.ClientSession
    ): Promise<void> {
        await GroupMember.updateMany(filter, updates, { session });
    }

    // groupMember.repository.ts mein add karo

    async countByGroupId(groupId: string): Promise<number> {
        return await GroupMember.countDocuments({ groupId, status: MemberStatus.ACTIVE });
    }


    async reactivate(groupId: string, userId: string): Promise<IGroupMember | null> {
        const member = await GroupMember.findOneAndUpdate(
            { groupId, userId },
            { $set: { status: MemberStatus.ACTIVE, joinedAt: new Date(), lastActive: new Date() } },
            { new: true }
        );
        if (!member) return null;
        return member.toObject();
    }

    async findModeratorsByGroupId(groupId: string): Promise<IGroupMember[]> {
        return await GroupMember.find({
            groupId,
            role: { $in: [MemberRole.LEADER, MemberRole.ADMIN] },
            status: MemberStatus.ACTIVE,
        }).lean();
    }

    async countByUserId(userId: string): Promise<number> {
        return await GroupMember.countDocuments({ userId, status: MemberStatus.ACTIVE });
    }

    async countActiveTodayByGroupId(groupId: string, since: Date): Promise<number> {
        return await GroupMember.countDocuments({
            groupId,
            status: MemberStatus.ACTIVE,
            lastActive: { $gte: since },
        });
    }

}

export default new GroupMemberRepository();
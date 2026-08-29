console.log('🟢 STEP-4: liveRoom.repository.ts file STARTED loading');
import { BaseRepository } from './base.repository';
import LiveRoom from '../models/LiveRoom.model';
import { ILiveRoomDocument } from '../interfaces/ILiveRoom';
import { Types } from 'mongoose';

class LiveRoomRepository extends BaseRepository<ILiveRoomDocument> {
  constructor() {
    super(LiveRoom);
  }

  async findRawById(roomId: string): Promise<ILiveRoomDocument | null> {
    return await this.model.findById(roomId).exec();
  }

  async findByIdWithPopulate(roomId: string): Promise<ILiveRoomDocument | null> {
    return await this.model
      .findById(roomId)
      .populate('host', 'name avatar email')
      .populate('group', 'title category visibility')
      .populate('participants.user', 'name avatar email')
      .exec();
  }

  async findActiveByGroupId(groupId: string): Promise<ILiveRoomDocument | null> {
    return await this.model.findOne({ group: groupId, isActive: true }).exec();
  }

  async findWithFilters(query: any, skip: number, limit: number): Promise<ILiveRoomDocument[]> {
    return await this.model
      .find(query)
      .populate('host', 'name avatar email')
      .populate('group', 'title category visibility')
      .populate('participants.user', 'name avatar email')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as ILiveRoomDocument[];
  }

  async createRoom(data: any): Promise<ILiveRoomDocument> {
    return await this.model.create(data);
  }

  async getStatsByGroupId(groupId: string): Promise<any[]> {
    return await this.model.aggregate([
      {
        $match: { group: new Types.ObjectId(groupId) },
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$stats.totalDuration' },
          totalParticipants: { $sum: '$stats.totalParticipants' },
          peakParticipants: { $max: '$stats.peakParticipants' },
        },
      },
    ]);
  }

  /**
   * Atomically update camera/mic settings for an active participant
   */
  async updateParticipantSettings(
    roomId: string,
    userId: string,
    settings: { cameraOn?: boolean; micOn?: boolean }
  ): Promise<ILiveRoomDocument | null> {
    const updateFields: Record<string, boolean> = {};
    if (settings.cameraOn !== undefined) updateFields['participants.$[elem].cameraOn'] = settings.cameraOn;
    if (settings.micOn !== undefined) updateFields['participants.$[elem].micOn'] = settings.micOn;

    return await this.model.findOneAndUpdate(
      { _id: roomId },
      { $set: updateFields },
      {
        arrayFilters: [{ 'elem.user': new Types.ObjectId(userId), 'elem.leftAt': null }],
        new: true,
      }
    ).exec();
  }
}

export default new LiveRoomRepository();
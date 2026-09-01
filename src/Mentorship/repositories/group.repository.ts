import { GroupSession } from '../models';

class GroupRepository {

  async findBySessionId(sessionId: string): Promise<any | null> {
    return await GroupSession.findOne({ sessionId }).lean();
  }

  async findById(objectId: string): Promise<any | null> {
    return await GroupSession.findById(objectId).lean();
  }

  /**
   * Returns Mongoose document (not lean) — needed for instance methods (e.g. addParticipant).
   */
  async findByIdForUpdate(objectId: string): Promise<any | null> {
    return await GroupSession.findById(objectId);
  }

  async create(data: any): Promise<any> {
    const session = new GroupSession(data);
    await session.save();
    return session.toObject();
  }

  async findAll(query: any, skip: number, limit: number): Promise<any[]> {
    return await GroupSession.find(query)
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(query: any): Promise<number> {
    return await GroupSession.countDocuments(query);
  }

  async findUpcoming(query: any, limit: number): Promise<any[]> {
    return await GroupSession.find(query)
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .lean();
  }

  async updateBySessionId(sessionId: string, updates: any): Promise<any | null> {
    const session = await GroupSession.findOneAndUpdate(
      { sessionId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
    return session;
  }

  async findByUserId(userId: string, role: 'mentor' | 'mentee'): Promise<any[]> {
    const query =
      role === 'mentor'
        ? { mentorId: userId }
        : { 'participants.menteeId': userId };

    return await GroupSession.find(query)
      .sort({ scheduledAt: -1 })
      .lean();
  }
}

export default new GroupRepository();
import Waitlist, { WaitlistStatus } from '../models/Waitlist';

class WaitlistRepository {

  async findByWaitlistId(waitlistId: string): Promise<any | null> {
    return await Waitlist.findOne({ waitlistId }).lean();
  }

  async findById(objectId: string): Promise<any | null> {
    return await Waitlist.findById(objectId).lean();
  }

  /**
   * Returns Mongoose document (not lean) — needed for instance methods (e.g. notify(), promote()).
   */
  async findByIdForUpdate(objectId: string): Promise<any | null> {
    return await Waitlist.findById(objectId);
  }

  async create(data: any): Promise<any> {
    const entry = new Waitlist(data);
    await entry.save();
    return entry.toObject();
  }

  async findByMentorId(mentorId: string, status?: WaitlistStatus): Promise<any[]> {
    const query: any = { mentorId };
    query.status = status ?? WaitlistStatus.ACTIVE;
    return await Waitlist.find(query)
      .sort({ priority: -1, position: 1 })
      .lean();
  }

  async findByUserId(userId: string): Promise<any[]> {
    return await Waitlist.find({
      userId,
      status: { $in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] },
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  async countActive(mentorId: string): Promise<number> {
    return await Waitlist.countDocuments({
      mentorId,
      status: WaitlistStatus.ACTIVE,
    });
  }

  async updateByWaitlistId(waitlistId: string, updates: any): Promise<any | null> {
    return await Waitlist.findOneAndUpdate(
      { waitlistId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
  }

  async getStats(mentorId: string): Promise<any> {
    const [byStatus, total, active] = await Promise.all([
      Waitlist.aggregate([
        { $match: { mentorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Waitlist.countDocuments({ mentorId }),
      Waitlist.countDocuments({ mentorId, status: WaitlistStatus.ACTIVE }),
    ]);

    return { total, active, byStatus };
  }
}

export default new WaitlistRepository();
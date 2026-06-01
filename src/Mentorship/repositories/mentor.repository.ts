import { Mentor } from '../models';

class MentorRepository {

  async findByMentorId(mentorId: string): Promise<any | null> {
    return await Mentor.findOne({ mentorId, isDeleted: false }).lean();
  }

  async findById(objectId: string): Promise<any | null> {
    return await Mentor.findById(objectId).lean();
  }

  async findByUserId(userId: string): Promise<any | null> {
    return await Mentor.findOne({ userId, isDeleted: false }).lean();
  }

  async create(data: any): Promise<any> {
    const mentor = new Mentor(data);
    await mentor.save();
    return mentor.toObject();
  }

  async updateByMentorId(mentorId: string, updates: any): Promise<any | null> {
    const mentor = await Mentor.findOneAndUpdate(
      { mentorId, isDeleted: false },
      { $set: updates },
      { new: true }
    );
    if (!mentor) return null;
    return mentor.toObject();
  }

  async softDeleteByMentorId(mentorId: string): Promise<boolean> {
    const mentor = await Mentor.findOne({ mentorId, isDeleted: false });
    if (!mentor) return false;

    mentor.isDeleted = true;
    mentor.deletedAt = new Date();
    await mentor.save();
    return true;
  }

  async findAll(
    query: any,
    sortQuery: any,
    skip: number,
    limit: number
  ): Promise<any[]> {
    return await Mentor.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(query: any): Promise<number> {
    return await Mentor.countDocuments(query);
  }

  async getStatsByMentorId(mentorId: string): Promise<any | null> {
    const mentor = await Mentor.findOne({ mentorId, isDeleted: false })
      .select('stats')
      .lean();
    return mentor?.stats || null;
  }

  async findByMentorIds(mentorIds: string[]): Promise<any[]> {
    return await Mentor.find({
      mentorId: { $in: mentorIds },
      isDeleted: false,
    }).lean();
  }

  async aggregateDomains(pipeline: any[]): Promise<any[]> {
    return await Mentor.aggregate(pipeline).exec();
  }

  async aggregateCompanies(pipeline: any[]): Promise<any[]> {
    return await Mentor.aggregate(pipeline).exec();
  }

  async findForSuggestions(keyword: string, limit: number): Promise<any[]> {
    return await Mentor.find({
      status: 'active',
      isDeleted: false,
      $or: [
        { skills: { $regex: keyword, $options: 'i' } },
        { domains: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
        { 'experience.currentRole': { $regex: keyword, $options: 'i' } },
      ],
    })
      .select('skills domains title experience.currentRole')
      .limit(limit)
      .lean();
  }
}

export default new MentorRepository();
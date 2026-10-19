// repositories/seniorMentorApplication.repository.ts
import SeniorMentorApplication from '../models/SeniorMentorApplication';
import { ApplicationFilters } from '../interface/seniorMentorApplication.types';

class SeniorMentorApplicationRepository {
  async findBySeniorMentorId(seniorMentorId: string): Promise<any | null> {
    return await SeniorMentorApplication.findOne({
      seniorMentorId,
      isDeleted: false,
    }).lean();
  }

  async findByUserId(userId: string): Promise<any | null> {
    return await SeniorMentorApplication.findOne({ userId, isDeleted: false }).lean();
  }

  async create(data: any): Promise<any> {
    const application = new SeniorMentorApplication(data);
    await application.save();
    return application.toObject();
  }

  async updateBySeniorMentorId(seniorMentorId: string, updates: any): Promise<any | null> {
    const application = await SeniorMentorApplication.findOneAndUpdate(
      { seniorMentorId, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!application) return null;
    return application.toObject();
  }


  async updateProfilePhotoByUserId(
    userId: string,
    photo: { profilePhoto: string; profilePhotoKey: string }
  ): Promise<any | null> {
    const application = await SeniorMentorApplication.findOneAndUpdate(
      { userId, isDeleted: false },
      { $set: photo },
      { new: true, runValidators: true }
    );
    if (!application) return null;
    return application.toObject();
  }

  async softDeleteBySeniorMentorId(seniorMentorId: string): Promise<boolean> {
    const application = await SeniorMentorApplication.findOne({
      seniorMentorId,
      isDeleted: false,
    });
    if (!application) return false;

    application.isDeleted = true;
    application.deletedAt = new Date();
    application.isActive = false;
    await application.save();
    return true;
  }

  async findAll(
    filters: ApplicationFilters,
    sortQuery: any,
    skip: number,
    limit: number
  ): Promise<any[]> {
    const query = this.buildQuery(filters);
    return await SeniorMentorApplication.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async count(filters: ApplicationFilters): Promise<number> {
    const query = this.buildQuery(filters);
    return await SeniorMentorApplication.countDocuments(query);
  }

  private buildQuery(filters: ApplicationFilters): Record<string, any> {
    const query: Record<string, any> = { isDeleted: false };

    if (filters.verificationStatus) query.verificationStatus = filters.verificationStatus;
    if (filters.primaryExpertise) query.primaryExpertise = filters.primaryExpertise;
    if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
    if (filters.search) {
      query.$or = [
        { fullName: { $regex: filters.search, $options: 'i' } },
        { college: { $regex: filters.search, $options: 'i' } },
        { currentCompany: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return query;
  }
}

export default new SeniorMentorApplicationRepository();

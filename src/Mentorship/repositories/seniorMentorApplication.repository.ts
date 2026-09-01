// repositories/seniorMentorApplication.repository.ts
import SeniorMentorApplication from '../models/SeniorMentorApplication';
import { ApplicationFilters } from '../interface/seniorMentorApplication.types';

class SeniorMentorApplicationRepository {
  async findByApplicationId(applicationId: string): Promise<any | null> {
    return await SeniorMentorApplication.findOne({
      applicationId,
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

  async updateByApplicationId(applicationId: string, updates: any): Promise<any | null> {
    const application = await SeniorMentorApplication.findOneAndUpdate(
      { applicationId, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!application) return null;
    return application.toObject();
  }

  async softDeleteByApplicationId(applicationId: string): Promise<boolean> {
    const application = await SeniorMentorApplication.findOne({
      applicationId,
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

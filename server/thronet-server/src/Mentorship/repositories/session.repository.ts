import SessionMentor from '@/Mentorship/models/SessionMentor';
import { logger } from '@/shared/logger.util';



class SessionRepository {
  /**
   * Find by sessionId (UUID) — external identifier.
   * Returns plain object (lean) — use for read-only operations.
   */
  async findBySessionId(sessionId: string): Promise<any | null> {
    return await SessionMentor.findOne({ sessionId }).lean();
  }

  /**
   * Find by ObjectId — returns plain object (lean).
   * Use for read-only: listing, displaying, analytics.
   *
   * ✅ FIX: Renamed to make intent clear. Use findByIdForUpdate()
   * when you need to call Mongoose instance methods (e.g. setMeetingDetails).
   */
  async findById(objectId: string): Promise<any | null> {
    return await SessionMentor.findById(objectId).lean();
  }

  /**
   * Find by ObjectId — returns full Mongoose document.
   * Use when you need to call instance methods like setMeetingDetails(),
   * or when you plan to mutate and save() the document.
   *
   * ✅ FIX: .lean() removed — caller needs Mongoose document methods.
   */
  async findByIdForUpdate(objectId: string): Promise<any | null> {
    return await SessionMentor.findById(objectId);
  }

  /**
   * Create session
   */
  async create(data: any): Promise<any> {
    const session = new SessionMentor(data);
    await session.save();
    return session.toObject();
  }

  /**
   * Atomic update by sessionId — prevents lost updates from concurrent writes.
   */
  async updateBySessionId(sessionId: string, updates: any): Promise<any | null> {
    return await SessionMentor.findOneAndUpdate(
      { sessionId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
  }

  /**
   * Get all sessions with filters and mentor name lookup.
   *
   * ✅ FIX: Now returns { data, total } for proper pagination support.
   * Frontend needs total to calculate page count.
   *
   * Note: The $addFields fallback chain (bookings.bookedBy => bookedBy => menteeId)
   * exists due to a data migration. Once data is unified under menteeId,
   * simplify this aggregate to just use { localField: 'menteeId' }.
   */
  async findAll(
    query: any,
    skip: number,
    limit: number
  ): Promise<{ data: any[]; total: number }> {
    const [data, total] = await Promise.all([
      SessionMentor.aggregate([
        { $match: query },
        { $sort: { scheduledAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $addFields: {
            lookupId: {
              $ifNull: [
                { $arrayElemAt: ['$bookings.bookedBy', 0] },
                '$bookedBy',
                '$menteeId',
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'lookupId',
            foreignField: 'userId',
            as: 'mentee',
          },
        },
        { $unwind: { path: '$mentee', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'mentors',
            localField: 'mentorId',
            foreignField: 'mentorId',
            as: 'mentorDetails',
          },
        },
        { $unwind: { path: '$mentorDetails', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'mentorDetails.userId',
            foreignField: 'userId',
            as: 'mentorUser',
          },
        },
        { $unwind: { path: '$mentorUser', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            bookedMenteeName: {
              $let: {
                vars: {
                  fullName: {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ['$mentee.firstName', ''] },
                          ' ',
                          { $ifNull: ['$mentee.lastName', ''] },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $cond: { if: { $eq: ['$$fullName', ''] }, then: null, else: '$$fullName' },
                },
              },
            },
            menteeName: {
              $let: {
                vars: {
                  fullName: {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ['$mentee.firstName', ''] },
                          ' ',
                          { $ifNull: ['$mentee.lastName', ''] },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $cond: { if: { $eq: ['$$fullName', ''] }, then: null, else: '$$fullName' },
                },
              },
            },
            menteeProfilePhoto: '$mentee.profilePhotoId',
            mentorName: {
              $let: {
                vars: {
                  userFullName: {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ['$mentorUser.firstName', ''] },
                          ' ',
                          { $ifNull: ['$mentorUser.lastName', ''] },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $ifNull: [
                    '$mentorDetails.title',
                    { $cond: { if: { $eq: ['$$userFullName', ''] }, then: null, else: '$$userFullName' } }
                  ]
                },
              },
            },
            mentorProfilePhoto: {
              $ifNull: ['$mentorDetails.profilePic', '$mentorUser.profilePhotoId']
            },
            mentorTitle: '$mentorDetails.experience.currentRole',
            mentorRating: '$mentorDetails.stats.averageRating',
            mentorTotalReviews: '$mentorDetails.stats.totalReviews'
          },
        },
        { $project: { mentee: 0, lookupId: 0, mentorDetails: 0, mentorUser: 0 } },
      ]),
      SessionMentor.countDocuments(query),
    ]);

    return { data, total };
  }

  /**
   * Count documents
   */
  async count(query: any): Promise<number> {
    return await SessionMentor.countDocuments(query);
  }

  /**
   * Get upcoming sessions for a user
   */
  async findUpcoming(userId: string, role: 'mentor' | 'mentee', limit: number): Promise<any[]> {
    const query: any = {
      scheduledAt: { $gt: new Date() },
      status: { $in: ['pending', 'confirmed'] },
      [role === 'mentor' ? 'mentorId' : 'menteeId']: userId,
    };

    return await this.findAll(query, 0, limit).then(res => res.data);
  }

  /**
   * Get past sessions for a user
   */
  async findPast(userId: string, role: 'mentor' | 'mentee', limit: number): Promise<any[]> {
    const query: any = {
      scheduledAt: { $lt: new Date() },
      status: 'completed',
      [role === 'mentor' ? 'mentorId' : 'menteeId']: userId,
    };

    return await this.findAll(query, 0, limit).then(res => res.data);
  }

  /**
   * Get session stats for a user
   */
  async getStats(userId: string, role: 'mentor' | 'mentee'): Promise<any> {
    const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';

    const stats = await SessionMentor.aggregate([
      { $match: { [matchField]: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          upcoming: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$scheduledAt', new Date()] },
                    { $in: ['$status', ['pending', 'confirmed']] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalRevenue: { $sum: '$pricing.basePrice' },
        },
      },
    ]);

    return (
      stats[0] || {
        total: 0,
        completed: 0,
        cancelled: 0,
        upcoming: 0,
        totalRevenue: 0,
      }
    );
  }
}

export default new SessionRepository();
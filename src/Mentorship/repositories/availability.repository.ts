// repositories/availability.repository.ts
import { Availability } from '../models';
import { logger } from '@/shared/logger.util';

class AvailabilityRepository {

    /**
 * Create availability
 */
    async create(data: any): Promise<any> {
        const availability = new Availability(data);
        await availability.save();
        return availability.toObject(); // ✅ Returns plain object
    }
    /**
     * Find by availabilityId (UUID) - External identifier
     */
    async findByAvailabilityId(availabilityId: string): Promise<any | null> {
        return await Availability.findOne({ availabilityId, isDeleted: false }).lean();
    }

    /**
     * Find by ObjectId - Internal operations only
     */
    async findById(objectId: string): Promise<any | null> {
        return await Availability.findById(objectId).lean();
    }

    /**
     * Find by mentorId (UUID)
     */
    async findByMentorId(mentorId: string, query: any = {}): Promise<any[]> {
        return await Availability.find({
            mentorId,
            isDeleted: false,
            ...query
        })
            .sort({ date: 1 })
            .lean();
    }

    /**
     * Find by mentor and date
     */
    async findByMentorAndDate(mentorId: string, startDate: Date, endDate: Date): Promise<any | null> {
        return await Availability.findOne({
            mentorId,
            date: { $gte: startDate, $lte: endDate },
            isDeleted: false
        }).lean();
    }

    /**
     * Update by availabilityId (UUID)
     */
    async updateByAvailabilityId(availabilityId: string, updates: any): Promise<any | null> {
        const availability = await Availability.findOne({
            availabilityId,
            isDeleted: false
        });

        if (!availability) return null;

        Object.assign(availability, updates);
        await availability.save();
        return availability.toObject();
    }

    /**
     * Soft delete by availabilityId (UUID)
     */
    async softDeleteByAvailabilityId(availabilityId: string): Promise<boolean> {
        const availability = await Availability.findOne({
            availabilityId,
            isDeleted: false
        });

        if (!availability) return false;

        availability.isDeleted = true;
        availability.deletedAt = new Date();
        await availability.save();
        return true;
    }

    /**
 * Find all availability (no user filter)
 */
    async findAll(query: any = {}, skip: number = 0, limit: number = 10): Promise<any[]> {
        return await Availability.find({ isDeleted: false, ...query })
            .sort({ date: 1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    /**
     * Count all availability
     */
    async count(query: any = {}): Promise<number> {
        return await Availability.countDocuments({ isDeleted: false, ...query });
    }

    /**
     * Get availability stats
     */
    async getStatsByMentorId(mentorId: string): Promise<any | null> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await Availability.aggregate([
            {
                $match: {
                    mentorId,
                    date: { $gte: today },
                    isDeleted: false
                }
            },
            {
                $unwind: '$slots'
            },
            {
                $group: {
                    _id: null,
                    totalSlots: { $sum: 1 },
                    bookedSlots: {
                        $sum: { $cond: ['$slots.isBooked', 1, 0] }
                    },
                    blockedSlots: {
                        $sum: { $cond: ['$slots.isBlocked', 1, 0] }
                    },
                    availableSlots: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$slots.isBooked', false] },
                                        { $eq: ['$slots.isBlocked', false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        return stats[0] || {
            totalSlots: 0,
            bookedSlots: 0,
            blockedSlots: 0,
            availableSlots: 0
        };
    }
}

export default new AvailabilityRepository();
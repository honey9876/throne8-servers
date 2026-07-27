import mongoose from 'mongoose';
import Event from '../models/event.model';
import { IEventDocument } from '../models/event.model';
import { EventFilterQuery } from '../interfaces';

class EventRepository {

    async create(data: Partial<IEventDocument>): Promise<IEventDocument> {
        const event = new Event(data);
        return event.save();
    }

    async findByObjectId(objectId: string): Promise<IEventDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return Event.findById(objectId)
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEventDocument;
    }

    async findByUUID(uuid: string): Promise<IEventDocument | null> {
        return Event.findOne({ eventId: uuid })
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEventDocument;
    }

    async findByCompanyObjectId(
        companyObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IEventDocument[], number]> {
        return Promise.all([
            Event.find({ company: companyObjectId })
                .sort({ startDate: -1 })
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .lean()
                .exec() as unknown as Promise<IEventDocument[]>,
            Event.countDocuments({ company: companyObjectId }),
        ]);
    }

    async findWithFilters(
        query: Record<string, unknown>,
        skip: number,
        limit: number
    ): Promise<[IEventDocument[], number]> {
        return Promise.all([
            Event.find(query)
                .sort({ startDate: 1 })
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .lean()
                .exec() as unknown as Promise<IEventDocument[]>,
            Event.countDocuments(query),
        ]);
    }

    async findUpcoming(skip: number, limit: number): Promise<[IEventDocument[], number]> {
        const query = {
            status: 'Upcoming',
            startDate: { $gte: new Date() },
        };
        return Promise.all([
            Event.find(query)
                .sort({ startDate: 1 })
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .lean()
                .exec() as unknown as Promise<IEventDocument[]>,
            Event.countDocuments(query),
        ]);
    }

    async findPast(skip: number, limit: number): Promise<[IEventDocument[], number]> {
        const query = { status: 'Completed' };
        return Promise.all([
            Event.find(query)
                .sort({ startDate: -1 })
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .lean()
                .exec() as unknown as Promise<IEventDocument[]>,
            Event.countDocuments(query),
        ]);
    }

    async searchByText(
        searchTerm: string,
        skip: number,
        limit: number
    ): Promise<[IEventDocument[], number]> {
        const searchRegex = new RegExp(searchTerm, 'i');
        const query = {
            $or: [
                { title: searchRegex },
                { description: searchRegex },
                { 'location.city': searchRegex },
            ],
        };
        return Promise.all([
            Event.find(query)
                .sort({ startDate: 1 })
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .lean()
                .exec() as unknown as Promise<IEventDocument[]>,
            Event.countDocuments(query),
        ]);
    }

    async findNearby(
        longitude: number,
        latitude: number,
        maxDistance: number
    ): Promise<IEventDocument[]> {
        return Event.find({
            'location.coordinates': {
                $near: {
                    $geometry: { type: 'Point', coordinates: [longitude, latitude] },
                    $maxDistance: maxDistance,
                },
            },
            status: { $in: ['Upcoming', 'Ongoing'] },
        })
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as Promise<IEventDocument[]>;
    }

    async updateByObjectId(
        objectId: string,
        data: Partial<IEventDocument>
    ): Promise<IEventDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return Event.findByIdAndUpdate(objectId, data, { new: true, runValidators: true })
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEventDocument;
    }

    async deleteByObjectId(objectId: string): Promise<boolean> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return false;
        const result = await Event.deleteOne({ _id: objectId });
        return result.deletedCount > 0;
    }

    async registerAttendee(
        objectId: string,
        registration: { employee: mongoose.Types.ObjectId; email: string; registeredAt: Date }
    ): Promise<IEventDocument | null> {
        return Event.findByIdAndUpdate(
            objectId,
            {
                $push: { registrations: registration },
                $inc: { registeredCount: 1 },
            },
            { new: true }
        )
            .populate('company', 'companyName media')
            .exec() as unknown as IEventDocument;
    }

    async cancelRegistration(
        objectId: string,
        employeeId: string
    ): Promise<IEventDocument | null> {
        return Event.findByIdAndUpdate(
            objectId,
            {
                $pull: { registrations: { employee: new mongoose.Types.ObjectId(employeeId) } },
                $inc: { registeredCount: -1 },
            },
            { new: true }
        ).exec() as unknown as IEventDocument;
    }

    async getStatistics(companyObjectId?: string): Promise<{
        upcoming: number;
        ongoing: number;
        completed: number;
        total: number;
        avgRegistrations: number;
    }> {
        const matchQuery = companyObjectId
            ? { company: new mongoose.Types.ObjectId(companyObjectId) }
            : {};

        const [upcoming, ongoing, completed, total, avgResult] = await Promise.all([
            Event.countDocuments({ status: 'Upcoming', ...matchQuery }),
            Event.countDocuments({ status: 'Ongoing', ...matchQuery }),
            Event.countDocuments({ status: 'Completed', ...matchQuery }),
            Event.countDocuments(matchQuery),
            Event.aggregate([
                ...(companyObjectId ? [{ $match: matchQuery }] : []),
                { $group: { _id: null, avg: { $avg: '$registeredCount' } } },
            ]),
        ]);

        return {
            upcoming,
            ongoing,
            completed,
            total,
            avgRegistrations: avgResult[0]?.avg || 0,
        };
    }
}

export default new EventRepository();
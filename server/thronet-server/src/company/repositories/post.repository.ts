import mongoose from 'mongoose';
import { CompanyPost } from '../models';
import { IPostDocument } from '../models/companyPost.model';
import { PostStatus } from '../interfaces';

class PostRepository {

    async create(data: Partial<IPostDocument>): Promise<IPostDocument> {
        const post = new CompanyPost(data);
        return post.save();
    }

    async findById(id: string): Promise<IPostDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        return CompanyPost.findById(id)
            .populate('company', 'companyName companySlug media')
            .populate('author', 'firstName lastName employeeId')
            .exec();
    }

    async findBySlug(slug: string): Promise<IPostDocument | null> {
        return CompanyPost.findOne({ slug, isPublished: true })
            .populate('company', 'companyName companySlug media')
            .populate('author', 'firstName lastName employeeId')
            .exec();
    }

    // ✅ UPDATED: company ObjectId se filter
    async findWithFilters(
        query: Record<string, unknown>,
        sortQuery: Record<string, 1 | -1>,
        skip: number,
        limit: number
    ): Promise<[IPostDocument[], number]> {
        return Promise.all([
            CompanyPost.find(query)
                .populate('company', 'companyName companySlug media')
                .populate('author', 'firstName lastName employeeId')
                .sort(sortQuery)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IPostDocument[]>,
            CompanyPost.countDocuments(query),
        ]);
    }

    // ✅ UPDATED: ObjectId se dhundo
    async findByCompanyObjectId(
        companyObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IPostDocument[], number]> {
        const query = {
            company: new mongoose.Types.ObjectId(companyObjectId),
            status: { $ne: 'Archived' },
        };
        return Promise.all([
            CompanyPost.find(query)
                .populate('company', 'companyName companySlug media')
                .populate('author', 'firstName lastName employeeId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IPostDocument[]>,
            CompanyPost.countDocuments(query),
        ]);
    }

    // ✅ ADD: Author ObjectId se posts dhundo
    async findByAuthorObjectId(
        authorObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IPostDocument[], number]> {
        const query = {
            author: new mongoose.Types.ObjectId(authorObjectId),
            status: { $ne: 'Archived' },
        };
        return Promise.all([
            CompanyPost.find(query)
                .populate('company', 'companyName companySlug media')
                .populate('author', 'firstName lastName employeeId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IPostDocument[]>,
            CompanyPost.countDocuments(query),
        ]);
    }

    async updateById(
        id: string,
        data: Partial<IPostDocument>
    ): Promise<IPostDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        return CompanyPost.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        })
            .populate('company', 'companyName companySlug media')
            .populate('author', 'firstName lastName employeeId')
            .exec();
    }

    async searchByText(
        searchTerm: string,
        skip: number,
        limit: number
    ): Promise<[IPostDocument[], number]> {
        return Promise.all([
            CompanyPost.find(
                { $text: { $search: searchTerm }, isPublished: true },
                { score: { $meta: 'textScore' } }
            )
                .populate('company', 'companyName companySlug media')
                .sort({ score: { $meta: 'textScore' } })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IPostDocument[]>,
            CompanyPost.countDocuments({
                $text: { $search: searchTerm },
                isPublished: true,
            }),
        ]);
    }

    async findTrending(limit: number): Promise<IPostDocument[]> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return CompanyPost.find({
            isPublished: true,
            status: PostStatus.PUBLISHED,
            publishedAt: { $gte: sevenDaysAgo },
        })
            .populate('company', 'companyName companySlug media')
            .sort({ 'engagementMetrics.likesCount': -1 })
            .limit(limit)
            .lean()
            .exec() as unknown as Promise<IPostDocument[]>;
    }

    async findPopular(limit: number): Promise<IPostDocument[]> {
        return CompanyPost.find({
            isPublished: true,
            status: PostStatus.PUBLISHED,
        })
            .populate('company', 'companyName companySlug media')
            .sort({ 'engagementMetrics.likesCount': -1 })
            .limit(limit)
            .lean()
            .exec() as unknown as Promise<IPostDocument[]>;
    }

    async incrementField(id: string, field: string): Promise<void> {
        await CompanyPost.updateOne(
            { _id: id },
            { $inc: { [field]: 1 } }
        );
    }
}

export default new PostRepository();
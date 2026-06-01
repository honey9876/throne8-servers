import mongoose from 'mongoose';
import { CompanyReview } from '../models';
import { ICompanyReviewDocument } from '../models/CompanyReview.model';
import { ReviewFilterQuery } from '../interfaces';

class ReviewRepository {

    async create(data: Partial<ICompanyReviewDocument>): Promise<ICompanyReviewDocument> {
        const review = await CompanyReview.create(data);
        return review;
    }

    async findByObjectId(objectId: string): Promise<ICompanyReviewDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return CompanyReview.findById(objectId)
            .populate('company', 'companyName media')  // ✅ ye rakho
            .exec() as unknown as ICompanyReviewDocument;
    }

    async findByUUID(uuid: string): Promise<ICompanyReviewDocument | null> {
        return CompanyReview.findOne({ reviewId: uuid })
            .populate('company', 'companyName media')
            .populate('reviewer', 'firstName lastName')
            .exec() as unknown as ICompanyReviewDocument;
    }

    async findByCompanyAndReviewer(
        companyObjectId: string,
        reviewerObjectId: string
    ): Promise<ICompanyReviewDocument | null> {
        return CompanyReview.findOne({
            company: companyObjectId,
            reviewer: reviewerObjectId,
        }).lean().exec() as unknown as ICompanyReviewDocument;
    }

    async findWithFilters(
        query: Record<string, unknown>,
        sortQuery: Record<string, 1 | -1>,
        skip: number,
        limit: number
    ): Promise<[ICompanyReviewDocument[], number]> {
        return Promise.all([
            CompanyReview.find(query)
                .sort(sortQuery)
                .skip(skip)
                .limit(limit)
                .populate('company', 'companyName media')
                .populate('reviewer', 'firstName lastName')
                .exec() as unknown as Promise<ICompanyReviewDocument[]>,
            CompanyReview.countDocuments(query),
        ]);
    }

    async updateByObjectId(
        objectId: string,
        data: Partial<ICompanyReviewDocument>
    ): Promise<ICompanyReviewDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return CompanyReview.findByIdAndUpdate(objectId, data, { new: true })
            .populate('company', 'companyName media')
            .populate('reviewer', 'firstName lastName')
            .exec() as unknown as ICompanyReviewDocument;
    }

    async deleteByObjectId(objectId: string): Promise<boolean> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return false;
        const result = await CompanyReview.findByIdAndDelete(objectId);
        return !!result;
    }

    async incrementVote(
        objectId: string,
        helpful: boolean
    ): Promise<ICompanyReviewDocument | null> {
        const field = helpful ? 'helpfulCount' : 'notHelpfulCount';
        return CompanyReview.findByIdAndUpdate(
            objectId,
            { $inc: { [field]: 1 } },
            { new: true }
        )
            .populate('company', 'companyName media')
            .exec() as unknown as ICompanyReviewDocument;
    }

    async addResponse(
        objectId: string,
        respondentId: string,
        content: string
    ): Promise<ICompanyReviewDocument | null> {
        return CompanyReview.findByIdAndUpdate(
            objectId,
            {
                $push: {
                    responses: {
                        respondent: respondentId,
                        content,
                        respondedAt: new Date(),
                    },
                },
            },
            { new: true }
        )
            .populate('responses.respondent', 'firstName lastName')
            .exec() as unknown as ICompanyReviewDocument;
    }

    async setPublished(
        objectId: string,
        isPublished: boolean
    ): Promise<ICompanyReviewDocument | null> {
        return CompanyReview.findByIdAndUpdate(
            objectId,
            { isPublished },
            { new: true }
        ).exec() as unknown as ICompanyReviewDocument;
    }

    async setVerified(objectId: string): Promise<ICompanyReviewDocument | null> {
        return CompanyReview.findByIdAndUpdate(
            objectId,
            { isVerified: true },
            { new: true }
        ).exec() as unknown as ICompanyReviewDocument;
    }

    async getCompanyStats(companyObjectId: string) {
        return CompanyReview.getCompanyStats(companyObjectId);
    }
}

export default new ReviewRepository();
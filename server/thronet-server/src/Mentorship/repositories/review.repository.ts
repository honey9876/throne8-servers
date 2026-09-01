import MentorshipReview from '../models/MentorshipReview';

class ReviewRepository {

    async findByReviewId(reviewId: string): Promise<any | null> {
        return await MentorshipReview.findOne({ reviewId, isDeleted: false });
    }

    async findById(objectId: string): Promise<any | null> {
        return await MentorshipReview.findById(objectId);
    }

    async findBySessionId(sessionId: string): Promise<any | null> {
        return await MentorshipReview.findOne({ sessionId, isDeleted: false });
    }

    async create(data: any): Promise<any> {
        const review = new MentorshipReview(data);
        await review.save();
        return review;  // instance methods chahiye
    }

    async findByMentorId(
        mentorId: string,
        skip: number,
        limit: number,
        includePrivate: boolean = false
    ): Promise<any[]> {
        const query: any = { mentorId, isDeleted: false };
        if (!includePrivate) query.isPublic = true;

        return await MentorshipReview.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    async countByMentorId(
        mentorId: string,
        includePrivate: boolean = false
    ): Promise<number> {
        const query: any = { mentorId, isDeleted: false };
        if (!includePrivate) query.isPublic = true;
        return await MentorshipReview.countDocuments(query);
    }

    async getAverageRating(mentorId: string): Promise<any> {
        return await MentorshipReview.getAverageRating(mentorId);
    }

    // ✅ Repository mein atomic fix add karo
    async incrementHelpfulAtomic(reviewId: string): Promise<any> {
        return await MentorshipReview.findOneAndUpdate(
            { reviewId, isDeleted: false },
            { $inc: { helpfulCount: 1 } },
            { new: true }
        );
    }

    async incrementReportAtomic(reviewId: string): Promise<any> {
  return await MentorshipReview.findOneAndUpdate(
    { reviewId, isDeleted: false },
    { $inc: { reportCount: 1 } },
    { new: true }
  );
}

}

export default new ReviewRepository();
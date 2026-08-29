import { BookingStatus } from "@/shared/constants/bookingStatus";
// import { Mentor, MentorshipReview, SessionMentor } from "../models";
import { logger } from "@/shared/logger.util";
import { Mentor, MentorshipReview, SessionMentor } from "../models";
import reviewRepository from "../repositories/review.repository";
import { generateSecureId } from "@/shared/security";
import { TrustScoreEvents } from '../events/trustScore.events';



interface ReviewInput {
  sessionId: string;
  mentorId: string;
  menteeId: string;
  rating: number;
  comment: string;
  tags?: string[];
}

class ReviewService {
  /**
   * Submit a new review for a completed session
   */
  async submitReview(input: ReviewInput): Promise<any> {
    try {
      logger.info(`📝 Submitting review for session: ${input.sessionId}`);

      // Validate session exists and is completed
      // const session = await SessionMentor.findById(input.sessionId);
      const session = await SessionMentor.findOne({ sessionId: input.sessionId });
      if (!session) {
        throw new Error('Session not found');
      }

      if (session.status !== BookingStatus.COMPLETED) {
        throw new Error('Can only review completed sessions');
      }

      // Check if review already exists
      // const existingReview = await MentorshipReview.findOne({ sessionId: input.sessionId });

      const existingReview = await reviewRepository.findBySessionId(input.sessionId);
      if (existingReview) {
        throw new Error('Review already submitted for this session');
      }

      // Verify mentee owns the session
      if (session.menteeId !== input.menteeId) {
        throw new Error('You can only review your own sessions');
      }

      // Create review
      const review = await MentorshipReview.create({
        reviewId: generateSecureId(), // Generate a unique review ID
        sessionId: input.sessionId,
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        rating: input.rating,
        comment: input.comment,
        tags: input.tags || [],
        isVerified: true,
        isPublic: true,
      });

      // Update mentor stats
      await this.updateMentorRating(input.mentorId);

      TrustScoreEvents.emit('ReviewCreated', {
        mentorId: input.mentorId,
        reviewId: review.reviewId,
        timestamp: new Date()
      });

      logger.info(`✅ Review submitted: ${review._id}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to submit review:', error);
      throw error;
    }
  }

  /**
   * Update mentor's average rating
   */
  async updateMentorRating(mentorId: string): Promise<void> {
    try {
      const ratingStats = await MentorshipReview.getAverageRating(mentorId);

      // const mentor = await Mentor.findOne({ userId: mentorId });

      const mentor = await Mentor.findOne({ mentorId: mentorId });
      if (mentor) {
        mentor.stats.averageRating = ratingStats.averageRating;
        mentor.stats.totalReviews = ratingStats.totalReviews;
        await mentor.save();

        logger.info(`📊 Updated mentor rating: ${ratingStats.averageRating} (${ratingStats.totalReviews} reviews)`);
      }
    } catch (error: any) {
      logger.error('❌ Failed to update mentor rating:', error);
    }
  }

  /**
   * Get reviews for a specific mentor
   */
  async getMentorReviews(
    mentorId: string,
    page: number = 1,
    limit: number = 10,
    includePrivate: boolean = false
  ): Promise<{ reviews: any[]; total: number; stats: any }> {
    try {
      const skip = (page - 1) * limit;

      const query: any = {
        mentorId,
        isDeleted: false,
      };

      if (!includePrivate) {
        query.isPublic = true;
      }

      // const [reviews, total, stats] = await Promise.all([
      //   MentorshipReview.find(query)
      //     .sort({ createdAt: -1 })
      //     .skip(skip)
      //     .limit(limit)
      //     .lean(),
      //   MentorshipReview.countDocuments(query),
      //   MentorshipReview.getAverageRating(mentorId),
      // ]);

      const [reviews, total, stats] = await Promise.all([
        reviewRepository.findByMentorId(mentorId, skip, limit, includePrivate),
        reviewRepository.countByMentorId(mentorId, includePrivate),
        reviewRepository.getAverageRating(mentorId),
      ]);

      return { reviews, total, stats };
    } catch (error: any) {
      logger.error('❌ Failed to get mentor reviews:', error);
      throw error;
    }
  }

  /**
   * Get review by ID
   */
  async getReviewById(reviewId: string): Promise<any> {
    try {
      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }
      return review;
    } catch (error: any) {
      logger.error('❌ Failed to get review:', error);
      throw error;
    }
  }

  /**
   * Update existing review
   */
  async updateReview(
    reviewId: string,
    userId: string,
    updates: { rating?: number; comment?: string; tags?: string[] }
  ): Promise<any> {
    try {
      logger.info(`✏️ Updating review: ${reviewId}`);

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      // Verify ownership
      if (review.menteeId !== userId) {
        throw new Error('You can only update your own reviews');
      }

      // Update fields
      if (updates.rating !== undefined) review.rating = updates.rating;
      if (updates.comment !== undefined) review.comment = updates.comment;
      if (updates.tags !== undefined) review.tags = updates.tags;

      await review.save();

      // Update mentor rating
      await this.updateMentorRating(review.mentorId);

      TrustScoreEvents.emit('ReviewUpdated', {
        mentorId: review.mentorId,
        reviewId: review.reviewId,
        timestamp: new Date()
      });

      logger.info(`✅ Review updated: ${reviewId}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to update review:', error);
      throw error;
    }
  }

  /**
   * Delete review (soft delete)
   */
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    try {
      logger.info(`🗑️  Deleting review: ${reviewId}`);

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      // Verify ownership
      if (review.menteeId !== userId) {
        throw new Error('You can only delete your own reviews');
      }

      // Call the instance method - now properly typed
      await review.softDelete();

      // Update mentor rating
      await this.updateMentorRating(review.mentorId);

      TrustScoreEvents.emit('ReviewDeleted', {
        mentorId: review.mentorId,
        reviewId: review.reviewId,
        timestamp: new Date()
      });

      logger.info(`✅ Review deleted: ${reviewId}`);
    } catch (error: any) {
      logger.error('❌ Failed to delete review:', error);
      throw error;
    }
  }

  /**
   * Add mentor response to review
   */
  async addMentorResponse(
    reviewId: string,
    mentorId: string,
    response: string
  ): Promise<any> {
    try {
      logger.info(`💬 Adding mentor response to review: ${reviewId}`);

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      // Verify mentor owns the review
      if (review.mentorId !== mentorId) {
        throw new Error('You can only respond to your own reviews');
      }

      // Call the instance method - now properly typed
      await review.addMentorResponse(response);

      logger.info(`✅ Mentor response added: ${reviewId}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to add mentor response:', error);
      throw error;
    }
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string): Promise<any> {
    try {
      // const review = await reviewRepository.findByReviewId(reviewId);
      // if (!review) {
      //   throw new Error('Review not found');
      // }

      // // Call the instance method - now properly typed
      // await review.incrementHelpful();

      // ✅ Replace with
      const review = await reviewRepository.incrementHelpfulAtomic(reviewId);
      if (!review) throw new Error('Review not found');

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to mark review as helpful:', error);
      throw error;
    }
  }

  /**
   * Report a review
   */
  async reportReview(reviewId: string, _reason: string): Promise<void> {
    try {
      logger.info(`🚩 Reporting review: ${reviewId}`);

      // const review = await reviewRepository.findByReviewId(reviewId);
      // if (!review) {
      //   throw new Error('Review not found');
      // }

      // // Call the instance method - now properly typed
      // await review.incrementReport();

      const review = await reviewRepository.incrementReportAtomic(reviewId);
      if (!review) throw new Error('Review not found');

      // auto-hide logic yahan check karo
      if (review.reportCount >= 5) {
        logger.warn(`🔒 Review auto-hidden: ${reviewId}`);
      }

      logger.info(`⚠️ Review reported: ${reviewId} (${review.reportCount} reports)`);

      // Auto-hide after 5 reports (handled in model method)
      if (review.reportCount >= 5) {
        logger.warn(`🔒 Review auto-hidden due to reports: ${reviewId}`);
      }
    } catch (error: any) {
      logger.error('❌ Failed to report review:', error);
      throw error;
    }
  }

  /**
   * Get top reviews (most helpful)
   */
  async getTopReviews(mentorId: string, limit: number = 5): Promise<any[]> {
    try {
      // Call the static method - now properly typed
      return await MentorshipReview.getTopReviews(mentorId, limit);
    } catch (error: any) {
      logger.error('❌ Failed to get top reviews:', error);
      throw error;
    }
  }

  /**
   * Get review statistics for mentor
   */
  async getReviewStats(mentorId: string): Promise<any> {
    try {
      // Call the static method - now properly typed
      const stats = await MentorshipReview.getAverageRating(mentorId);

      // Get tag distribution
      const tagStats = await MentorshipReview.aggregate([
        {
          $match: {
            mentorId,
            isDeleted: false,
            isPublic: true,
          },
        },
        {
          $unwind: '$tags',
        },
        {
          $group: {
            _id: '$tags',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]);

      return {
        ...stats,
        topTags: tagStats.slice(0, 5),
      };
    } catch (error: any) {
      logger.error('❌ Failed to get review stats:', error);
      throw error;
    }
  }

  /**
   * Moderate review (Admin only)
   */
  async moderateReview(
    reviewId: string,
    action: 'approve' | 'hide' | 'delete',
    _reason?: string
  ): Promise<any> {
    try {
      logger.info(`👮 Moderating review: ${reviewId} - Action: ${action}`);

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      switch (action) {
        case 'approve':
          review.isPublic = true;
          review.reportCount = 0;
          break;
        case 'hide':
          review.isPublic = false;
          break;
        case 'delete':
          // Call the instance method - now properly typed
          await review.softDelete();
          break;
      }

      if (action !== 'delete') {
        await review.save();
      }

      logger.info(`✅ Review moderated: ${reviewId}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to moderate review:', error);
      throw error;
    }
  }
}

export default new ReviewService();
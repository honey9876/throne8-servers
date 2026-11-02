import { BookingStatus } from "@/shared/constants/bookingStatus";
// import { Mentor, MentorshipReview, SessionMentor } from "../models";
import { logger } from "@/shared/logger.util";
import { Mentor, MentorshipReview, SessionMentor } from "../models";
import ReviewReport from "../models/ReviewReport";
import reviewRepository, { ReviewSort, ReviewReaction } from "../repositories/review.repository";
import { generateSecureId } from "@/shared/security";
import { TrustScoreEvents } from '../events/trustScore.events';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import { User } from '@/auth/models';


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

         // root status nahi, mentee ki apni booking ka status dekho
      // (group/multi-booking me root tab tak COMPLETED nahi hota jab tak sab bookings final na hon)
      const myBooking: any = (session.bookings || []).find(        
        (b: any) => (b.menteeId || b.bookedBy) === input.menteeId
      );
      const effectiveStatus = myBooking?.status ?? session.status;
      if (effectiveStatus !== BookingStatus.COMPLETED) {
        throw new Error('Can only review completed sessions');
      }

      // Check if review already exists
      // const existingReview = await MentorshipReview.findOne({ sessionId: input.sessionId });

      const existingReview = await MentorshipReview.findOne({
        sessionId: input.sessionId,
        menteeId: input.menteeId,
        isDeleted: false,
      });
      if (existingReview) {
        throw new Error('You have already reviewed this session.');
      }

      // ✅ FIX: root-level session.menteeId defaults to null and is never
      // set at booking time — the real mentee ID only lives inside the
      // bookings[] array (see SessionMentor schema). The old check
      // `session.menteeId !== input.menteeId` compared against that null
      // field and rejected every mentee, even for their own sessions.
      // Now it checks the bookings array (still falling back to the root
      // field for any legacy data that does have it set).
      const isOwner =
        session.menteeId === input.menteeId ||
        (session.bookings || []).some((b: any) => b.menteeId === input.menteeId);
        if (!isOwner) {
          throw new Error('You can only review your own sessions');
        }
  
        // client ka bheja mentorId ignore karo, session ka asli mentor use karo
        input.mentorId = session.mentorId;

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

      try {
        const mentorDoc = await Mentor.findOne({ mentorId: input.mentorId, isDeleted: false });
        if (mentorDoc && mentorDoc.userId && mentorDoc.userId !== input.menteeId) {
          NotificationService.sendNotification({
            userId: mentorDoc.userId,
        module: 'industry-mentor',
            type: NotificationType.REVIEW_RECEIVED,
            channels: [NotificationChannel.IN_APP],
            data: {
              menteeId: input.menteeId,
              title: 'New Review',
              message: `You received a new review with a rating of ${input.rating}★.`,
            },
          }).catch((e) => logger.error('Notification failed (submitReview):', e));
        }
      } catch (notifErr: any) {
        logger.warn(`⚠️ Failed to send review notification: ${notifErr.message}`);
      }

      logger.info(`✅ Review submitted: ${review._id}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to submit review:', error);
      if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
        throw new Error('You have already reviewed this session.');
      }
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
    includePrivate: boolean = false,
    sort: ReviewSort = 'newest',
    callerUserId?: string
  ): Promise<{ reviews: any[]; total: number; stats: any }> {
    try {
      const skip = (page - 1) * limit;

      const [reviews, total, stats] = await Promise.all([
        reviewRepository.findByMentorId(mentorId, skip, limit, includePrivate, sort),        
        reviewRepository.countByMentorId(mentorId, includePrivate),
        reviewRepository.getAverageRating(mentorId),
      ]);

      let enrichedReviews = reviews;

      // Privacy check: reportedPending is added ONLY when authenticated AND
      // callerUserId matches the Mentor whose reviews are listed.
      let isReviewedMentor = false;
      if (callerUserId) {
        const mentorDoc = await Mentor.findOne({ mentorId, isDeleted: false }).select('userId').lean();
        if (mentorDoc && mentorDoc.userId === callerUserId) {
          isReviewedMentor = true;
        }
      }

      if (isReviewedMentor && reviews.length > 0) {
        const reviewIds = reviews.map((r: any) => r.reviewId).filter(Boolean);
        const pendingReports = await ReviewReport.find(
          { reviewId: { $in: reviewIds }, status: 'pending' },
          { reviewId: 1, _id: 0 }
        ).lean();
        const pendingReviewIdSet = new Set(pendingReports.map((p: any) => p.reviewId));

        enrichedReviews = reviews.map((r: any) => {
          const item = { ...r };
          if (pendingReviewIdSet.has(r.reviewId)) {
            item.reportedPending = true;
          }
          return item;
        });
      }

      return { reviews: enrichedReviews, total, stats };
    } catch (error: any) {
      logger.error('❌ Failed to get mentor reviews:', error);
      throw error;
    }
  }

    /**
   * Get all reviews submitted by a specific mentee (for their "Reviews Given" tab)
   */
  async getMenteeReviews(menteeId: string): Promise<any[]> {
    try {
      logger.info(`📋 Fetching reviews submitted by mentee: ${menteeId}`);
      return await reviewRepository.findByMenteeId(menteeId);
    } catch (error: any) {
      logger.error('❌ Failed to get mentee reviews:', error);
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

      const text = (response || '').trim();
      if (text.length < 10) {
        throw new Error('Response must be at least 10 characters');
      }
      if (text.length > 500) {
        throw new Error('Response cannot exceed 500 characters');
      }

      // review.mentorId = Mentor.mentorId, jabki yahan `mentorId` param asal me
      // logged-in userId hai. Isliye Mentor resolve karke userId compare karte hain.
      await this.assertReviewBelongsToMentorUser(review.mentorId, mentorId);

      const previousRespondedAt = review.mentorResponse?.respondedAt;
      const isRecentEdit = !!(
        previousRespondedAt &&
        (Date.now() - new Date(previousRespondedAt).getTime() < 5 * 60 * 1000)
      );

      await review.addMentorResponse(text);

      if (!isRecentEdit && review.menteeId) {
        try {
          const mentorDoc = await Mentor.findOne({ mentorId: review.mentorId, isDeleted: false });
          let mentorName = 'Your mentor';
          if (mentorDoc && mentorDoc.userId) {
            const mentorUser = await User.findByUserId(mentorDoc.userId);
            if (mentorUser) {
              mentorName =
                mentorUser.fullName ||
                `${mentorUser.firstName || ''} ${mentorUser.lastName || ''}`.trim() ||
                'Your mentor';
            }
          }

          NotificationService.sendNotification({
            userId: review.menteeId,
        module: 'industry-mentor',
            type: NotificationType.REVIEW_REPLIED,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Mentor Replied to Your Review',
              message: `${mentorName} replied to your review: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`,
              reviewId: review.reviewId,
              mentorId: review.mentorId,
            },
          }).catch((e) => logger.error('Notification failed (addMentorResponse):', e));
        } catch (notifErr: any) {
          logger.warn(`⚠️ Failed to send review reply notification: ${notifErr.message}`);
        }
      }

      logger.info(`✅ Mentor response added: ${reviewId}`);

      return review;
    } catch (error: any) {
      logger.error('❌ Failed to add response:', error);
      throw error;
    }
  }

  private async assertReviewBelongsToMentorUser(reviewMentorId: string, userId: string): Promise<void> {
    const mentor = await Mentor.findOne({ mentorId: reviewMentorId, isDeleted: false });
    if (!mentor || String(mentor.userId) !== String(userId)) {
      throw new Error('You can only respond to your own reviews');
    }
  }

  /**
   * Mentor ka reply hatao
   */
  async deleteMentorResponse(reviewId: string, userId: string): Promise<any> {
    try {
      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }
      await this.assertReviewBelongsToMentorUser(review.mentorId, userId);

      return await reviewRepository.removeMentorResponse(reviewId);
    } catch (error: any) {
      logger.error('❌ Failed to delete mentor response:', error);
      throw error;
    }
  }

  /**
   * Like / dislike toggle. Apne review par react karna blocked hai.
   */
  async reactToReview(
    reviewId: string,
    userId: string,
    type: ReviewReaction
  ): Promise<{ reviewId: string; helpfulCount: number; notHelpfulCount: number; userReaction: ReviewReaction | null }> {
    try {
      if (type !== 'like' && type !== 'dislike') {
        throw new Error("Reaction type must be 'like' or 'dislike'");
      }

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }
      if (review.menteeId === userId) {
        throw new Error('You cannot react to your own review');
      }

      const result = await reviewRepository.toggleReactionAtomic(reviewId, userId, type);
      if (!result) {
        throw new Error('Could not update reaction, please try again');
      }

      return { reviewId, ...result };
    } catch (error: any) {
      logger.error('❌ Failed to react to review:', error);
      throw error;
    }
  }

  async getUserReactions(mentorId: string, userId: string): Promise<Record<string, ReviewReaction>> {
    try {
      return await reviewRepository.getUserReactions(mentorId, userId);
    } catch (error: any) {
      logger.error('❌ Failed to get user reactions:', error);
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
   * Report a review (mentor-only: can only report reviews on their own profile)
   * Inserts a ReviewReport (status='pending') and increments reportCount.
   * The review is NOT hidden — it stays public exactly as it is.
   */
  async reportReview(
    reviewId: string,
    reason: string,
    reporterId: string,
    mentorId: string,
    note?: string
  ): Promise<void> {
    logger.info(`🚩 Mentor ${reporterId} reporting review: ${reviewId}`);

    // 1. Insert ReviewReport first. Duplicate key (11000) yields 409 and no increment occurs.
    try {
      await ReviewReport.create({
        reportId: generateSecureId(),
        reviewId,
        mentorId,
        reporterId,
        reason,
        note: note ? note.trim() : undefined,
        status: 'pending',
      });
    } catch (err: any) {
      if (err?.code === 11000 || (typeof err?.message === 'string' && err.message.includes('E11000'))) {
        const dupError: any = new Error('You already reported this review');
        dupError.statusCode = 409;
        throw dupError;
      }
      logger.error('❌ Failed to create ReviewReport document:', err);
      throw err;
    }

    // 2. Only after successful insert call incrementReportAtomic once
    try {
      const review = await reviewRepository.incrementReportAtomic(reviewId);
      if (!review) {
        logger.error(`❌ Review ${reviewId} not found when incrementing report count`);
        throw new Error('Review not found');
      }
      logger.info(`⚠️ Review reported: ${reviewId} (${review.reportCount} reports total)`);
    } catch (err: any) {
      logger.error(`❌ Failed to increment report count for review ${reviewId}:`, err);
      throw new Error('Failed to update review report count');
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
   * Actions:
   *  - 'keep'   : dismiss the report. reportCount -> 0, ReviewReport status -> 'kept'.
   *               The review stays public as-is. (was 'approve')
   *  - 'delete' : soft-delete the review. ReviewReport status -> 'deleted'.
   */
  async moderateReview(
    reviewId: string,
    action: 'keep' | 'delete',
    _reason?: string
  ): Promise<any> {
    try {
      logger.info(`👮 Moderating review: ${reviewId} - Action: ${action}`);

      const review = await reviewRepository.findByReviewId(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      switch (action) {
        case 'keep':
          // Dismiss reports — reset counter, leave isPublic untouched.
          review.reportCount = 0;
          await review.save();
          // Update all pending ReviewReports for this review to 'kept'
          await ReviewReport.updateMany(
            { reviewId, status: 'pending' },
            { $set: { status: 'kept' } }
          );
          break;
        case 'delete':
          await review.softDelete();
          await ReviewReport.updateMany(
            { reviewId, status: 'pending' },
            { $set: { status: 'deleted' } }
          );
          await this.updateMentorRating(review.mentorId);
          break;
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
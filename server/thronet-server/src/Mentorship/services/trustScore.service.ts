import Mentor from '../models/Mentor';
import mentorRepository from '../repositories/mentor.repository';
import MentorshipReview from '../models/MentorshipReview';
import SessionMentor from '../models/SessionMentor';
import GroupSession from '../models/GroupSession';
import { TrustScoreCalculator } from '../utils/trustScoreCalculator';
import { TrustScoreMetrics } from '../interface/trustScore.types';

export class TrustScoreService {
  /**
   * Recalculates the Trust Score for a mentor.
   * This handles fetching data, aggregating metrics, calling the calculator, and persisting the result.
   */
  public static async recalculate(mentorId: string): Promise<any> {
    try {
      const mentor = await Mentor.findOne({ mentorId });
      if (!mentor) {
        console.warn(`[TrustScore] Mentor not found for recalculation: ${mentorId}`);
        return null;
      }

      // Aggregate Reviews
      const reviewStats = await MentorshipReview.aggregate([
        { $match: { mentorId } },
        { 
          $group: { 
            _id: null, 
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 }
          } 
        }
      ]);

      const averageRating = reviewStats[0]?.averageRating || 0;
      const totalReviews = reviewStats[0]?.totalReviews || 0;

      // Aggregate 1:1 Sessions
      const oneOnOneStats = await SessionMentor.aggregate([
        { $match: { mentorId } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            completedSessions: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            cancelledSessions: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]);

      // Aggregate Group Sessions
      const groupStats = await GroupSession.aggregate([
        { $match: { mentorId } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            completedSessions: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            cancelledSessions: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]);

      const oneOnOneTotal = oneOnOneStats[0]?.totalSessions || 0;
      const oneOnOneCompleted = oneOnOneStats[0]?.completedSessions || 0;
      const oneOnOneCancelled = oneOnOneStats[0]?.cancelledSessions || 0;

      const groupTotal = groupStats[0]?.totalSessions || 0;
      const groupCompleted = groupStats[0]?.completedSessions || 0;
      const groupCancelled = groupStats[0]?.cancelledSessions || 0;

      const metrics: TrustScoreMetrics = {
        totalSessions: oneOnOneTotal + groupTotal,
        completedSessions: oneOnOneCompleted + groupCompleted,
        cancelledSessions: oneOnOneCancelled + groupCancelled,
        averageRating,
        totalReviews,
        hasTitle: !!mentor.title,
        hasBio: !!mentor.bio && mentor.bio.length >= 50,
        hasDomains: Array.isArray(mentor.domains) && mentor.domains.length > 0,
        hasSkills: Array.isArray(mentor.skills) && mentor.skills.length > 0,
        isVerified: !!mentor.verification?.isVerified,
      };

      const newTrustScore = TrustScoreCalculator.calculate(metrics);

      // Persist without mutating unrelated fields
      await mentorRepository.updateByMentorId(mentorId, { trustScore: newTrustScore });

      console.info(`[TrustScore] Recalculated for Mentor ${mentorId}: Overall ${newTrustScore.overall}`);
      return newTrustScore;
    } catch (error) {
      console.error(`[TrustScore] Error recalculating for mentor ${mentorId}:`, error);
      // We do not throw because we don't want to crash event listeners.
      return null;
    }
  }
}

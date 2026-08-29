import { ITrustScore, TrustScoreMetrics } from '../interface/trustScore.types';
import { TRUST_SCORE_VERSION, TRUST_SCORE_WEIGHTS } from './trustScore.constants';

export class TrustScoreCalculator {
  /**
   * Pure mathematical calculation engine for computing scores with safe fallbacks.
   */
  public static calculate(metrics: TrustScoreMetrics): ITrustScore {
    const profileCompleteness = this.calculateProfileCompleteness(metrics);
    const reliability = this.calculateReliability(metrics);
    const studentSatisfaction = this.calculateStudentSatisfaction(metrics);
    const engagement = this.calculateEngagement(metrics);

    const overall = Math.round(
      profileCompleteness * TRUST_SCORE_WEIGHTS.PROFILE_COMPLETENESS +
      reliability * TRUST_SCORE_WEIGHTS.RELIABILITY +
      studentSatisfaction * TRUST_SCORE_WEIGHTS.STUDENT_SATISFACTION +
      engagement * TRUST_SCORE_WEIGHTS.ENGAGEMENT
    );

    return {
      overall: Math.min(Math.max(overall, 0), 100), // Clamp 0-100
      breakdown: {
        profileCompleteness,
        reliability,
        studentSatisfaction,
        engagement,
      },
      metrics: {
        totalCompletedSessions: metrics.completedSessions,
        totalCancelledSessions: metrics.cancelledSessions,
        averageRating: metrics.averageRating,
        reviewCount: metrics.totalReviews,
      },
      version: TRUST_SCORE_VERSION,
      lastCalculatedAt: new Date(),
    };
  }

  private static calculateProfileCompleteness(metrics: TrustScoreMetrics): number {
    let score = 0;
    const totalFields = 5;
    
    if (metrics.hasTitle) score++;
    if (metrics.hasBio) score++;
    if (metrics.hasDomains) score++;
    if (metrics.hasSkills) score++;
    if (metrics.isVerified) score++;
    
    return Math.round((score / totalFields) * 100);
  }

  private static calculateReliability(metrics: TrustScoreMetrics): number {
    if (metrics.totalSessions === 0) return 100; // Safe default for new mentors

    const completionRate = metrics.completedSessions / metrics.totalSessions;
    return Math.round(completionRate * 100);
  }

  private static calculateStudentSatisfaction(metrics: TrustScoreMetrics): number {
    if (metrics.totalReviews === 0) return 100; // Safe neutral default

    // Rating is out of 5, convert to 100-point scale
    const percentage = (metrics.averageRating / 5) * 100;
    return Math.round(Math.max(percentage, 0));
  }

  private static calculateEngagement(metrics: TrustScoreMetrics): number {
    // Basic engagement model based on session volume
    if (metrics.completedSessions >= 50) return 100;
    if (metrics.completedSessions >= 20) return 80;
    if (metrics.completedSessions >= 5) return 50;
    if (metrics.completedSessions > 0) return 20;
    
    return 0; // No engagement yet
  }
}

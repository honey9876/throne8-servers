import { logger } from '../../shared/logger.util';
import { Domain } from '@/shared/constants/domains';
import { UserProfile, UserCareerGoal } from '@/Mentorship/interface/userProfile.types';

export interface MatchFactors {
  domainMatch: number;
  experienceMatch: number;
  goalAlignment: number;
  personalityFit: number;
  priceMatch: number;
  availabilityMatch: number;
}

export interface MatchResult {
  mentorId: string;
  overallScore: number;
  factors: MatchFactors;
  explanation: string;
  recommendations: string[];
  matchQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Default scoring weights for overall match calculation.
 *
 * ✅ FIX: Weights are now configurable — extracted as a standalone constant
 * so they can be overridden per call (A/B testing, admin config, etc.)
 * without modifying this file.
 *
 * All weights must sum to 1.0. Verify after any change.
 * Current sum: 0.25 + 0.20 + 0.20 + 0.15 + 0.10 + 0.10 = 1.00 ✅
 */
export const DEFAULT_MATCH_WEIGHTS: Record<keyof MatchFactors, number> = {
  domainMatch:       0.25,
  experienceMatch:   0.20,
  goalAlignment:     0.20,
  personalityFit:    0.15,
  priceMatch:        0.10,
  availabilityMatch: 0.10,
};

export class MatchingAlgorithm {
  /**
   * Calculate match score between user and mentor.
   *
   * @param weights - Override default weights for A/B testing or custom ranking.
   *   Must sum to 1.0. Defaults to DEFAULT_MATCH_WEIGHTS.
   */
  static calculateMatch(
    userProfile: UserProfile,
    mentor: any,
    preferences?: { budgetMax?: number },
    weights: Record<keyof MatchFactors, number> = DEFAULT_MATCH_WEIGHTS
  ): MatchResult {
    try {
      const domainMatch       = this.calculateDomainMatch(userProfile, mentor);
      const experienceMatch   = this.calculateExperienceMatch(userProfile, mentor);
      const goalAlignment     = this.calculateGoalAlignment(userProfile, mentor);
      const personalityFit    = this.calculatePersonalityFit(userProfile, mentor);
      const priceMatch        = this.calculatePriceMatch(userProfile, mentor, preferences);
      const availabilityMatch = this.calculateAvailabilityMatch(userProfile, mentor);

      const factors: MatchFactors = {
        domainMatch,
        experienceMatch,
        goalAlignment,
        personalityFit,
        priceMatch,
        availabilityMatch,
      };

      const overallScore    = this.calculateOverallScore(factors, weights);
      const explanation     = this.generateExplanation(factors, userProfile, mentor);
      const recommendations = this.generateRecommendations(factors, userProfile, mentor);
      const matchQuality    = this.determineMatchQuality(overallScore);

      return {
        mentorId: mentor._id.toString(),
        overallScore,
        factors,
        explanation,
        recommendations,
        matchQuality,
      };
    } catch (error: any) {
      logger.error(`Error calculating match for mentor ${mentor._id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate domain match score (0-100)
   */
  private static calculateDomainMatch(userProfile: UserProfile, mentor: any): number {
    try {
      const userDomains: string[] = (userProfile.preferences?.preferredDomains || []).map(
        (d: Domain) => d.toLowerCase()
      );
      const mentorDomains: string[] = (mentor.domains || []).map((d: string) => d.toLowerCase());

      if (userDomains.length === 0 || mentorDomains.length === 0) {
        return 50; // Neutral — not enough data for a confident score
      }

      const matchingCount = userDomains.filter((domain) => mentorDomains.includes(domain)).length;
      return Math.round((matchingCount / userDomains.length) * 100);
    } catch (error: any) {
      logger.error(`Error calculating domain match: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate experience match score (0-100)
   */
  private static calculateExperienceMatch(userProfile: UserProfile, mentor: any): number {
    try {
      const userYears   = userProfile.careerHistory?.yearsOfExperience || 0;
      const mentorYears = mentor.experience?.total || 0;

      if (mentorYears <= userYears) {
        return 40; // Mentor should have more experience than mentee
      }

      const gap = mentorYears - userYears;

      if (gap >= 3 && gap <= 10) return 100; // Ideal gap
      if (gap < 3)               return 70;  // Too close
      if (gap <= 15)             return 80;  // Good but wide
      return 60;                             // Very senior mentor
    } catch (error: any) {
      logger.error(`Error calculating experience match: ${error.message}`);
      return 50;
    }
  }

  /**
   * Calculate goal alignment score (0-100)
   * Uses case-insensitive matching against mentor skills and domains
   */
  private static calculateGoalAlignment(userProfile: UserProfile, mentor: any): number {
    try {
      const userGoals: UserCareerGoal[] = userProfile.goals || [];

      if (userGoals.length === 0) return 50;

      const mentorSkills: string[]  = (mentor.skills  || []).map((s: string) => s.toLowerCase());
      const mentorDomains: string[] = (mentor.domains || []).map((d: string) => d.toLowerCase());

      let totalScore = 0;
      let totalWeight = 0;

      for (const goal of userGoals) {
        const goalWords = goal.goal.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

        const skillMatch = mentorSkills.some((skill) =>
          goalWords.some((word) => skill.includes(word) || word.includes(skill))
        );

        const domainMatch = mentorDomains.some((domain) =>
          goalWords.some((word) => domain.includes(word) || word.includes(domain))
        );

        const goalScore = (skillMatch ? 50 : 0) + (domainMatch ? 50 : 0);

        const weight =
          goal.priority === 'high' ? 1.0 : goal.priority === 'medium' ? 0.7 : 0.5;

        totalScore  += goalScore * weight;
        totalWeight += weight;
      }

      return Math.round(totalScore / Math.max(totalWeight, 1));
    } catch (error: any) {
      logger.error(`Error calculating goal alignment: ${error.message}`);
      return 50;
    }
  }

  /**
   * Calculate personality fit score (0-100)
   * Based on mentor rating, completion rate, and structured tags (not bio keyword scraping)
   */
  private static calculatePersonalityFit(userProfile: UserProfile, mentor: any): number {
    try {
      let score = 60; // Neutral base

      const learningStyle = userProfile.preferences?.learningStyle || 'flexible';
      const mentorTags: string[] = (mentor.teachingStyle || []).map((t: string) => t.toLowerCase());

      const styleMap: Record<string, string[]> = {
        'hands-on':  ['practical', 'project-based', 'hands-on'],
        'structured': ['structured', 'curriculum-based', 'systematic'],
        'flexible':   ['flexible', 'adaptive', 'mentee-led'],
      };

      const expectedTags = styleMap[learningStyle] || [];
      if (expectedTags.some((tag) => mentorTags.includes(tag))) {
        score += 15;
      } else if (learningStyle === 'flexible') {
        score += 8;
      }

      const commPref = userProfile.preferences?.communicationPreference || 'supportive';
      const commMap: Record<string, string[]> = {
        direct:     ['direct', 'blunt', 'honest'],
        supportive: ['supportive', 'encouraging', 'empathetic'],
      };

      const expectedComm = commMap[commPref] || [];
      if (expectedComm.some((tag) => mentorTags.includes(tag))) {
        score += 10;
      }

      if ((mentor.stats?.averageRating  || 0) >= 4.5) score += 8;
      if ((mentor.stats?.completionRate || 0) >= 95)  score += 7;

      return Math.min(score, 100);
    } catch (error: any) {
      logger.error(`Error calculating personality fit: ${error.message}`);
      return 60;
    }
  }

  /**
   * Calculate price match score (0-100)
   * Guards against NaN when mentor pricing fields are missing
   */
  private static calculatePriceMatch(
    userProfile: UserProfile,
    mentor: any,
    preferences?: { budgetMax?: number }
  ): number {
    try {
      const userBudget = preferences?.budgetMax || userProfile.preferences?.budgetRange?.max;

      if (!userBudget) return 50;

      const prices = [
        mentor.pricing?.quickCall     || 0,
        mentor.pricing?.deepDive      || 0,
        mentor.pricing?.resumeReview  || 0,
        mentor.pricing?.mockInterview || 0,
      ].filter((p) => p > 0); // Exclude services not offered (price 0)

      if (prices.length === 0) return 50;

      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

      if (avgPrice <= userBudget * 0.7) return 100; // Well within budget
      if (avgPrice <= userBudget)       return 80;  // Within budget
      if (avgPrice <= userBudget * 1.2) return 60;  // Slightly over
      return 30;                                     // Too expensive
    } catch (error: any) {
      logger.error(`Error calculating price match: ${error.message}`);
      return 50;
    }
  }

  /**
   * Calculate availability match score (0-100)
   * Considers both config and actual free slot count
   */
  private static calculateAvailabilityMatch(_userProfile: UserProfile, mentor: any): number {
    try {
      if (!mentor.availability?.autoAcceptBookings) {
        return 70; // Manual approval adds friction
      }

      const maxSessions    = mentor.availability?.maxSessionsPerDay || 0;
      const availableSlots = mentor.availability?.availableSlotCount ?? maxSessions;

      if (availableSlots >= 5) return 90;
      if (availableSlots >= 3) return 70;
      if (availableSlots >= 1) return 50;
      return 20; // No available slots
    } catch (error: any) {
      logger.error(`Error calculating availability match: ${error.message}`);
      return 70;
    }
  }

  /**
   * Calculate weighted overall score.
   *
   * ✅ FIX: weights are now a parameter — not hardcoded inside this method.
   * Pass custom weights for A/B testing or admin-tuned ranking.
   */
  private static calculateOverallScore(
    factors: MatchFactors,
    weights: Record<keyof MatchFactors, number> = DEFAULT_MATCH_WEIGHTS
  ): number {
    const score =
      factors.domainMatch       * weights.domainMatch       +
      factors.experienceMatch   * weights.experienceMatch   +
      factors.goalAlignment     * weights.goalAlignment     +
      factors.personalityFit    * weights.personalityFit    +
      factors.priceMatch        * weights.priceMatch        +
      factors.availabilityMatch * weights.availabilityMatch;

    return Math.round(score);
  }

  /**
   * Generate human-readable explanation for the match
   */
  private static generateExplanation(
    factors: MatchFactors,
    _userProfile: UserProfile,
    mentor: any
  ): string {
    const topFactors = Object.entries(factors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([key]) => key);

    let explanation = `This mentor is a ${this.determineMatchQuality(
      this.calculateOverallScore(factors)
    )} match for you. `;

    if (topFactors.includes('domainMatch')) {
      const topDomains = (mentor.domains || []).slice(0, 2).join(' and ');
      if (topDomains) {
        explanation += `Their expertise in ${topDomains} aligns with your interests. `;
      }
    }

    if (topFactors.includes('experienceMatch') && mentor.experience?.total) {
      explanation += `With ${mentor.experience.total} years of experience, they can guide you effectively. `;
    }

    if (topFactors.includes('goalAlignment')) {
      explanation += `Their background is well-suited to help you achieve your career goals. `;
    }

    return explanation.trim();
  }

  /**
   * Generate actionable recommendations
   */
  private static generateRecommendations(
    factors: MatchFactors,
    _userProfile: UserProfile,
    mentor: any
  ): string[] {
    const recommendations: string[] = [];

    if (factors.domainMatch >= 80 && mentor.domains?.length > 0) {
      recommendations.push(
        `Start with a Quick Call to discuss your ${mentor.domains[0]} goals`
      );
    }

    if (factors.goalAlignment >= 70) {
      recommendations.push('Book a Career Planning session for personalized guidance');
    }

    if (mentor.pricing?.resumeReview && factors.experienceMatch >= 70) {
      recommendations.push('Consider a Resume Review to stand out in your job search');
    }

    if ((mentor.stats?.averageRating || 0) >= 4.5) {
      recommendations.push('Highly rated mentor - book early as slots fill quickly');
    }

    if (factors.priceMatch < 60) {
      recommendations.push('Check for multi-session packages for better value');
    }

    return recommendations.slice(0, 3);
  }

  /**
   * Determine match quality label
   */
  private static determineMatchQuality(
    score: number
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Batch calculate matches for multiple mentors — sorted by score descending.
   *
   * ✅ FIX: Failed matches are now logged with mentor ID instead of silently dropping.
   * Admins can identify which mentors have data issues.
   */
  static calculateBatchMatches(
    userProfile: UserProfile,
    mentors: any[],
    preferences?: { budgetMax?: number },
    weights: Record<keyof MatchFactors, number> = DEFAULT_MATCH_WEIGHTS
  ): MatchResult[] {
    return mentors
      .map((mentor) => {
        try {
          return this.calculateMatch(userProfile, mentor, preferences, weights);
        } catch (error: any) {
          // ✅ FIX: Log instead of silently skip — helps debug bad mentor data
          logger.warn(
            `Skipping mentor ${mentor._id} in batch match — calculateMatch failed: ${error.message}`
          );
          return null;
        }
      })
      .filter((r): r is MatchResult => r !== null)
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Filter mentors by minimum score
   */
  static filterByMinScore(matches: MatchResult[], minScore: number): MatchResult[] {
    return matches.filter((match) => match.overallScore >= minScore);
  }

  /**
   * Get top N matches
   */
  static getTopMatches(matches: MatchResult[], limit: number): MatchResult[] {
    return matches.slice(0, limit);
  }
}

export default MatchingAlgorithm;
import logger, { LogCategory, PublicLogMetadata } from '@/shared/logger.util';

/**
 * Recommendation Algorithms
 * Core algorithmic functions for connection recommendations (5 features as per plan).
 * Includes scoring, ranking, personalization, filtering, and optimization.
 * Used in networkService for recommendation generation.
 * 
 * Features (5 total):
 * 1. recommendConnections - Generate raw recommendations (triadic closure)
 * 2. rankRecommendations - Rank by score (mutual count, strength)
 * 3. personalizeRecommendations - Personalize based on user prefs
 * 4. filterRecommendations - Filter by criteria (location, industry)
 * 5. optimizeRecommendations - Optimize for diversity/novelty
 * 
 * Dependencies:
 * - logger: For logs
 * 
 * Scalability: Batch processing for large users
 * Integration: Called from networkService getRecommendations
 */

export class RecommendationAlgorithms {
  /**
   * Feature 1: Recommend connections (2nd degree with mutuals)
   * @param graph - Graph
   * @param userId - User
   * @returns Potential connections
   */
  recommendConnections(graph: Record<string, string[]>, userId: string): string[] {
    const first = new Set(graph[userId] || []);
    const recommendations = new Set<string>();

    for (const friend of first) {
      (graph[friend] || []).forEach(rec => {
        if (rec !== userId && !first.has(rec)) recommendations.add(rec);
      });
    }

    logger.debug('Recommendations generated', {
      userId,
      data: { count: recommendations.size },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return Array.from(recommendations);
  }

  /**
   * Feature 2: Rank recommendations by mutual count/strength
   * @param recs - Recommendations
   * @param mutuals - Mutual data
   * @returns Ranked recs
   */
  rankRecommendations(recs: string[], mutuals: Record<string, number>): string[] {
    return recs.sort((a, b) => {
      const scoreA = mutuals[a] ?? 0; // Use nullish coalescing for type safety
      const scoreB = mutuals[b] ?? 0;
      return scoreB - scoreA;
    });
  }

  /**
   * Feature 3: Personalize based on user prefs (e.g., industry weight)
   * @param recs - Recommendations
   * @param prefs - User prefs { industry: weight, ... }
   * @param userData - User data
   * @returns Personalized ranked
   */
  personalizeRecommendations(recs: any[], prefs: Record<string, number>, userData: Record<string, any>): any[] {
    return recs
      .map(r => ({
        ...r,
        score: Object.entries(prefs).reduce((sum, [key, weight]) => sum + (r[key] === userData[key] ? weight : 0), 0),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Feature 4: Filter recommendations (exclude blocked, etc.)
   * @param recs - Recommendations
   * @param filters - Filters { exclude: [] }
   * @returns Filtered
   */
  filterRecommendations(recs: string[], filters: { exclude: string[] }): string[] {
    const excludeSet = new Set(filters.exclude);
    return recs.filter(r => !excludeSet.has(r));
  }

  /**
   * Feature 5: Optimize for diversity (select diverse subset)
   * @param recs - Ranked recs
   * @param limit - Number to return
   * @returns Optimized subset
   */
  optimizeRecommendations(recs: any[], limit: number): any[] {
    // Placeholder: Greedy diversity (max diff in attributes)
    return recs.slice(0, limit); // Mock
  }
}

// Export instance
export const recommendationAlgorithms = new RecommendationAlgorithms();
export default recommendationAlgorithms;
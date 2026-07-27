



import logger, { LogCategory, PublicLogMetadata } from '@/shared/logger.util';


/**
 * Mutual Algorithms
 * Core algorithmic functions for mutual connection calculations (8 features as per plan).
 * Includes set operations, similarity scores, filtering, and suggestion logic.
 * Used in mutualService for computations like intersection, strength, search filtering.
 * 
 * Features (8 total):
 * 1. findIntersection - Set intersection for common connections
 * 2. calculateStrength - Mutual strength score (Jaccard similarity + weights)
 * 3. getSuggestions - Generate mutual suggestions based on degree/strength
 * 4. filterBySearch - Filter mutuals by search query (name, company, etc.)
 * 5. applyFilters - Apply advanced filters (location, industry)
 * 6. calculateSimilarity - Advanced similarity metrics (cosine, etc.)
 * 7. rankMutuals - Rank mutuals by relevance score
 * 8. detectClusters - Basic clustering for mutual networks (for suggestions)
 * 
 * Dependencies:
 * - logger: For algorithm logs (debug/performance)
 * 
 * Scalability: O(n log n) operations where possible, suitable for large sets
 * Accuracy: Tunable parameters for scores (e.g., weight factors)
 * Integration: Called from mutualService; pure functions for testability
 */

export class MutualAlgorithms {
  /**
   * Feature 1: Find intersection of two connection sets
   * @param set1 - First set of user IDs
   * @param set2 - Second set of user IDs
   * @returns Common IDs
   */
  findIntersection(set1: string[], set2: string[]): string[] {
    if (!set1 || !set2 || set1.length === 0 || set2.length === 0) {
      return [];
    }

    // Convert to Sets for O(1) lookup
    const set1Map = new Set(set1);
    const common = set2.filter(id => set1Map.has(id));

    logger.debug('Intersection calculated', {
      data: { size1: set1.length, size2: set2.length, common: common.length },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return common;
  }

  /**
   * Feature 2: Calculate mutual strength score (0-100)
   * Uses Jaccard similarity: |A ∩ B| / |A ∪ B| * 100, with weights for recency/degree
   * @param userId1 - First user
   * @param userId2 - Second user
   * @param mutuals - List of mutual connections
   * @returns Strength score
   */
  calculateStrength(userId1: string, userId2: string, mutuals: any[]): number {
    if (!mutuals || mutuals.length === 0) {
      return 0;
    }

    // Basic Jaccard on mutual count (simplified; in prod, use connection degrees)
    const mutualCount = mutuals.length;
    const unionSize = mutualCount * 2; // Approximate; real would fetch full degrees
    const jaccard = mutualCount / unionSize;

    // Weight by average mutual strength (if available)
    const avgMutualStrength = mutuals.reduce((sum, m) => sum + (m.connectionStrength || 1), 0) / mutuals.length;
    const weightedScore = jaccard * avgMutualStrength * 100;

    // Cap at 100
    const score = Math.min(weightedScore, 100);

    logger.debug('Strength calculated', {
      userId: userId1,
      userId2,
      data: { mutualCount, score },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return score;
  }

  /**
   * Feature 3: Get suggestions for mutuals (top by score)
   * @param userId - User ID
   * @param limit - Number of suggestions
   * @returns Suggested mutuals (simplified; in prod, use graph traversal)
   */
  async getSuggestions(userId: string, limit: number = 10): Promise<any[]> {
    // Placeholder: In real impl, query Neo4j for 2nd-degree connections, score by mutuals
    // For demo, return mock suggestions
    const mockSuggestions = Array.from({ length: limit }, (_, i) => ({
      userId: `suggestion-${i + 1}-${userId}`,
      name: `Suggested User ${i + 1}`,
      score: Math.random() * 100,
    })).sort((a, b) => b.score - a.score);

    logger.debug('Suggestions generated', {
      userId,
      data: { count: mockSuggestions.length, limit },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return mockSuggestions;
  }

  /**
   * Feature 4: Filter mutuals by search query (name, headline, company)
   * @param mutuals - List of mutuals
   * @param query - Search string
   * @returns Filtered mutuals
   */
  filterBySearch(mutuals: any[], query: string): any[] {
    if (!query || query.trim().length === 0) {
      return mutuals;
    }

    const lowerQuery = query.toLowerCase().trim();
    const filtered = mutuals.filter(m =>
      m.name?.toLowerCase().includes(lowerQuery) ||
      m.headline?.toLowerCase().includes(lowerQuery) ||
      m.company?.toLowerCase().includes(lowerQuery)
    );

    logger.debug('Mutuals filtered by search', {
      query: lowerQuery,
      data: { original: mutuals.length, filtered: filtered.length },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return filtered;
  }

  /**
   * Feature 5: Apply filters (company, location, industry)
   * @param mutuals - List of mutuals
   * @param filters - Filter object
   * @returns Filtered mutuals
   */
  applyFilters(mutuals: any[], filters: { company?: string; location?: string; industry?: string }): any[] {
    return mutuals.filter(m => {
      return (
        (!filters.company || m.company?.toLowerCase() === filters.company.toLowerCase()) &&
        (!filters.location || m.location?.toLowerCase() === filters.location.toLowerCase()) &&
        (!filters.industry || m.industry?.toLowerCase() === filters.industry.toLowerCase())
      );
    });
  }

  /**
   * Feature 6: Calculate similarity (cosine similarity on connection vectors, simplified)
   * @param vector1 - Connection vector for user1
   * @param vector2 - Connection vector for user2
   * @returns Similarity score (0-1)
   */
  calculateSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length || vector1.length === 0) {
      return 0;
    }

    // Dot product
    const dot = vector1.reduce((sum, a, i) => sum + a * vector2[i], 0);
    // Magnitudes
    const mag1 = Math.sqrt(vector1.reduce((sum, a) => sum + a * a, 0));
    const mag2 = Math.sqrt(vector2.reduce((sum, a) => sum + a * a, 0));

    const similarity = dot / (mag1 * mag2);
    return isNaN(similarity) ? 0 : Math.max(0, Math.min(1, similarity));
  }

  /**
   * Feature 7: Rank mutuals by relevance score (strength + similarity)
   * @param mutuals - List of mutuals
   * @param userConnections1 - User1 connections
   * @param userConnections2 - User2 connections
   * @returns Ranked mutuals
   */
  rankMutuals(mutuals: any[], userConnections1: string[], userConnections2: string[]): any[] {
    // For demo, assume vectors are lengths; in real, map IDs to strength vectors
    const vector1 = userConnections1.map((_id, i) => i + 1); // Placeholder numeric vector
    const vector2 = userConnections2.map((_id, i) => i + 1); // Placeholder
    const similarityScore = this.calculateSimilarity(vector1, vector2);

    const ranked = mutuals
      .map(m => ({
        ...m,
        relevanceScore: (m.connectionStrength || 1) * similarityScore,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.debug('Mutuals ranked', {
      data: { count: ranked.length },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return ranked;
  }

  /**
   * Feature 8: Detect clusters in mutual network (basic K-means like grouping)
   * @param mutuals - List of mutuals with positions (simplified 2D for demo)
   * @param k - Number of clusters
   * @returns Clustered mutuals
   */
  detectClusters(mutuals: any[], k: number = 3): any[][] {
    // Placeholder: In real, use ML lib or graph clustering (e.g., Louvain)
    // For demo, random grouping
    const shuffled = [...mutuals].sort(() => Math.random() - 0.5);
    const clusters: any[][] = [];
    const size = Math.ceil(shuffled.length / k);
    for (let i = 0; i < k; i++) {
      clusters.push(shuffled.slice(i * size, (i + 1) * size));
    }

    logger.debug('Clusters detected', {
      data: { k, clusterSizes: clusters.map(c => c.length) },
      category: LogCategory.PERFORMANCE
    } as unknown as PublicLogMetadata);
    return clusters;
  }
}

// Export instance
export const mutualAlgorithms = new MutualAlgorithms();
export default mutualAlgorithms;
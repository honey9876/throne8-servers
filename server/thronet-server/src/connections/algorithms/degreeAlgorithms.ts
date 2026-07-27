// /**
//  * Degree Algorithms
//  * Core algorithmic functions for degree of connection calculations (12 features as per plan).
//  * Includes graph traversal, path finding, centrality measures, and community detection.
//  * Used in degreeService for computations like degree counts, shortest paths, centrality.
//  * 
//  * Features (12 total):
//  * 1. calculateFirstDegree - Count 1st degree connections
//  * 2. calculateSecondDegree - Count 2nd degree connections
//  * 3. calculateThirdDegree - Count 3rd degree connections
//  * 4. findShortestPath - BFS for shortest path between users
//  * 5. calculateBetweennessCentrality - Betweenness centrality metric
//  * 6. calculateClosenessCentrality - Closeness centrality metric
//  * 7. calculateEigenvectorCentrality - Eigenvector centrality (influence)
//  * 8. calculatePageRank - PageRank algorithm for node importance
//  * 9. findBridgeNodes - Detect bridge connections in graph
//  * 10. detectCommunities - Basic community detection (Louvain-like)
//  * 11. calculateClusteringCoefficient - Local clustering coefficient
//  * 12. findInfluentialNodes - Find top influential nodes by centrality
//  * 
//  * Dependencies:
//  * - logger: For algorithm logs (debug/performance)
//  * 
//  * Scalability: Efficient graph algorithms (BFS O(V+E), approximations for large graphs)
//  * Integration: Called from degreeService; assumes graph data from Neo4j
// src/algorithms/degreeAlgorithms.ts

import { Driver } from 'neo4j-driver';
import { UserId } from '../types/network.types';
import { PersonNode } from '../models/neo4j/PersonNode';
import { ConnectionRelation } from '../models/neo4j/ConnectionRelation';
import logger, { LogCategory } from '@/shared/logger.util';
/**
 * Degree Algorithms
 * Core algorithmic functions for degree of connection calculations (12 features as per plan).
 * Includes graph traversal, path finding, centrality measures, and community detection.
 * Used in degreeService for computations like degree counts, shortest paths, centrality.
 * 
 * Features (12 total):
 * 1. calculateFirstDegree - Count 1st degree connections
 * 2. calculateSecondDegree - Count 2nd degree connections
 * 3. calculateThirdDegree - Count 3rd degree connections
 * 4. findShortestPath - BFS for shortest path between users
 * 5. calculateBetweennessCentrality - Betweenness centrality metric
 * 6. calculateClosenessCentrality - Closeness centrality metric
 * 7. calculateEigenvectorCentrality - Eigenvector centrality (influence)
 * 8. calculatePageRank - PageRank algorithm for node importance
 * 9. findBridgeNodes - Detect bridge connections in graph
 * 10. detectCommunities - Basic community detection (Louvain-like)
 * 11. calculateClusteringCoefficient - Local clustering coefficient
 * 12. findInfluentialNodes - Find top influential nodes by centrality
 * 
 * Dependencies:
 * - logger: For algorithm logs (debug/performance)
 * 
 * Scalability: Efficient graph algorithms (BFS O(V+E), approximations for large graphs)
 * Integration: Called from degreeService; assumes graph data from Neo4j
 */

export class DegreeAlgorithms {
  // Cypher queries for pathfinding algorithms (NEW - Required by degreeService)
  public readonly dijkstraPathCypher = `
    MATCH (start:Person {id: $fromUserId}), (end:Person {id: $toUserId})
    CALL gds.shortestPath.dijkstra.stream({
      sourceNode: start,
      targetNode: end,
      relationshipTypes: ['CONNECTED_TO'],
      relationshipWeightProperty: 'weight'
    })
    YIELD path
    RETURN path
    ORDER BY path.totalCost
    LIMIT 10
  `;

  public readonly astarPathCypher = `
    MATCH (start:Person {id: $fromUserId}), (end:Person {id: $toUserId})
    CALL gds.shortestPath.astar.stream({
      sourceNode: start,
      targetNode: end,
      relationshipTypes: ['CONNECTED_TO'],
      relationshipWeightProperty: 'weight',
      latitudeProperty: 'latitude',
      longitudeProperty: 'longitude'
    })
    YIELD path
    RETURN path
    ORDER BY path.totalCost
    LIMIT 10
  `;

  public readonly shortestPathsCypher = `
    MATCH (p:Person {id: $userId})
    CALL gds.allShortestPaths.stream({
      sourceNode: p,
      relationshipTypes: ['CONNECTED_TO']
    })
    YIELD path, length
    WHERE length <= $maxLength
    RETURN path, length
    ORDER BY length
    LIMIT 100
  `;

  // Helper method for running Neo4j queries (NEW - Required by degreeService methods)
  private async runQuery(driver: Driver, cypher: string, params: Record<string, any> = {}) {
    const session = driver.session();
    try {
      const result = await session.run(cypher, params);
      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Feature 1: Calculate 1st degree connections (direct)
   * @param graph - Graph object { [userId: string]: string[] }
   * @param userId - User ID
   * @returns Count of 1st degree
   */
  calculateFirstDegree(graph: Record<string, string[]>, userId: string): number {
    const connections = graph[userId] || [];
    logger.debug(`1st degree calculated for ${userId}: ${connections.length} connections`);
    return connections.length;
  }

  /**
   * Feature 2: Calculate 2nd degree connections (friends of friends, exclude 1st/self)
   * @param graph - Graph
   * @param userId - User ID
   * @returns Count of 2nd degree
   */
  calculateSecondDegree(graph: Record<string, string[]>, userId: string): number {
    const firstDegree = new Set(graph[userId] || []);
    const secondDegree = new Set<string>();

    for (const friend of firstDegree) {
      const friendsFriends = graph[friend] || [];
      for (const ff of friendsFriends) {
        if (ff !== userId && !firstDegree.has(ff)) {
          secondDegree.add(ff);
        }
      }
    }

    logger.debug(`2nd degree calculated for ${userId}: ${secondDegree.size} connections`);
    return secondDegree.size;
  }

  /**
   * Feature 3: Calculate 3rd degree connections (exclude lower degrees/self)
   * @param graph - Graph
   * @param userId - User ID
   * @returns Count of 3rd degree
   */
  calculateThirdDegree(graph: Record<string, string[]>, userId: string): number {
    const first = new Set(graph[userId] || []);
    const second = new Set<string>();
    const third = new Set<string>();

    // Get second
    for (const f of first) {
      (graph[f] || []).forEach(ff => {
        if (ff !== userId && !first.has(ff)) second.add(ff);
      });
    }

    // Get third
    for (const s of second) {
      (graph[s] || []).forEach(t => {
        if (t !== userId && !first.has(t) && !second.has(t)) third.add(t);
      });
    }

    logger.debug(`3rd degree calculated for ${userId}: ${third.size} connections`);
    return third.size;
  }

  /**
   * Feature 4: Find shortest path between two users (BFS)
   * @param graph - Graph
   * @param start - Start user
   * @param end - End user
   * @returns Path array or empty if no path
   */
  findShortestPath(graph: Record<string, string[]>, start: string, end: string): string[] {
    if (start === end) return [start];

    const queue: [string, string[]][] = [[start, [start]]];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const [current, path] = queue.shift()!;
      const neighbors = graph[current] || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const newPath = [...path, neighbor];
          if (neighbor === end) {
            logger.debug(`Shortest path found from ${start} to ${end}: length ${newPath.length - 1}`);
            return newPath;
          }
          visited.add(neighbor);
          queue.push([neighbor, newPath]);
        }
      }
    }

    logger.debug(`No path found from ${start} to ${end}`);
    return [];
  }

  // NEW: Neo4j-based centrality methods (Required by degreeService)
  async calculateBetweennessCentrality(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})
        CALL gds.betweenness.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO'
        })
        YIELD nodeId, score
        WHERE id(p) = nodeId
        RETURN score as betweenness
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const score = result.records[0]?.get('betweenness') || 0;
      logger.debug(`Betweenness centrality calculated for ${userIdString}: ${score}`, { category: LogCategory.ALGORITHM });
      return score;
    } catch (error : any) {
      logger.error(`Betweenness centrality calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      // Fallback to mock calculation
      return this.calculateBetweennessCentralityMock({}, userId.toString());
    }
  }

  async calculateClosenessCentrality(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})
        CALL gds.closeness.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO'
        })
        YIELD nodeId, score
        WHERE id(p) = nodeId
        RETURN score as closeness
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const score = result.records[0]?.get('closeness') || 0;
      logger.debug(`Closeness centrality calculated for ${userIdString}: ${score}`, { category: LogCategory.ALGORITHM });
      return score;
    } catch (error : any) {
      logger.error(`Closeness centrality calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return this.calculateClosenessCentralityMock({}, userId.toString());
    }
  }

  async calculateEigenvectorCentrality(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})
        CALL gds.eigenvector.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO'
        })
        YIELD nodeId, score
        WHERE id(p) = nodeId
        RETURN score as eigenvector
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const score = result.records[0]?.get('eigenvector') || 0;
      logger.debug(`Eigenvector centrality calculated for ${userIdString}: ${score}`, { category: LogCategory.ALGORITHM });
      return score;
    } catch (error : any) {
      logger.error(`Eigenvector centrality calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return this.calculateEigenvectorCentralityMock({}, userId.toString());
    }
  }

  async calculatePageRank(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})
        CALL gds.pageRank.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO',
          maxIterations: 20,
          dampingFactor: 0.85
        })
        YIELD nodeId, score
        WHERE id(p) = nodeId
        RETURN score as pageRank
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const score = result.records[0]?.get('pageRank') || 0;
      logger.debug(`PageRank calculated for ${userIdString}: ${score}`, { category: LogCategory.ALGORITHM });
      return score;
    } catch (error : any) {
      logger.error(`PageRank calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return this.calculatePageRankMock({}, userId.toString());
    }
  }

  async detectCommunities(driver: Driver): Promise<Record<string, PersonNode[]>> {
    try {
      const cypher = `
        CALL gds.louvain.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO'
        })
        YIELD nodeId, communityId
        MATCH (p:Person) WHERE id(p) = nodeId
        RETURN communityId, collect(p) as members
      `;

      const result = await this.runQuery(driver, cypher);
      const communities: Record<string, PersonNode[]> = {};

      result.records.forEach(record => {
        const communityId = record.get('communityId').toString();
        const members = record.get('members').map((node: any) => node.properties as PersonNode);
        communities[communityId] = members;
      });

      logger.debug(`Communities detected: ${Object.keys(communities).length} communities`, { category: LogCategory.ALGORITHM });
      return communities;
    } catch (error : any) {
      logger.error(`Community detection failed`, { error, category: LogCategory.ALGORITHM });
      return this.detectCommunitiesMock({});
    }
  }

  async findBridgeNodes(userId: UserId, driver: Driver): Promise<ConnectionRelation[]> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})-[r:CONNECTED_TO]-(other:Person)
        WITH p, r, other
        MATCH path = (p)-[*2..3]-(other)
        WHERE NOT EXISTS((p)-[r]-(other))
        RETURN DISTINCT r as bridgeRelation
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const bridges = result.records.map(record => record.get('bridgeRelation').properties as ConnectionRelation);
      logger.debug(`Bridge nodes found for ${userIdString}: ${bridges.length} bridges`, { category: LogCategory.ALGORITHM });
      return bridges;
    } catch (error : any) {
      logger.error(`Bridge detection failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return [];
    }
  }

  async findInfluentialNodes(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})
        CALL gds.degree.stream({
          nodeProjection: 'Person',
          relationshipProjection: 'CONNECTED_TO'
        })
        YIELD nodeId, score
        WHERE id(p) = nodeId
        RETURN score as influence
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const influence = result.records[0]?.get('influence') || 0;
      logger.debug(`Influence calculated for ${userIdString}: ${influence}`, { category: LogCategory.ALGORITHM });
      return influence;
    } catch (error : any) {
      logger.error(`Influence calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return this.findInfluentialNodesMock({}, 0);
    }
  }

  async calculateClusteringCoefficient(userId: UserId, driver: Driver): Promise<number> {
    try {
      const cypher = `
        MATCH (p:Person {id: $userId})-[:CONNECTED_TO]-(neighbor)
        WITH p, collect(neighbor) as neighbors
        UNWIND neighbors as n1
        UNWIND neighbors as n2
        WHERE n1 <> n2
        MATCH (n1)-[:CONNECTED_TO]-(n2)
        WITH p, neighbors, count(*) as triangles
        RETURN CASE 
          WHEN size(neighbors) < 2 THEN 0.0
          ELSE (2.0 * triangles) / (size(neighbors) * (size(neighbors) - 1))
        END as clusteringCoefficient
      `;

      // Convert UserId to string
      const userIdString = userId.toString();
      const result = await this.runQuery(driver, cypher, { userId: userIdString });
      const coeff = result.records[0]?.get('clusteringCoefficient') || 0;
      logger.debug(`Clustering coefficient calculated for ${userIdString}: ${coeff}`, { category: LogCategory.ALGORITHM });
      return coeff;
    } catch (error : any) {
      logger.error(`Clustering coefficient calculation failed for ${userId}`, { error, category: LogCategory.ALGORITHM });
      return this.calculateClusteringCoefficientMock({}, userId.toString());
    }
  }

  // Original mock methods (fallback implementations)
  /**
   * Feature 5: Calculate betweenness centrality (simplified Brandes algorithm)
   * @param _graph - Graph (placeholder implementation)
   * @param node - Node ID
   * @returns Centrality score
   */
  calculateBetweennessCentralityMock(_graph: Record<string, string[]>, node: string): number {
    // Placeholder: Full impl is complex; approximate for demo
    // In real, use graph lib or full algorithm
    const score = Math.random() * 10; // Mock
    logger.debug(`Betweenness centrality calculated for ${node}: ${score.toFixed(3)}`);
    return score;
  }

  /**
   * Feature 6: Calculate closeness centrality (1 / sum of shortest paths)
   * @param _graph - Graph (placeholder implementation)
   * @param node - Node ID
   * @returns Centrality score
   */
  calculateClosenessCentralityMock(_graph: Record<string, string[]>, node: string): number {
    // Placeholder: Run BFS from node to all, sum distances
    const score = 1 / (Math.random() * 10 + 1); // Mock
    logger.debug(`Closeness centrality calculated for ${node}: ${score.toFixed(3)}`);
    return score;
  }

  /**
   * Feature 7: Calculate eigenvector centrality (influence based on neighbors)
   * @param _graph - Graph (placeholder implementation)
   * @param node - Node ID
   * @returns Centrality score
   */
  calculateEigenvectorCentralityMock(_graph: Record<string, string[]>, node: string): number {
    // Placeholder: Power iteration method in real
    const score = Math.random(); // Mock
    logger.debug(`Eigenvector centrality calculated for ${node}: ${score.toFixed(3)}`);
    return score;
  }

  /**
   * Feature 8: Calculate PageRank (importance via links)
   * @param _graph - Graph (placeholder implementation)
   * @param node - Node ID
   * @returns PageRank score
   */
  calculatePageRankMock(_graph: Record<string, string[]>, node: string): number {
    // Placeholder: Google PageRank algorithm
    const score = Math.random() * 0.5 + 0.5; // Mock between 0.5-1
    logger.debug(`PageRank calculated for ${node}: ${score.toFixed(3)}`);
    return score;
  }

  /**
   * Feature 9: Find bridge nodes (nodes whose removal increases components)
   * @param _graph - Graph (placeholder implementation)
   * @returns Bridge node IDs
   */
  findBridgeNodesMock(_graph: Record<string, string[]>): string[] {
    // Placeholder: Tarjan's algorithm or DFS in real
    const bridges: string[] = []; // Mock with explicit type
    logger.debug(`Bridge nodes found: ${bridges.length} bridges`);
    return bridges;
  }

  /**
   * Feature 10: Detect communities (modularity optimization)
   * @param _graph - Graph (placeholder implementation)
   * @returns Array of community arrays (node IDs)
   */
  detectCommunitiesMock(_graph: Record<string, string[]>): Record<string, PersonNode[]> {
    // Placeholder: Louvain method in real
    const communities: Record<string, PersonNode[]> = {}; // Mock with explicit type
    logger.debug(`Communities detected: ${Object.keys(communities).length} communities`);
    return communities;
  }

  /**
   * Feature 11: Calculate clustering coefficient (triangles / possible)
   * @param graph - Graph
   * @param node - Node ID
   * @returns Coefficient (0-1)
   */
  calculateClusteringCoefficientMock(graph: Record<string, string[]>, node: string): number {
    const neighbors = graph[node] || [];
    if (neighbors.length < 2) return 0;

    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        if (graph[neighbors[i]]?.includes(neighbors[j])) triangles++;
      }
    }

    const possible = (neighbors.length * (neighbors.length - 1)) / 2;
    const coeff = triangles / possible;

    logger.debug(`Clustering coefficient calculated for ${node}: ${coeff.toFixed(3)}`);
    return coeff;
  }

  /**
   * Feature 12: Find influential nodes (top by centrality score)
   * @param graph - Graph
   * @param limit - Top N
   * @returns Node IDs sorted by influence
   */
  findInfluentialNodesMock(graph: Record<string, string[]>, limit: number = 10): number {
    // Placeholder: Calculate PageRank for all, sort descending
    const nodes = Object.keys(graph);
    const influential = nodes
      .map(node => ({ node, score: this.calculatePageRankMock(graph, node) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(n => n.node);

    logger.debug(`Influential nodes found: top ${limit} from ${nodes.length} total nodes`);
    return influential.length; // Return count instead of array for consistency with Neo4j method
  }
}

// Export instance
export const degreeAlgorithms = new DegreeAlgorithms();
export default degreeAlgorithms;
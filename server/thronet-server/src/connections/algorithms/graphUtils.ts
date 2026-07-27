// // src/algorithms/graphUtils.ts
// /**
//  * Graph Utilities
//  * Shared utility functions for graph operations in algorithms.
//  * Includes adjacency matrix, distance calc, traversal helpers.
//  * Used across algorithm files for common graph math.
//  * 
//  * Features:
//  * - toAdjacencyMatrix - Convert graph to matrix
//  * - calculateDistance - Euclidean distance (for positions)
//  * - bfsTraversal - BFS generator
//  * - dfsTraversal - DFS generator
//  * - isConnected - Check if graph is connected
//  * - getComponents - Get connected components
//  * 
//  * Dependencies:
//  * - logger: For util logs
//  * 
//  * Integration: Imported by other algorithm files
//  */

// export class GraphUtils {
//   /**
//    * Convert graph to adjacency matrix
//    * @param graph - Graph
//    * @param nodes - Node list
//    * @returns Matrix
//    */
//   toAdjacencyMatrix(graph: Record<string, string[]>, nodes: string[]): number[][] {
//     const matrix = nodes.map(() => nodes.map(() => 0));
//     const nodeIndex = new Map(nodes.map((n, i) => [n, i]));

//     for (const [node, neighbors] of Object.entries(graph)) {
//       const i = nodeIndex.get(node);
//       if (i === undefined) continue;
//       neighbors.forEach(neigh => {
//         const j = nodeIndex.get(neigh);
//         if (j !== undefined) matrix[i][j] = 1;
//       });
//     }

//     logger.debug(`Adjacency matrix created with ${nodes.length} nodes`, { category: LogCategory.ALGORITHM, data: {} });
//     return matrix;
//   }

//   /**
//    * Calculate Euclidean distance (for positioned graphs)
//    * @param pos1 - [x,y]
//    * @param pos2 - [x,y]
//    * @returns Distance
//    */
//   calculateDistance(pos1: [number, number], pos2: [number, number]): number {
//     return Math.sqrt((pos1[0] - pos2[0]) ** 2 + (pos1[1] - pos2[1]) ** 2);
//   }

//   /**
//    * BFS traversal generator
//    * @param graph - Graph
//    * @param start - Start node
//    * @yields Visited nodes
//    */
//   *bfsTraversal(graph: Record<string, string[]>, start: string): Generator<string> {
//     const queue = [start];
//     const visited = new Set<string>([start]);

//     while (queue.length > 0) {
//       const current = queue.shift()!;
//       yield current;
//       (graph[current] || []).forEach(neigh => {
//         if (!visited.has(neigh)) {
//           visited.add(neigh);
//           queue.push(neigh);
//         }
//       });
//     }
//   }

//   /**
//    * DFS traversal generator
//    * @param graph - Graph
//    * @param start - Start node
//    * @yields Visited nodes
//    */
//   *dfsTraversal(graph: Record<string, string[]>, start: string): Generator<string> {
//     const stack = [start];
//     const visited = new Set<string>([start]);

//     while (stack.length > 0) {
//       const current = stack.pop()!;
//       yield current;
//       (graph[current] || []).forEach(neigh => {
//         if (!visited.has(neigh)) {
//           visited.add(neigh);
//           stack.push(neigh);
//         }
//       });
//     }
//   }

//   /**
//    * Check if graph is connected
//    * @param graph - Graph
//    * @param start - Start node
//    * @returns boolean
//    */
//   isConnected(graph: Record<string, string[]>, start: string): boolean {
//     const visitedCount = Array.from(this.bfsTraversal(graph, start)).length;
//     const totalNodes = Object.keys(graph).length;
//     const connected = visitedCount === totalNodes;
//     logger.debug(`Graph connectivity: ${connected ? 'connected' : 'disconnected'} (${visitedCount}/${totalNodes} nodes)`, { category: LogCategory.ALGORITHM, data: { visitedCount, totalNodes } });
//     return connected;
//   }

//   /**
//    * Get connected components
//    * @param graph - Graph
//    * @returns Components arrays
//    */
//   getComponents(graph: Record<string, string[]>): string[][] {
//     const components: string[][] = [];
//     const visited = new Set<string>();
//     const nodes = Object.keys(graph);

//     for (const node of nodes) {
//       if (!visited.has(node)) {
//         const component = Array.from(this.bfsTraversal(graph, node));
//         component.forEach(n => visited.add(n));
//         components.push(component);
//       }
//     }

//     logger.debug(`Found ${components.length} connected components`, { category: LogCategory.ALGORITHM, data: {} });
//     return components;
//   }
// }

// // Export instance
// export const graphUtils = new GraphUtils();
// export default graphUtils;

// 


// src/algorithms/graphUtils.ts
import logger, { LogCategory } from '@/shared/logger.util';

/**
 * Graph Utilities
 * Shared utility functions for graph operations in algorithms.
 * Includes adjacency matrix, distance calc, traversal helpers, and Neo4j Cypher queries.
 * Used across algorithm files for common graph math.
 * 
 * Features:
 * - toAdjacencyMatrix - Convert graph to matrix
 * - calculateDistance - Euclidean distance (for positions)
 * - bfsTraversal - BFS generator
 * - dfsTraversal - DFS generator
 * - isConnected - Check if graph is connected
 * - getComponents - Get connected components
 * - networkDiameterCypher - Cypher query for network diameter (NEW for degreeService)
 * - averageDegreeCypher - Cypher query for average degree (NEW for degreeService)
 * 
 * Dependencies:
 * - logger: For util logs
 * 
 * Integration: Imported by other algorithm files
 */

export class GraphUtils {
  // NEW: Cypher queries for degreeService (Updated to proper GDS syntax)
  public readonly networkDiameterCypher: string = `
    CALL gds.allShortestPaths.stream({
      nodeProjection: 'Person',
      relationshipProjection: 'CONNECTED_TO'
    })
    YIELD distance
    RETURN max(distance) as diameter
  `;

  public readonly averageDegreeCypher: string = `
    MATCH (p:Person)-[r:CONNECTED_TO]-()
    WITH p, count(r) as degree
    RETURN avg(degree) as avgDegree
  `;

  // Additional Cypher queries for degreeService functionality
  public readonly densityCypher: string = `
    MATCH (p:Person)
    WITH count(p) as nodeCount
    MATCH ()-[r:CONNECTED_TO]-()
    WITH nodeCount, count(r)/2 as edgeCount
    RETURN (2.0 * edgeCount) / (nodeCount * (nodeCount - 1)) as density
  `;

  public readonly componentsCypher: string = `
    CALL gds.wcc.stream({
      nodeProjection: 'Person',
      relationshipProjection: 'CONNECTED_TO'
    })
    YIELD componentId
    RETURN count(DISTINCT componentId) as componentCount
  `;

  // Utility Cypher queries
  public readonly nodeExistsCypher: string = `
    MATCH (p:Person {id: $userId})
    RETURN count(p) > 0 as exists
  `;

  public readonly nodeDegreeCypher: string = `
    MATCH (p:Person {id: $userId})-[r:CONNECTED_TO]-()
    RETURN count(r) as degree
  `;

  public readonly commonNeighborsCypher: string = `
    MATCH (p1:Person {id: $userId1})-[:CONNECTED_TO]-(common)-[:CONNECTED_TO]-(p2:Person {id: $userId2})
    WHERE p1 <> p2
    RETURN collect(DISTINCT common) as commonNeighbors
  `;

  /**
   * Convert graph to adjacency matrix
   * @param graph - Graph
   * @param nodes - Node list
   * @returns Matrix
   */
  toAdjacencyMatrix(graph: Record<string, string[]>, nodes: string[]): number[][] {
    const matrix = nodes.map(() => nodes.map(() => 0));
    const nodeIndex = new Map(nodes.map((n, i) => [n, i]));

    for (const [node, neighbors] of Object.entries(graph)) {
      const i = nodeIndex.get(node);
      if (i === undefined) continue;
      neighbors.forEach(neigh => {
        const j = nodeIndex.get(neigh);
        if (j !== undefined) matrix[i][j] = 1;
      });
    }

    logger.debug(`Adjacency matrix created with ${nodes.length} nodes`, { 
      category: LogCategory.ALGORITHM, 
      nodeCount: nodes.length,
      matrixSize: `${nodes.length}x${nodes.length}`
    });
    return matrix;
  }

  /**
   * Calculate Euclidean distance (for positioned graphs)
   * @param pos1 - [x,y]
   * @param pos2 - [x,y]
   * @returns Distance
   */
  calculateDistance(pos1: [number, number], pos2: [number, number]): number {
    const distance = Math.sqrt((pos1[0] - pos2[0]) ** 2 + (pos1[1] - pos2[1]) ** 2);
    logger.debug(`Distance calculated: ${distance.toFixed(2)}`, { 
      category: LogCategory.ALGORITHM,
      from: pos1,
      to: pos2
    });
    return distance;
  }

  /**
   * BFS traversal generator
   * @param graph - Graph
   * @param start - Start node
   * @yields Visited nodes
   */
  *bfsTraversal(graph: Record<string, string[]>, start: string): Generator<string> {
    const queue = [start];
    const visited = new Set<string>([start]);
    let nodeCount = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      yield current;
      nodeCount++;
      
      (graph[current] || []).forEach(neigh => {
        if (!visited.has(neigh)) {
          visited.add(neigh);
          queue.push(neigh);
        }
      });
    }

    logger.debug(`BFS traversal completed from ${start}`, { 
      category: LogCategory.ALGORITHM,
      nodesVisited: nodeCount
    });
  }

  /**
   * DFS traversal generator
   * @param graph - Graph
   * @param start - Start node
   * @yields Visited nodes
   */
  *dfsTraversal(graph: Record<string, string[]>, start: string): Generator<string> {
    const stack = [start];
    const visited = new Set<string>([start]);
    let nodeCount = 0;

    while (stack.length > 0) {
      const current = stack.pop()!;
      yield current;
      nodeCount++;
      
      (graph[current] || []).forEach(neigh => {
        if (!visited.has(neigh)) {
          visited.add(neigh);
          stack.push(neigh);
        }
      });
    }

    logger.debug(`DFS traversal completed from ${start}`, { 
      category: LogCategory.ALGORITHM,
      nodesVisited: nodeCount
    });
  }

  /**
   * Check if graph is connected
   * @param graph - Graph
   * @param start - Start node
   * @returns boolean
   */
  isConnected(graph: Record<string, string[]>, start: string): boolean {
    const visitedNodes = Array.from(this.bfsTraversal(graph, start));
    const visitedCount = visitedNodes.length;
    const totalNodes = Object.keys(graph).length;
    const connected = visitedCount === totalNodes;
    
    logger.debug(`Graph connectivity: ${connected ? 'connected' : 'disconnected'}`, { 
      category: LogCategory.ALGORITHM,
      visitedCount,
      totalNodes,
      connectivity: connected ? 'CONNECTED' : 'DISCONNECTED'
    });
    
    return connected;
  }

  /**
   * Get connected components
   * @param graph - Graph
   * @returns Components arrays
   */
  getComponents(graph: Record<string, string[]>): string[][] {
    const components: string[][] = [];
    const visited = new Set<string>();
    const nodes = Object.keys(graph);

    for (const node of nodes) {
      if (!visited.has(node)) {
        const component = Array.from(this.bfsTraversal(graph, node));
        component.forEach(n => visited.add(n));
        components.push(component);
      }
    }

    logger.debug(`Connected components analysis completed`, { 
      category: LogCategory.ALGORITHM,
      componentCount: components.length,
      largestComponent: Math.max(...components.map(c => c.length)),
      smallestComponent: Math.min(...components.map(c => c.length)),
      totalNodes: nodes.length
    });
    
    return components;
  }

  // Helper method to get graph statistics (NEW - useful for degreeService)
  async getGraphStatistics(): Promise<Record<string, string>> {
    return {
      diameter: this.networkDiameterCypher,
      averageDegree: this.averageDegreeCypher,
      density: this.densityCypher,
      components: this.componentsCypher
    };
  }

  // Additional utility methods for graph analysis
  /**
   * Calculate graph density (edges / possible edges)
   * @param graph - Graph
   * @returns Density value between 0 and 1
   */
  calculateGraphDensity(graph: Record<string, string[]>): number {
    const nodes = Object.keys(graph);
    const nodeCount = nodes.length;
    
    if (nodeCount < 2) return 0;
    
    let edgeCount = 0;
    for (const [_node, neighbors] of Object.entries(graph)) {
      edgeCount += neighbors.length;
    }
    
    // Divide by 2 since each edge is counted twice in undirected graph
    edgeCount = edgeCount / 2;
    
    const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
    const density = edgeCount / maxPossibleEdges;
    
    logger.debug(`Graph density calculated: ${density.toFixed(4)}`, {
      category: LogCategory.ALGORITHM,
      nodeCount,
      edgeCount,
      maxPossibleEdges,
      density
    });
    
    return density;
  }

  /**
   * Find nodes with highest degree
   * @param graph - Graph
   * @param limit - Number of top nodes to return
   * @returns Array of [nodeId, degree] pairs
   */
  getHighestDegreeNodes(graph: Record<string, string[]>, limit: number = 10): Array<[string, number]> {
    const degreeMap = Object.entries(graph).map(([node, neighbors]) => [node, neighbors.length] as [string, number]);
    const sorted = degreeMap.sort((a, b) => b[1] - a[1]).slice(0, limit);
    
    logger.debug(`Highest degree nodes identified`, {
      category: LogCategory.ALGORITHM,
      topNodesCount: sorted.length,
      highestDegree: sorted[0]?.[1] || 0,
      limit
    });
    
    return sorted;
  }

  /**
   * Calculate average path length in graph
   * @param graph - Graph
   * @param sampleSize - Number of random node pairs to sample
   * @returns Average path length
   */
  calculateAveragePathLength(graph: Record<string, string[]>, sampleSize: number = 100): number {
    const nodes = Object.keys(graph);
    if (nodes.length < 2) return 0;
    
    let totalPathLength = 0;
    let validPaths = 0;
    
    // Sample random pairs of nodes
    for (let i = 0; i < Math.min(sampleSize, nodes.length * nodes.length); i++) {
      const start = nodes[Math.floor(Math.random() * nodes.length)];
      const end = nodes[Math.floor(Math.random() * nodes.length)];
      
      if (start !== end) {
        const path = this.findShortestPathBFS(graph, start, end);
        if (path.length > 0) {
          totalPathLength += path.length - 1; // Path length is nodes - 1
          validPaths++;
        }
      }
    }
    
    const avgPathLength = validPaths > 0 ? totalPathLength / validPaths : 0;
    
    logger.debug(`Average path length calculated: ${avgPathLength.toFixed(2)}`, {
      category: LogCategory.ALGORITHM,
      sampleSize,
      validPaths,
      avgPathLength
    });
    
    return avgPathLength;
  }

  /**
   * Helper method for BFS shortest path (used internally)
   * @param graph - Graph
   * @param start - Start node
   * @param end - End node
   * @returns Path as array of nodes
   */
  private findShortestPathBFS(graph: Record<string, string[]>, start: string, end: string): string[] {
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
            return newPath;
          }
          visited.add(neighbor);
          queue.push([neighbor, newPath]);
        }
      }
    }
    
    return []; // No path found
  }

  /**
   * Validate graph structure
   * @param graph - Graph to validate
   * @returns Validation result with issues
   */
  validateGraph(graph: Record<string, string[]>): {
    isValid: boolean;
    issues: string[];
    stats: {
      nodeCount: number;
      edgeCount: number;
      isolatedNodes: number;
      selfLoops: number;
    };
  } {
    const issues: string[] = [];
    const nodes = Object.keys(graph);
    let edgeCount = 0;
    let isolatedNodes = 0;
    let selfLoops = 0;
    
    // Check each node
    for (const [node, neighbors] of Object.entries(graph)) {
      edgeCount += neighbors.length;
      
      // Check for isolated nodes
      if (neighbors.length === 0) {
        isolatedNodes++;
      }
      
      // Check for self loops
      if (neighbors.includes(node)) {
        selfLoops++;
        issues.push(`Self loop detected on node: ${node}`);
      }
      
      // Check for invalid neighbor references
      for (const neighbor of neighbors) {
        if (!graph.hasOwnProperty(neighbor)) {
          issues.push(`Invalid neighbor reference: ${node} -> ${neighbor}`);
        }
      }
    }
    
    const stats = {
      nodeCount: nodes.length,
      edgeCount: edgeCount / 2, // Undirected graph
      isolatedNodes,
      selfLoops
    };
    
    const isValid = issues.length === 0;
    
    logger.debug(`Graph validation completed`, {
      category: LogCategory.ALGORITHM,
      isValid,
      issueCount: issues.length,
      ...stats
    });
    
    return { isValid, issues, stats };
  }
}

// Export instance
export const graphUtils = new GraphUtils();
export default graphUtils;
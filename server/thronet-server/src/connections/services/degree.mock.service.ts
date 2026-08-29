// src/services/degreeService.mock.ts - FOR TESTING PURPOSES
// Create this file temporarily to test your routes

class MockDegreeService {
  
  async calculateConnectionDegrees(userId: string, maxDepth: number = 3) {
    console.log(`Mock: calculateConnectionDegrees called with userId: ${userId}, maxDepth: ${maxDepth}`);
    
    // Return mock degree data
    return {
      userId,
      maxDepth,
      firstDegree: {
        count: 15,
        connections: [
          { userId: '67c19bc7606aa3fb9e346cef', name: 'User One', connectionType: 'friend' },
          { userId: 'mock_user_1', name: 'Mock User 1', connectionType: 'colleague' },
          { userId: 'mock_user_2', name: 'Mock User 2', connectionType: 'friend' }
        ]
      },
      secondDegree: {
        count: maxDepth >= 2 ? 45 : 0,
        connections: maxDepth >= 2 ? [
          { userId: 'mock_user_3', name: 'Mock User 3', connectionType: 'friend' },
          { userId: 'mock_user_4', name: 'Mock User 4', connectionType: 'colleague' }
        ] : []
      },
      thirdDegree: {
        count: maxDepth >= 3 ? 120 : 0,
        connections: maxDepth >= 3 ? [
          { userId: 'mock_user_5', name: 'Mock User 5', connectionType: 'friend' }
        ] : []
      },
      totalConnections: maxDepth >= 3 ? 180 : maxDepth >= 2 ? 60 : 15
    };
  }

  async handlePathFinding(fromUserId: string, toUserId: string, algorithm: 'dijkstra' | 'astar' = 'dijkstra') {
    console.log(`Mock: handlePathFinding called - from: ${fromUserId}, to: ${toUserId}, algorithm: ${algorithm}`);
    
    return {
      fromUserId,
      toUserId,
      algorithm,
      shortestPath: {
        length: 3,
        path: [
          { userId: fromUserId, name: 'User Two' },
          { userId: 'intermediate_user_1', name: 'Intermediate User 1' },
          { userId: 'intermediate_user_2', name: 'Intermediate User 2' },
          { userId: toUserId, name: 'User One' }
        ]
      },
      alternativePaths: [
        {
          length: 4,
          path: [
            { userId: fromUserId, name: 'User Two' },
            { userId: 'alt_user_1', name: 'Alternative User 1' },
            { userId: 'alt_user_2', name: 'Alternative User 2' },
            { userId: 'alt_user_3', name: 'Alternative User 3' },
            { userId: toUserId, name: 'User One' }
          ]
        }
      ]
    };
  }

  async processGraphTraversal(userId: string, depth: number = 2, mode: 'BFS' | 'DFS' = 'BFS') {
    console.log(`Mock: processGraphTraversal called - userId: ${userId}, depth: ${depth}, mode: ${mode}`);
    
    // Generate mock nodes based on depth
    const mockNodes = [];
    let nodeCount = 0;
    
    for (let level = 1; level <= depth; level++) {
      const nodesAtLevel = Math.pow(3, level); // Exponential growth simulation
      for (let i = 0; i < nodesAtLevel && nodeCount < 50; i++) {
        mockNodes.push({
          userId: `mock_node_${nodeCount}`,
          name: `Mock Node ${nodeCount}`,
          level,
          degree: Math.floor(Math.random() * 10) + 1,
          connectionType: ['friend', 'colleague', 'family'][Math.floor(Math.random() * 3)]
        });
        nodeCount++;
      }
    }
    
    return mockNodes;
  }

  async processInfluenceCalculation(userId: string) {
    console.log(`Mock: processInfluenceCalculation called - userId: ${userId}`);
    
    return {
      userId,
      influenceScore: 0.75,
      influenceRank: 'High',
      factors: {
        connectionCount: 45,
        networkReach: 180,
        betweennessCentrality: 0.65,
        clusteringCoefficient: 0.4
      },
      influentialConnections: [
        { userId: 'influencer_1', name: 'Influencer 1', influenceScore: 0.9 },
        { userId: 'influencer_2', name: 'Influencer 2', influenceScore: 0.8 }
      ]
    };
  }

  async processCentralityMeasures(userId: string) {
    console.log(`Mock: processCentralityMeasures called - userId: ${userId}`);
    
    return {
      userId,
      measures: {
        degreeCentrality: 0.65,
        betweennessCentrality: 0.45,
        closenessCentrality: 0.55,
        eigenvectorCentrality: 0.35,
        pageRank: 0.25
      },
      rankings: {
        degreeRank: 15,
        betweennessRank: 28,
        closenessRank: 22,
        eigenvectorRank: 35,
        pageRankRank: 42
      },
      networkSize: 1000
    };
  }

  async processShortestPaths(userId: string, maxLength: number = 5) {
    console.log(`Mock: processShortestPaths called - userId: ${userId}, maxLength: ${maxLength}`);
    
    const mockPaths = [];
    const pathCount = Math.min(maxLength, 8);
    
    for (let i = 0; i < pathCount; i++) {
      const pathLength = Math.floor(Math.random() * maxLength) + 1;
      const path = [userId];
      
      for (let j = 1; j < pathLength; j++) {
        path.push(`path_node_${i}_${j}`);
      }
      
      mockPaths.push({
        targetUserId: `target_${i}`,
        length: pathLength,
        path: path.map((nodeId, index) => ({
          userId: nodeId,
          name: `Node ${nodeId}`,
          step: index
        }))
      });
    }
    
    return mockPaths;
  }

  async handleNetworkMetrics() {
    console.log(`Mock: handleNetworkMetrics called`);
    
    return {
      networkSize: 1000,
      totalConnections: 2500,
      diameter: 6,
      averagePathLength: 3.2,
      clusteringCoefficient: 0.35,
      density: 0.005,
      components: {
        connectedComponents: 1,
        largestComponentSize: 1000
      }
    };
  }

  async handleBridgeDetection(userId: string) {
    console.log(`Mock: handleBridgeDetection called - userId: ${userId}`);
    
    return {
      userId,
      bridges: [
        {
          from: userId,
          to: 'bridge_node_1',
          bridgeType: 'critical',
          importance: 0.85
        },
        {
          from: userId,
          to: 'bridge_node_2',
          bridgeType: 'moderate',
          importance: 0.65
        }
      ],
      bridgeScore: 0.75,
      networkVulnerability: 0.3
    };
  }

  async processGraphAnalytics(userId: string) {
    console.log(`Mock: processGraphAnalytics called - userId: ${userId}`);
    
    return {
      userId,
      clusteringCoefficient: 0.42,
      localClustering: 0.38,
      globalClustering: 0.31,
      triangles: 12,
      connectedTriangles: 8,
      communities: [
        { id: 'community_1', size: 25, members: ['user1', 'user2', 'user3'] },
        { id: 'community_2', size: 18, members: ['user4', 'user5', 'user6'] }
      ],
      modularityScore: 0.65
    };
  }
}

// Export the mock service
export const mockDegreeService = new MockDegreeService();
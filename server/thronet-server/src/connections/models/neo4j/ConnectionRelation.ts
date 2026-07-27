// src/models/neo4j/ConnectionRelation.ts
import { Session } from 'neo4j-driver';
import { LogCategory, logger } from '@/shared/logger.util';
import { createNeo4jSession } from '@/config/neo4j/neo4j';

/**
 * ConnectionRelation Model
 * Defines the Neo4j relationship model for CONNECTED_TO relations between Person nodes.
 * Supports 20 features for connection relationships in the graph.
 * Used for graph queries in mutualService, degreeService, etc.
 * 
 * Properties (20 features) - Updated for degreeService:
 * 1. relationshipId - Unique relation ID (NEW)
 * 2. status - Connection status (pending, accepted, blocked)
 * 3. type - Type (direct, mutual, follow)
 * 4. strength - Connection strength score (0-100)
 * 5. createdAt - Creation timestamp
 * 6. updatedAt - Last update timestamp
 * 7. interactionCount - Number of interactions
 * 8. lastInteraction - Last interaction timestamp
 * 9. tags - Array of tags
 * 10. priority - Priority level (1-5)
 * 11. visibility - Visibility (public, private)
 * 12. archived - Archived flag
 * 13. notes - Connection notes
 * 14. properties - Additional data (renamed from metadata)
 * 15. duration - Connection duration in days
 * 16. frequency - Interaction frequency
 * 17. quality - Quality score
 * 18. recommendationScore - Recommendation score
 * 19. source - Source of connection (e.g., search, event)
 * 20. expiration - Expiration date (for temporary)
 * NEW for degreeService:
 * 21. weight - Weight for path finding (NEW)
 * 22. connectionDegree - Degree of connection (NEW)
 * 23. influence - Influence score (NEW)
 * 24. pathLength - Path length in graph (NEW)
 * 25. isDirectConnection - Direct connection flag (NEW)
 * 
 * Indexes: On status, strength for queries
 * 
 * Dependencies:
 * - neo4j-driver: For driver
 * - config/neo4j: For session
 * - logger: For logs
 * 
 * Usage: createRelation, getRelationsForPerson, updateRelation, etc.
 * Scalability: Batch operations, indexes
 */

// Interface for relation properties - Updated with new fields
interface RelationProperties {
  relationshipId?: string;
  status?: 'pending' | 'accepted' | 'blocked';
  type?: string;
  strength?: number;
  createdAt?: string;
  updatedAt?: string;
  interactionCount?: number;
  lastInteraction?: string;
  tags?: string[];
  priority?: number;
  visibility?: string;
  archived?: boolean;
  notes?: string;
  properties?: any;
  duration?: number;
  frequency?: number;
  quality?: number;
  recommendationScore?: number;
  source?: string;
  expiration?: string;
  weight?: number;
  connectionDegree?: number;
  influence?: number;
  pathLength?: number;
  isDirectConnection?: boolean;
}

// Export RelationProperties as ConnectionRelation for degreeService
export type ConnectionRelation = RelationProperties;

export class ConnectionRelationModel {
  private session: Session | null = null;
  
  constructor() {
    // Session initialization handled in init()
  }

  async init() {
    this.session = await createNeo4jSession();
  }

  /**
   * Ensures session is initialized
   * @private
   */
  private ensureSession(): Session {
    if (!this.session) {
      throw new Error('Session not initialized. Call init() first.');
    }
    return this.session;
  }

  /**
   * Create a CONNECTION_TO relationship - Updated to include new fields
   * @param fromId - From Person ID
   * @param toId - To Person ID
   * @param props - Relation properties
   * @returns Created relation
   */
  async createRelation(fromId: string, toId: string, props: Partial<RelationProperties>): Promise<RelationProperties> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const query = `
        MATCH (from:Person {id: $fromId}), (to:Person {id: $toId})
        MERGE (from)-[r:CONNECTED_TO]->(to)
        SET r += $props,
            r.relationshipId = $props.relationshipId OR toString(id(r)),
            r.weight = $props.weight OR 1.0,
            r.connectionDegree = $props.connectionDegree OR 1,
            r.influence = $props.influence OR 0,
            r.pathLength = $props.pathLength OR 1,
            r.isDirectConnection = $props.isDirectConnection OR true,
            r.createdAt = datetime(),
            r.updatedAt = datetime()
        RETURN r
      `;
      const result = await session.run(query, { fromId, toId, props });
      const relation = result.records[0]?.get('r').properties as RelationProperties;
      
      const duration = Date.now() - startTime;
      logger.info('Connection relation created', { 
        fromId, 
        toId, 
        relationshipId: relation.relationshipId, 
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      return relation;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error creating Connection relation', { 
        fromId, 
        toId, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      throw error;
    }
  }

  /**
   * Get relations for a Person (outgoing)
   * @param personId - Person ID
   * @param status - Filter by status (optional)
   * @param limit - Limit
   * @returns Relations
   */
  async getOutgoingRelations(personId: string, status?: 'pending' | 'accepted' | 'blocked', limit: number = 50): Promise<any[]> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      let query = `
        MATCH (p:Person {id: $personId})-[r:CONNECTED_TO]->(to:Person)
      `;
      if (status) {
        query += `WHERE r.status = $status `;
      }
      query += `
        RETURN r, to.id as toId, to.name as toName
        LIMIT $limit
      `;
      const params = { personId, ...(status && { status }), limit };
      const result = await session.run(query, params);
      const relations = result.records.map(record => ({
        relation: record.get('r').properties,
        to: { id: record.get('toId'), name: record.get('toName') }
      }));
      
      const duration = Date.now() - startTime;
      logger.info('Outgoing relations retrieved', { 
        personId, 
        status, 
        resultCount: relations.length,
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      return relations;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting outgoing relations', { 
        personId, 
        status, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      throw error;
    }
  }

  /**
   * Update relation properties
   * @param fromId - From ID
   * @param toId - To ID
   * @param updates - Properties to update
   * @returns Updated relation
   */
  async updateRelation(fromId: string, toId: string, updates: Partial<RelationProperties>): Promise<RelationProperties> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const setClause = Object.keys(updates).map(key => `r.${key} = $${key}`).join(', ');
      const query = `
        MATCH (from:Person {id: $fromId})-[r:CONNECTED_TO]->(to:Person {id: $toId})
        SET ${setClause}, r.updatedAt = datetime()
        RETURN r
      `;
      const params = { fromId, toId, ...updates };
      const result = await session.run(query, params);
      const relation = result.records[0]?.get('r').properties as RelationProperties;
      
      const duration = Date.now() - startTime;
      logger.info('Connection relation updated', { 
        fromId, 
        toId, 
        updatedFields: Object.keys(updates),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      return relation;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error updating Connection relation', { 
        fromId, 
        toId, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      throw error;
    }
  }

  /**
   * Delete relation
   * @param fromId - From ID
   * @param toId - To ID
   */
  async deleteRelation(fromId: string, toId: string): Promise<void> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const query = `
        MATCH (from:Person {id: $fromId})-[r:CONNECTED_TO]->(to:Person {id: $toId})
        DELETE r
      `;
      await session.run(query, { fromId, toId });
      
      const duration = Date.now() - startTime;
      logger.info('Connection relation deleted', { 
        fromId, 
        toId,
        duration,
        responseTimeMs: duration,
        category: LogCategory.AUDIT 
      });
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error deleting Connection relation', { 
        fromId, 
        toId, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      throw error;
    }
  }

  /**
   * Get mutual connections via relation
   * @param userId1 - User1 ID
   * @param userId2 - User2 ID
   * @returns Mutual count
   */
  async getMutualCount(userId1: string, userId2: string): Promise<number> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const query = `
        MATCH (u1:Person {id: $userId1})-[r1:CONNECTED_TO {status: 'accepted'}]->(mutual:Person)<-[r2:CONNECTED_TO {status: 'accepted'}]-(u2:Person {id: $userId2})
        RETURN count(DISTINCT mutual) as count
      `;
      const result = await session.run(query, { userId1, userId2 });
      const count = result.records[0]?.get('count') || 0;
      
      const duration = Date.now() - startTime;
      logger.info('Mutual count retrieved', { 
        userId1, 
        userId2, 
        count,
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      return count;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting mutual count via relation', { 
        userId1, 
        userId2, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      throw error;
    }
  }

  /**
   * Batch create relations
   * @param relations - Array of {fromId, toId, props}
   * @returns Created relations
   */
  async batchCreateRelations(relations: { fromId: string; toId: string; props: Partial<RelationProperties> }[]): Promise<RelationProperties[]> {
    const startTime = Date.now();
    try {
      const created: RelationProperties[] = [];
      for (const rel of relations) {
        const r = await this.createRelation(rel.fromId, rel.toId, rel.props);
        created.push(r);
      }
      
      const duration = Date.now() - startTime;
      logger.info('Batch Connection relations created', { 
        count: created.length,
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      return created;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error in batch create relations', { 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE 
      });
      throw error;
    }
  }

  /**
   * Update strength for all relations of a person
   * @param personId - Person ID
   * @param newStrength - New strength
   */
  async updateAllRelationsStrength(personId: string, newStrength: number): Promise<void> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const query = `
        MATCH (p:Person {id: $personId})-[r:CONNECTED_TO]->(to:Person)
        SET r.strength = $newStrength, r.updatedAt = datetime()
      `;
      await session.run(query, { personId, newStrength });
      
      const duration = Date.now() - startTime;
      logger.info('All relations strength updated', { 
        personId, 
        newStrength,
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error updating all relations strength', { 
        personId, 
        newStrength, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      throw error;
    }
  }

  /**
   * Get relations by status
   * @param status - Status filter
   * @param limit - Limit
   * @returns Relations
   */
  async getRelationsByStatus(status: 'pending' | 'accepted' | 'blocked', limit: number = 100): Promise<any[]> {
    const startTime = Date.now();
    try {
      const session = this.ensureSession();
      const query = `
        MATCH (from:Person)-[r:CONNECTED_TO {status: $status}]->(to:Person)
        RETURN from.id as fromId, r, to.id as toId
        LIMIT $limit
      `;
      const result = await session.run(query, { status, limit });
      const relations = result.records.map(record => ({
        fromId: record.get('fromId'),
        relation: record.get('r').properties,
        toId: record.get('toId')
      }));
      
      const duration = Date.now() - startTime;
      logger.info('Relations by status retrieved', { 
        status,
        resultCount: relations.length,
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      return relations;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting relations by status', { 
        status, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION 
      });
      throw error;
    }
  }

  /**
   * Close session
   */
  async close(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
      logger.info('ConnectionRelation session closed', { category: LogCategory.SYSTEM });
    }
  }
}

// Export instance
export const connectionRelation = new ConnectionRelationModel();
export default ConnectionRelationModel;
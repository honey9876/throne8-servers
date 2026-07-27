// src/models/neo4j/PersonNode.ts
import { Session, Record } from 'neo4j-driver';
import { createNeo4jSession } from '@/config/neo4j/neo4j';
import { LogCategory, logger } from '@/shared/logger.util';

/**
 * PersonNode Model
 * Defines the Neo4j node model for Person entities in the graph database.
 * Supports 15 features for person nodes in connection/network analysis.
 * Used for graph queries in mutualService, networkService, etc.
 * 
 * Properties (15 features) - Updated for degreeService:
 * 1. id - Unique user ID (primary key) -> personId
 * 2. name - Full name
 * 3. email - Email address (hashed for privacy)
 * 4. profileUrl - Profile URL
 * 5. company - Current company
 * 6. location - Location (city/country)
 * 7. industry - Industry sector
 * 8. skills - Array of skills
 * 9. degree - Number of connections (degree) [renamed from connectionsCount]
 * 10. connectionStrength - Average connection strength
 * 11. lastActive - Last activity timestamp
 * 12. createdAt - Node creation timestamp
 * 13. updatedAt - Last update timestamp
 * 14. profileComplete - Boolean for profile completeness
 * 15. metadata - Additional data (e.g., premium status) -> properties
 * 
 * NEW FIELDS for degreeService (15 features total):
 * 16. influence - Influence score
 * 17. centrality - General centrality measure
 * 18. pageRank - PageRank score
 * 19. clusteringCoeff - Clustering coefficient
 * 20. betweenness - Betweenness centrality
 * 21. closeness - Closeness centrality
 * 
 * Indexes: On id, name, company for fast lookups
 * Relationships: CONNECTED_TO (with ConnectionRelation)
 * 
 * Dependencies:
 * - neo4j-driver: For driver and session
 * - config/neo4j: For session creation
 * - utils/logger: For logging operations
 * 
 * Usage: Import and use createPerson, getPersonById, updatePerson, etc.
 * Scalability: Batch creation, indexes for queries
 */

// Interface for Person data - Updated with new fields
interface PersonData {
  id: string;
  name: string;
  email?: string;
  profileUrl?: string;
  company?: string;
  location?: string;
  industry?: string;
  skills?: string[];
  degree?: number;
  connectionStrength?: number;
  lastActive?: Date;
  influence?: number;
  centrality?: number;
  pageRank?: number;
  clusteringCoeff?: number;
  betweenness?: number;
  closeness?: number;
  properties?: any;
}

// Interface for Person properties returned from Neo4j - Updated with new fields
interface PersonProperties {
  id: string;
  name: string;
  email?: string;
  profileUrl?: string;
  company?: string;
  location?: string;
  industry?: string;
  skills?: string[];
  degree?: number;
  connectionStrength?: number;
  lastActive?: string;
  createdAt?: string;
  updatedAt?: string;
  profileComplete?: boolean;
  influence?: number;
  centrality?: number;
  pageRank?: number;
  clusteringCoeff?: number;
  betweenness?: number;
  closeness?: number;
  properties?: any;
}

// Export PersonProperties as PersonNode for degreeService compatibility
export type PersonNode = PersonProperties;

export class PersonNodeModel {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Create a new Person node - Updated query to include new fields
   * @param data - Person data object
   * @returns Created node record
   */
  async createPerson(data: PersonData): Promise<PersonProperties | null> {
    const startTime = Date.now();
    try {
      logger.info('Creating Person node', { 
        userId: data.id, 
        name: data.name,
        company: data.company,
        category: LogCategory.DATABASE,
        responseTimeMs: 0
      });

      const query = `
        MERGE (p:Person {id: $id})
        SET p.name = $name,
            p.email = $email,
            p.profileUrl = $profileUrl,
            p.company = $company,
            p.location = $location,
            p.industry = $industry,
            p.skills = $skills,
            p.degree = $degree,
            p.connectionStrength = $connectionStrength,
            p.lastActive = $lastActive,
            p.influence = $influence,
            p.centrality = $centrality,
            p.pageRank = $pageRank,
            p.clusteringCoeff = $clusteringCoeff,
            p.betweenness = $betweenness,
            p.closeness = $closeness,
            p.properties = $properties,
            p.createdAt = datetime(),
            p.updatedAt = datetime(),
            p.profileComplete = CASE WHEN $name IS NOT NULL AND $company IS NOT NULL THEN true ELSE false END
        RETURN p
      `;
      
      const result = await this.session.run(query, data);
      const person = result.records[0]?.get('p').properties as PersonProperties;
      
      const duration = Date.now() - startTime;
      logger.info('Person node created successfully', { 
        userId: data.id, 
        duration,
        responseTimeMs: duration,
        profileComplete: person?.profileComplete,
        category: LogCategory.PERFORMANCE
      });

      return person || null;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error creating Person node', { 
        userId: data.id, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        data: { name: data.name, company: data.company },
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Get Person by ID
   * @param id - Person ID
   * @returns Person properties
   */
  async getPersonById(id: string): Promise<PersonProperties | null> {
    const startTime = Date.now();
    try {
      logger.debug('Fetching Person by ID', { 
        userId: id,
        category: LogCategory.DATABASE,
        responseTimeMs: 0
      });

      const query = `
        MATCH (p:Person {id: $id})
        RETURN p
      `;
      
      const result = await this.session.run(query, { id });
      const duration = Date.now() - startTime;
      
      if (result.records.length === 0) {
        logger.warn('Person not found', { 
          userId: id, 
          duration,
          responseTimeMs: duration,
          category: LogCategory.DATABASE
        });
        return null;
      }

      const person = result.records[0].get('p').properties as PersonProperties;
      logger.debug('Person retrieved successfully', { 
        userId: id, 
        duration,
        responseTimeMs: duration,
        company: person.company,
        degree: person.degree,
        category: LogCategory.DATABASE
      });

      return person;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting Person by ID', { 
        userId: id, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Update Person properties - Updated to handle new fields dynamically
   * @param id - Person ID
   * @param updates - Properties to update
   * @returns Updated person
   */
  async updatePerson(id: string, updates: Partial<PersonData>): Promise<PersonProperties | null> {
    const startTime = Date.now();
    try {
      logger.info('Updating Person node', { 
        userId: id, 
        updates: Object.keys(updates),
        category: LogCategory.DATABASE,
        responseTimeMs: 0
      });

      // Dynamic setClause with new fields support
      const setClause = Object.keys(updates).map(key => `p.${key} = $${key}`).join(', ');
      const query = `
        MATCH (p:Person {id: $id})
        SET ${setClause}, p.updatedAt = datetime()
        RETURN p
      `;
      
      const params = { id, ...updates };
      const result = await this.session.run(query, params);
      const person = result.records[0]?.get('p').properties as PersonProperties;
      
      const duration = Date.now() - startTime;
      logger.info('Person node updated successfully', { 
        userId: id, 
        duration,
        responseTimeMs: duration,
        updatedFields: Object.keys(updates),
        category: LogCategory.DATABASE
      });

      return person || null;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error updating Person node', { 
        userId: id, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        updates: Object.keys(updates),
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Delete Person node (and relationships? Careful in prod)
   * @param id - Person ID
   */
  async deletePerson(id: string): Promise<void> {
    const startTime = Date.now();
    try {
      logger.warn('Deleting Person node', { 
        userId: id,
        category: LogCategory.AUDIT,
        responseTimeMs: 0
      });

      const query = `
        MATCH (p:Person {id: $id})
        DETACH DELETE p
      `;
      
      await this.session.run(query, { id });
      
      const duration = Date.now() - startTime;
      logger.auditLog('PERSON_DELETED', id, { 
        duration,
        responseTimeMs: duration
      });
      logger.info('Person node deleted successfully', { 
        userId: id, 
        duration,
        responseTimeMs: duration,
        category: LogCategory.AUDIT
      });
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error deleting Person node', { 
        userId: id, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Get connections for Person (degree 1)
   * @param id - Person ID
   * @param limit - Limit results
   * @returns Connected persons
   */
  async getConnections(id: string, limit: number = 100): Promise<Array<{id: string, name: string, company: string}>> {
    const startTime = Date.now();
    try {
      logger.debug('Fetching Person connections', { 
        userId: id, 
        limit,
        category: LogCategory.CONNECTION,
        responseTimeMs: 0
      });

      const query = `
        MATCH (p:Person {id: $id})-[:CONNECTED_TO]->(conn:Person)
        RETURN conn.id as id, conn.name as name, conn.company as company
        LIMIT $limit
      `;
      
      const result = await this.session.run(query, { id, limit });
      const connections = result.records.map((record: Record) => record.toObject()) as Array<{id: string, name: string, company: string}>;
      
      const duration = Date.now() - startTime;
      logger.info('Person connections retrieved', { 
        userId: id, 
        duration,
        responseTimeMs: duration,
        resultCount: connections.length,
        category: LogCategory.CONNECTION
      });

      return connections;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting Person connections', { 
        userId: id, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * Update connections count (after adding/removing connections)
   * @param id - Person ID
   * @param count - New count
   */
  async updateConnectionsCount(id: string, count: number): Promise<void> {
    const startTime = Date.now();
    try {
      logger.debug('Updating degree', { 
        userId: id, 
        degree: count,
        category: LogCategory.CONNECTION,
        responseTimeMs: 0
      });

      const query = `
        MATCH (p:Person {id: $id})
        SET p.degree = $degree, p.updatedAt = datetime()
      `;
      
      await this.session.run(query, { id, degree: count });
      
      const duration = Date.now() - startTime;
      logger.debug('Degree updated successfully', { 
        userId: id, 
        degree: count, 
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION
      });
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error updating degree', { 
        userId: id, 
        degree: count, 
        error: error instanceof Error ? error.message : String(error),
        duration,
        responseTimeMs: duration,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * Batch create persons
   * @param persons - Array of person data
   * @returns Created persons
   */
  async batchCreatePersons(persons: PersonData[]): Promise<PersonProperties[]> {
    const startTime = Date.now();
    try {
      logger.info('Starting batch Person creation', { 
        count: persons.length,
        category: LogCategory.DATABASE,
        responseTimeMs: 0
      });

      const created: PersonProperties[] = [];
      for (const personData of persons) {
        const p = await this.createPerson(personData);
        if (p) {
          created.push(p);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info('Batch Person nodes created successfully', { 
        requestedCount: persons.length,
        createdCount: created.length,
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE
      });

      return created;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error in batch create Persons', { 
        requestedCount: persons.length,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Search persons by name/company (full-text index assumed)
   * @param query - Search query
   * @param limit - Limit
   * @returns Matching persons
   */
  async searchPersons(searchQuery: string, limit: number = 10): Promise<Array<{id: string, name: string, company: string, score: number}>> {
    const startTime = Date.now();
    try {
      logger.debug('Searching Persons', { 
        query: searchQuery, 
        limit,
        category: LogCategory.DATABASE,
        responseTimeMs: 0
      });

      const cypher = `
        CALL db.index.fulltext.queryNodes('personIndex', $query)
        YIELD node, score
        RETURN node.id as id, node.name as name, node.company as company, score
        LIMIT $limit
      `;
      
      const result = await this.session.run(cypher, { query: searchQuery, limit });
      const searchResults = result.records.map((record: Record) => record.toObject()) as Array<{id: string, name: string, company: string, score: number}>;
      
      const duration = Date.now() - startTime;
      logger.info('Person search completed', { 
        query: searchQuery,
        duration,
        responseTimeMs: duration,
        resultCount: searchResults.length,
        category: LogCategory.DATABASE
      });

      return searchResults;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error searching Persons', { 
        query: searchQuery, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        responseTimeMs: duration,
        category: LogCategory.DATABASE
      });
      throw error;
    }
  }

  /**
   * Get persons with high connection strength
   * @param minStrength - Minimum strength
   * @param limit - Limit
   * @returns High-strength persons
   */
  async getHighStrengthPersons(minStrength: number = 50, limit: number = 20): Promise<Array<{id: string, name: string, strength: number}>> {
    const startTime = Date.now();
    try {
      logger.debug('Fetching high-strength Persons', { 
        minStrength, 
        limit,
        category: LogCategory.CONNECTION,
        responseTimeMs: 0
      });

      const query = `
        MATCH (p:Person)
        WHERE p.connectionStrength >= $minStrength
        RETURN p.id as id, p.name as name, p.connectionStrength as strength
        ORDER BY p.connectionStrength DESC
        LIMIT $limit
      `;
      
      const result = await this.session.run(query, { minStrength, limit });
      const highStrengthPersons = result.records.map((record: Record) => record.toObject()) as Array<{id: string, name: string, strength: number}>;
      
      const duration = Date.now() - startTime;
      logger.info('High-strength Persons retrieved', { 
        minStrength,
        duration,
        responseTimeMs: duration,
        resultCount: highStrengthPersons.length,
        category: LogCategory.CONNECTION
      });

      return highStrengthPersons;
    } catch (error : any) {
      const duration = Date.now() - startTime;
      logger.error('Error getting high-strength Persons', { 
        minStrength, 
        error: error instanceof Error ? error : new Error(String(error)),
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
    try {
      await this.session.close();
      logger.debug('PersonNode session closed successfully', {
        category: LogCategory.SYSTEM,
        responseTimeMs: 0
      });
    } catch (error : any) {
      logger.error('Error closing PersonNode session', { 
        error: error instanceof Error ? error : new Error(String(error)),
        category: LogCategory.SYSTEM,
        responseTimeMs: 0
      });
      throw error;
    }
  }
}

// Factory function to create PersonNode instance with proper session handling
export const createPersonNode = async (): Promise<PersonNodeModel> => {
  const neo4jSession = await createNeo4jSession();
  return new PersonNodeModel(neo4jSession);
};

export default PersonNodeModel;
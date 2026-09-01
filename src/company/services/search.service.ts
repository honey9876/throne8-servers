// ============================================
// SEARCH SERVICE - Elasticsearch Operations
// ============================================

import { Client } from '@elastic/elasticsearch';
import logger from '@/shared/logger.util';
import { createCircuitBreaker, retry } from '@/shared/utils/company';
import CircuitBreaker from 'opossum';
import { createElasticsearchClient, elasticsearchConfig } from '@/config/cache/elasticsearch';
// import elasticsearchConfig, { createElasticsearchClient } from '@/config/cache/elasticsearch';

interface SearchQuery {
  query: string;
  filters?: Record<string, unknown>;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface SearchResult<T> {
  hits: T[];
  total: number;
  page: number;
  size: number;
  took: number;
}

interface IndexConfig {
  name: string;
  settings: {
    number_of_shards: number;
    number_of_replicas: number;
    refresh_interval: string;
    max_result_window?: number;
  };
  mappings: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>;
  };
}

class SearchService {
  private client: Client | null;
  private enabled: boolean;
  private indexPrefix: string;
  private searchBreaker: CircuitBreaker<unknown[], unknown>;

  constructor() {
    this.client = createElasticsearchClient();
    this.enabled = elasticsearchConfig.enabled;
    this.indexPrefix = elasticsearchConfig.indices.prefix;

    // Circuit breaker for search operations
    this.searchBreaker = createCircuitBreaker(
      async (operation: () => Promise<unknown>) => operation(),
      {
        timeout: 4000,
        errorThresholdPercentage: 55,
        resetTimeout: 30000,
        name: 'elasticsearch-search',
      }
    );

    if (this.enabled && this.client) {
      this.initializeIndices();
    }
  }

  /**
   * Get full index name with prefix
   */
  private getIndexName(indexName: string): string {
    return `${this.indexPrefix}-${indexName}`;
  }

  /**
   * Initialize all indices
   */
  private async initializeIndices(): Promise<void> {
    if (!this.client || !this.enabled) return;

    try {
      const indices = ['companies', 'posts', 'jobs', 'events'];

      for (const indexName of indices) {
        await this.createIndexIfNotExists(indexName);
      }

      logger.info('Elasticsearch indices initialized successfully');
    } catch (error : any) {
      logger.error('Failed to initialize Elasticsearch indices', { error });
    }
  }

  /**
   * Create index if it doesn't exist
   */
  private async createIndexIfNotExists(indexName: string): Promise<void> {
    if (!this.client) return;

    const fullIndexName = this.getIndexName(indexName);

    try {
      const exists = await this.client.indices.exists({ index: fullIndexName });

      if (!exists) {
        const configKey = indexName as keyof typeof elasticsearchConfig.indices;
        const indexConfig = elasticsearchConfig.indices[configKey];

        // Type guard to ensure indexConfig has settings and mappings
        if (
          typeof indexConfig === 'object' &&
          indexConfig !== null &&
          'settings' in indexConfig &&
          'mappings' in indexConfig
        ) {
          const config = indexConfig as IndexConfig;

          // await this.client.indices.create({
          //   index: fullIndexName,
          //   body: {
          //     settings: config.settings,
          //     mappings: config.mappings as Record<string, unknown>,
          //   },
          // });

          await this.client.indices.create({
            index: fullIndexName,
            settings: config.settings,      // Remove 'body' wrapper
            mappings: config.mappings,
          });

          logger.info(`Created Elasticsearch index: ${fullIndexName}`);
        }
      }
    } catch (error : any) {
      logger.error(`Failed to create index: ${fullIndexName}`, { error });
      throw error;
    }
  }

  // =====================================================
  // INDEXING OPERATIONS
  // =====================================================

  async indexDocument(indexName: string, id: string, document: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.enabled) {
      logger.warn('Elasticsearch not enabled, skipping indexing');
      return;
    }

    await retry(async () => {
      await this.client!.index({
        index: this.getIndexName(indexName),
        id,
        body: document,
        refresh: 'wait_for',
      });

      logger.debug(`Document indexed: ${indexName}/${id}`);
    });
  }

  async bulkIndex(indexName: string, documents: Array<{ id: string; doc: Record<string, unknown> }>): Promise<void> {
    if (!this.client || !this.enabled) return;

    const body = documents.flatMap((doc) => [
      { index: { _index: this.getIndexName(indexName), _id: doc.id } },
      doc.doc,
    ]);

    await retry(async () => {
      const response = await this.client!.bulk({ body, refresh: 'wait_for' });

      if (response.errors) {
        logger.error('Bulk indexing had errors', { errors: response.items });
      } else {
        logger.info(`Bulk indexed ${documents.length} documents to ${indexName}`);
      }
    });
  }

  async updateDocument(indexName: string, id: string, updates: Record<string, unknown>): Promise<void> {
    if (!this.client || !this.enabled) return;

    await retry(async () => {
      // await this.client!.update({
      //   index: this.getIndexName(indexName),
      //   id,
      //   body: { doc: updates },
      //   refresh: 'wait_for',
      // });

      await this.client!.update({
        index: this.getIndexName(indexName),
        id,
        doc: updates,                    // Remove 'body' wrapper
        refresh: 'wait_for',
      });

      logger.debug(`Document updated: ${indexName}/${id}`);
    });
  }

  async deleteDocument(indexName: string, id: string): Promise<void> {
    if (!this.client || !this.enabled) return;

    await retry(async () => {
      await this.client!.delete({
        index: this.getIndexName(indexName),
        id,
        refresh: 'wait_for',
      });

      logger.debug(`Document deleted: ${indexName}/${id}`);
    });
  }

  // =====================================================
  // SEARCH OPERATIONS
  // =====================================================

  async search<T>(indexName: string, searchQuery: SearchQuery): Promise<SearchResult<T>> {
    if (!this.client || !this.enabled) {
      return { hits: [], total: 0, page: 1, size: 0, took: 0 };
    }

    return this.searchBreaker.fire(async () => {
      const { query, filters, page = 1, size = 20, sortBy, sortOrder = 'desc' } = searchQuery;

      const from = (page - 1) * size;

      // Build search body with proper types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['name^3', 'title^2', 'description', 'content'],
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [],
          },
        },
        from,
        size,
      };

      // Add filters
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          body.query.bool.filter.push({ term: { [key]: value } });
        });
      }

      // Add sorting
      if (sortBy) {
        body.sort = [{ [sortBy]: { order: sortOrder } }];
      }

      const response = await this.client!.search({
        index: this.getIndexName(indexName),
        body,
      });

      // Type-safe total handling
      const total = typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value || 0;

      return {
        hits: response.hits.hits.map((hit) => hit._source as T),
        total,
        page,
        size,
        took: response.took,
      };
    }) as Promise<SearchResult<T>>;
  }

  async searchCompanies(searchQuery: SearchQuery): Promise<SearchResult<Record<string, unknown>>> {
    return this.search('companies', searchQuery);
  }

  async searchPosts(searchQuery: SearchQuery): Promise<SearchResult<Record<string, unknown>>> {
    return this.search('posts', searchQuery);
  }

  async searchJobs(searchQuery: SearchQuery): Promise<SearchResult<Record<string, unknown>>> {
    return this.search('jobs', searchQuery);
  }

  async searchEvents(searchQuery: SearchQuery): Promise<SearchResult<Record<string, unknown>>> {
    return this.search('events', searchQuery);
  }

  // =====================================================
  // ADVANCED SEARCH
  // =====================================================

  async autocomplete(indexName: string, field: string, query: string): Promise<string[]> {
    if (!this.client || !this.enabled) return [];

    // const response = await this.client.search({
    //   index: this.getIndexName(indexName),
    //   body: {
    //     suggest: {
    //       autocomplete: {
    //         prefix: query,
    //         completion: { field },
    //       },
    //     },
    //   },
    // });

    const response = await this.client.search({
      index: this.getIndexName(indexName),
      suggest: {                       // Remove 'body' wrapper
        autocomplete: {
          prefix: query,
          completion: { field },
        },
      },
    });
    // Type-safe autocomplete handling
    const suggestions = response.suggest?.autocomplete[0].options;
    if (Array.isArray(suggestions)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return suggestions.map((opt: any) => opt.text as string);
    }
    return [];
  }

  // =====================================================
  // INDEX MANAGEMENT
  // =====================================================

  async reindexAll(indexName: string): Promise<void> {
    if (!this.client || !this.enabled) return;

    const oldIndex = this.getIndexName(indexName);
    const newIndex = `${oldIndex}-${Date.now()}`;

    try {
      // Create new index
      await this.createIndexIfNotExists(indexName);

      // Reindex
      // await this.client.reindex({
      //   body: {
      //     source: { index: oldIndex },
      //     dest: { index: newIndex },
      //   },
      //   wait_for_completion: true,
      // });

      // await this.clienFt.reindex({
      await this.client.reindex({
  source: { index: oldIndex },     // Remove 'body' wrapper
  dest: { index: newIndex },
  wait_for_completion: true,
});

      // Delete old index and create alias
      await this.client.indices.delete({ index: oldIndex });
      await this.client.indices.putAlias({
        index: newIndex,
        name: oldIndex,
      });

      logger.info(`Reindexed ${indexName} successfully`);
    } catch (error : any) {
      logger.error(`Reindex failed for ${indexName}`, { error });
      throw error;
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    if (!this.client || !this.enabled) return;

    await this.client.indices.delete({
      index: this.getIndexName(indexName),
    });

    logger.warn(`Deleted index: ${indexName}`);
  }

  // =====================================================
  // HEALTH CHECK
  // =====================================================

  async healthCheck(): Promise<{ healthy: boolean; cluster?: Record<string, unknown> }> {
    if (!this.client || !this.enabled) {
      return { healthy: false };
    }

    try {
      const health = await this.client.cluster.health();
      return {
        healthy: health.status === 'green' || health.status === 'yellow',
        cluster: health as unknown as Record<string, unknown>,
      };
    } catch (error : any) {
      logger.error('Elasticsearch health check failed', { error });
      return { healthy: false };
    }
  }

  // =====================================================
  // CLOSE CONNECTION
  // =====================================================

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      logger.info('Elasticsearch connection closed');
    }
  }
}

export default new SearchService();
import 'dotenv/config';
import { Client } from '@elastic/elasticsearch';

export const elasticsearchConfig = {
  // Connection settings
  enabled: process.env.ENABLE_ELASTICSEARCH === 'true',
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
  },

  // Client options
  clientOptions: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    maxRetries: 3,
    requestTimeout: 30000, // 30 seconds
    pingTimeout: 3000,
    sniffOnStart: false,
    sniffInterval: false,
    
    // SSL/TLS (for production)
    ssl: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  },

  // Index settings
  indices: {
    prefix: process.env.ELASTICSEARCH_INDEX_PREFIX || 'company',
    
    // Company index
    companies: {
      name: 'companies',
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        refresh_interval: '1s',
        max_result_window: 10000,
      },
      mappings: {
        properties: {
          companyId: { type: 'keyword' },
          name: { 
            type: 'text',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          description: { type: 'text' },
          industry: { type: 'keyword' },
          size: { type: 'keyword' },
          location: {
            type: 'object',
            properties: {
              city: { type: 'keyword' },
              state: { type: 'keyword' },
              country: { type: 'keyword' },
            }
          },
          tags: { type: 'keyword' },
          verified: { type: 'boolean' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        }
      }
    },

    // ✅ ADD THIS - Mentors index
  mentors: {
    name: 'mentors',
    settings: {
      number_of_shards: 1,
      number_of_replicas: 1,
      refresh_interval: '1s',
      max_result_window: 10000,
      analysis: {
        analyzer: {
          autocomplete: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'autocomplete_filter']
          }
        },
        filter: {
          autocomplete_filter: {
            type: 'edge_ngram',
            min_gram: 2,
            max_gram: 20
          }
        }
      }
    },
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        title: { 
          type: 'text',
          analyzer: 'autocomplete',
          fields: { 
            keyword: { type: 'keyword' },
            raw: { type: 'text' }
          }
        },
        bio: { type: 'text' },
        tagline: { type: 'text' },
        skills: { type: 'keyword' },
        domains: { type: 'keyword' },
        currentRole: { 
          type: 'text',
          fields: { keyword: { type: 'keyword' } }
        },
        companyId: { type: 'keyword' },
        status: { type: 'keyword' },
        averageRating: { type: 'float' },
        totalSessions: { type: 'integer' },
        totalReviews: { type: 'integer' },
        quickCallPrice: { type: 'float' },
        deepDivePrice: { type: 'float' },
        experienceYears: { type: 'integer' },
        experienceLevel: { type: 'keyword' },
        languages: { type: 'keyword' },
        isVerified: { type: 'boolean' },
        isFeatured: { type: 'boolean' },
        isDeleted: { type: 'boolean' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' }
      }
    }
  },

    // Posts index
    posts: {
      name: 'posts',
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        refresh_interval: '1s',
      },
      mappings: {
        properties: {
          postId: { type: 'keyword' },
          companyId: { type: 'keyword' },
          title: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          content: { type: 'text' },
          type: { type: 'keyword' },
          tags: { type: 'keyword' },
          visibility: { type: 'keyword' },
          status: { type: 'keyword' },
          publishedAt: { type: 'date' },
          createdAt: { type: 'date' },
        }
      }
    },

    // Jobs index
    jobs: {
      name: 'jobs',
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        refresh_interval: '1s',
      },
      mappings: {
        properties: {
          jobId: { type: 'keyword' },
          companyId: { type: 'keyword' },
          title: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          description: { type: 'text' },
          requirements: { type: 'text' },
          location: {
            type: 'object',
            properties: {
              city: { type: 'keyword' },
              state: { type: 'keyword' },
              country: { type: 'keyword' },
            }
          },
          jobType: { type: 'keyword' },
          experienceLevel: { type: 'keyword' },
          salary: {
            type: 'object',
            properties: {
              min: { type: 'integer' },
              max: { type: 'integer' },
              currency: { type: 'keyword' },
            }
          },
          skills: { type: 'keyword' },
          status: { type: 'keyword' },
          createdAt: { type: 'date' },
          expiresAt: { type: 'date' },
        }
      }
    },

    // Events index
    events: {
      name: 'events',
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        refresh_interval: '1s',
      },
      mappings: {
        properties: {
          eventId: { type: 'keyword' },
          companyId: { type: 'keyword' },
          title: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' }
            }
          },
          description: { type: 'text' },
          type: { type: 'keyword' },
          location: {
            type: 'object',
            properties: {
              venue: { type: 'text' },
              city: { type: 'keyword' },
              address: { type: 'text' },
            }
          },
          startDate: { type: 'date' },
          endDate: { type: 'date' },
          status: { type: 'keyword' },
          createdAt: { type: 'date' },
        }
      }
    },
  },

  // Search settings
  search: {
    defaultSize: 20,
    maxSize: 100,
    highlightFragmentSize: 150,
    highlightNumberOfFragments: 3,
    
    // Fuzzy search
    fuzzy: {
      enabled: true,
      fuzziness: 'AUTO',
      maxExpansions: 50,
    },

    // Boost values for ranking
    boost: {
      exact_match: 3.0,
      partial_match: 1.5,
      fuzzy_match: 1.0,
    },
  },

  // Bulk operations
  bulk: {
    size: 500, // Number of documents per bulk request
    flushInterval: 5000, // 5 seconds
    concurrency: 3,
  },

  // Reindex settings
  reindex: {
    waitForCompletion: true,
    timeout: '5m',
    requestsPerSecond: 1000,
  },

  // Snapshot settings (backup)
  snapshot: {
    repository: 'backup_repo',
    compress: true,
    chunkSize: '100mb',
  },
};

// Create and export Elasticsearch client
export const createElasticsearchClient = (): Client | null => {
  if (!elasticsearchConfig.enabled) {
    return null;
  }

  try {
    const client = new Client(elasticsearchConfig.clientOptions);
    return client;
  } catch (error : any) {
    console.error('Failed to create Elasticsearch client:', error);
    return null;
  }
};

// ✅ Export the client instance
const esClient = createElasticsearchClient();
export default esClient;

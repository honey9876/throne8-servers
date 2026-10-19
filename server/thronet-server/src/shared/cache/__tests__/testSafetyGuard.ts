/**
 * testSafetyGuard.ts
 * Enforces strict environment safety for test suites.
 * Refuses execution unless:
 * 1. MongoDB host is strictly local (127.0.0.1, localhost, ::1) AND database name contains "test".
 * 2. Redis host / URLs / cluster nodes are strictly local (127.0.0.1, localhost, ::1)
 *    or equal to REDIS_TEST_URL's host.
 */

const ALLOWED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export interface SafetyCheckParams {
  mongoUri?: string;
  redisHost?: string;
  redisUrl?: string;
  redisQueueUrl?: string;
  redisQueueHost?: string;
  redisClusterNodes?: string;
  redisTestUrl?: string;
}

/**
 * Validates MongoDB and Redis target environments without side effects.
 * Throws an Error if any host is remote or non-test.
 */
export function validateEnvironmentSafety(params: SafetyCheckParams): { dbName: string; mongoHost: string } {
  // 1. MongoDB Verification
  const rawMongoUri = params.mongoUri;
  if (!rawMongoUri) {
    throw new Error('TEST SAFETY CHECK FAILED: Neither MONGODB_TEST_URI nor MONGODB_URI is defined.');
  }

  let parsedMongo: URL;
  try {
    parsedMongo = new URL(rawMongoUri);
  } catch (err: any) {
    throw new Error(`TEST SAFETY CHECK FAILED: Invalid MongoDB URI: ${rawMongoUri}`);
  }

  const mongoHost = parsedMongo.hostname.toLowerCase().trim();
  if (!ALLOWED_LOCAL_HOSTS.has(mongoHost)) {
    throw new Error(
      `TEST SAFETY CHECK FAILED: MongoDB host "${mongoHost}" is not local (must be 127.0.0.1, localhost, or ::1). Refusing to run tests against remote database!`
    );
  }

  const dbName = parsedMongo.pathname.replace(/^\//, '');
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `TEST SAFETY CHECK FAILED: MongoDB database name "${dbName}" does not contain "test". Refusing to run tests against non-test database! Set MONGODB_TEST_URI=mongodb://127.0.0.1:27017/thronet_test`
    );
  }

  // 2. Redis Verification
  const allowedRedisHosts = new Set(ALLOWED_LOCAL_HOSTS);
  if (params.redisTestUrl) {
    try {
      const parsedTestUrl = new URL(params.redisTestUrl);
      if (parsedTestUrl.hostname) {
        allowedRedisHosts.add(parsedTestUrl.hostname.toLowerCase().trim());
      }
    } catch {}
  }

  const checkRedisHost = (host: string, sourceName: string) => {
    const h = host.toLowerCase().trim();
    if (!allowedRedisHosts.has(h)) {
      throw new Error(
        `TEST SAFETY CHECK FAILED: Redis host "${host}" from ${sourceName} is not a local/test instance (must be 127.0.0.1, localhost, or ::1). Refusing to run tests against remote/non-test Redis!`
      );
    }
  };

  const checkRedisUrl = (rawUrl: string, sourceName: string) => {
    try {
      const parsed = new URL(rawUrl);
      checkRedisHost(parsed.hostname, sourceName);
    } catch (err: any) {
      if (err.message.includes('TEST SAFETY CHECK FAILED')) throw err;
      throw new Error(`TEST SAFETY CHECK FAILED: Invalid Redis URL "${rawUrl}" in ${sourceName}`);
    }
  };

  // Check REDIS_HOST
  if (params.redisHost) {
    checkRedisHost(params.redisHost, 'REDIS_HOST');
  }

  // Check REDIS_URL
  if (params.redisUrl) {
    checkRedisUrl(params.redisUrl, 'REDIS_URL');
  }

  // Check REDIS_QUEUE_URL
  if (params.redisQueueUrl) {
    checkRedisUrl(params.redisQueueUrl, 'REDIS_QUEUE_URL');
  }

  // Check REDIS_QUEUE_HOST
  if (params.redisQueueHost) {
    checkRedisHost(params.redisQueueHost, 'REDIS_QUEUE_HOST');
  }

  // Check REDIS_CLUSTER_NODES (e.g. "127.0.0.1:7001,127.0.0.1:7002")
  if (params.redisClusterNodes) {
    const nodes = params.redisClusterNodes.split(',').map((n) => n.trim()).filter(Boolean);
    for (const node of nodes) {
      const [nodeHost] = node.split(':');
      if (nodeHost) {
        checkRedisHost(nodeHost, 'REDIS_CLUSTER_NODES');
      }
    }
  }

  return { dbName, mongoHost };
}

/**
 * Asserts test environment safety using current process.env variables.
 * Returns the verified MongoDB URI.
 */
export function assertTestEnvironmentSafety(): string {
  const rawMongoUri = process.env['MONGODB_TEST_URI'] || process.env['MONGODB_URI'];
  const redisHost = process.env['REDIS_HOST'] || '127.0.0.1';

  const { dbName, mongoHost } = validateEnvironmentSafety({
    mongoUri: rawMongoUri,
    redisHost,
    redisUrl: process.env['REDIS_URL'],
    redisQueueUrl: process.env['REDIS_QUEUE_URL'],
    redisQueueHost: process.env['REDIS_QUEUE_HOST'],
    redisClusterNodes: process.env['REDIS_CLUSTER_NODES'],
    redisTestUrl: process.env['REDIS_TEST_URL'],
  });

  // Ensure process.env.REDIS_HOST points to the verified test host
  process.env['REDIS_HOST'] = redisHost;

  console.log(`🛡️ [Safety Guard Verified] Target DB: "${dbName}" on ${mongoHost} | Redis: Local instance Verified`);
  return rawMongoUri!;
}

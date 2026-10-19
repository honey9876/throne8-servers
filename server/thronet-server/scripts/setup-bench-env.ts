import dotenv from 'dotenv';
dotenv.config();

process.env['NODE_ENV'] = 'test';
process.env['LOG_DIR'] = './logs';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['REDIS_PORT'] = '6379';

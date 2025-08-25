import { Redis } from 'ioredis';

// Redis configuration using environment variables
const redisConfig = {
	host: process.env.CACHE_REDIS_HOST || 'localhost',
	port: parseInt(process.env.CACHE_REDIS_PORT || '6379'),
	password: process.env.CACHE_PASSWORD || undefined,
	maxRetriesPerRequest: null, // Set to null to comply with BullMQ requirements
};

export const connection = new Redis(redisConfig);

// Export the config for reference
export const redisConfigExport = redisConfig; 
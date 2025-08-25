import { Redis } from 'ioredis';
import { env } from 'process';
export const redisConfig = new Redis({
	host: env.CACHE_REDIS_HOST, // Redis host
	port: env.CACHE_REDIS_PORT, // Redis port
	password: env.CACHE_PASSWORD, // Redis password
	maxRetriesPerRequest: null, // Set to null to comply with BullMQ requirements
});

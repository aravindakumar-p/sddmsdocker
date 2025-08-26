import { Queue, QueueEvents } from 'bullmq';
import { connection } from './redis.config';

// Global crypto polyfill for Node.js environments
if (!global.crypto) {
	const crypto = require('crypto');
	(global as any).crypto = {
		getRandomValues: (array: any) => {
			if (array) {
				crypto.randomFillSync(array);
			}
			return array;
		},
		randomUUID: () => crypto.randomUUID(),
	};
}

// Store queue events for different job types
export const queueEvents: { [key: string]: QueueEvents } = {};

/**
 * Create queue events for a specific job name
 * @param jobName - The name of the job queue
 */
export const createQueueEventsForClient = (jobName: string): void => {
	if (!queueEvents[jobName]) {
		queueEvents[jobName] = new QueueEvents(`${jobName}`, { connection });
		
		// Set up event listeners
		queueEvents[jobName].on('progress', async (jobId, data) => {
			console.log(`Job ${jobId} progress:`, data);
		});
		
		queueEvents[jobName].on('waiting', (jobId) => {
			console.log(`Job ${jobId} waiting`);
		});
		
		queueEvents[jobName].on('active', (jobId) => {
			console.log(`Job ${jobId} active`);
		});
		
		queueEvents[jobName].on('completed', (jobId) => {
			console.log(`Job ${jobId} completed`);
		});
		
		queueEvents[jobName].on('failed', (jobId, failedReason) => {
			console.log(`Job ${jobId} failed:`, failedReason);
		});
	}
};

/**
 * Get or create a queue for a specific job name
 * @param jobName - The name of the job queue
 * @returns Queue instance
 */
export const getQueueForClient = (jobName: string): Queue => {
	createQueueEventsForClient(jobName); // Set up event listeners
	return new Queue(`${jobName}`, { connection });
};

// Main voucher queue instance
export const voucherQueue = new Queue('voucher-fetch-queue', {
	connection,
});

// Main voucher queue events
export const voucherQueueEvents = new QueueEvents('voucher-fetch-queue', {
	connection,
}); 
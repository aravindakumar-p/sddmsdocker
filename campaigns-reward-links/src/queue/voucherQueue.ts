// queue.ts
import { Queue, QueueEvents } from 'bullmq';
import config from '../config.ts';
import { connection } from './redisConfig.js';

if (!global.crypto) {
	const crypto = require('crypto');
	global.crypto = {
		getRandomValues: (buffer: Buffer) => crypto.randomFillSync(buffer),
	};
}
export const queueEvents: { [key: string]: QueueEvents } = {};

export const createQueueEventsForClient = (jobName: any): void => {
	if (!queueEvents[jobName]) {
		queueEvents[jobName] = new QueueEvents(`${jobName}`, { connection: connection });
		queueEvents[jobName].on('progress', async (jobId, data) => {
			console.log(jobId, 'progress');
		});
		queueEvents[jobName].on('waiting', (jobId) => {
			console.log(jobId, 'waiting');
		});
		queueEvents[jobName].on('active', (jobId) => {
			console.log(jobId, 'active');
		});
		queueEvents[jobName].on('completed', (jobId) => {
			console.log(jobId, 'completed');
		});
		queueEvents[jobName].on('failed', (jobId, failedReason) => {
			console.log(jobId, 'failed');
		});
	}
};
export const getQueueForClient = (jobName: any): Queue => {
	createQueueEventsForClient(jobName); // Set up event listeners
	return new Queue(`${jobName}`, { connection: connection });
};
export const voucherQueue = new Queue('voucher-fetch-queue', {
	connection,
});

export const voucherQueueEvents = new QueueEvents('voucher-fetch-queue', {
	connection,
});

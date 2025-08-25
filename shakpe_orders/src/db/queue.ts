import { Queue, Worker, QueueEvents } from 'bullmq';
import { redisConfig } from '../redisConfig';
import { createOne, logError, logGenerator, updateOneNoEmit } from './setter';
import constant from '../constant.json';
import { getDataFromCollection } from './getter';
if (!global.crypto) {
	const crypto = require('crypto');
	global.crypto = {
		getRandomValues: (buffer: Buffer) => crypto.randomFillSync(buffer),
	};
}
const workers: { [key: string]: Worker } = {};
const queueEvents: { [key: string]: QueueEvents } = {};

export const createWorkerForClient = (clientId: any, services: any): Worker => {
	if (!workers[clientId]) {
		workers[clientId] = new Worker(
			`client_${clientId}`,
			async (job) => {
				// eslint-disable-next-line no-useless-catch
				try {
					const jobdata = job.data;
					return await processOrder(jobdata, services, jobdata.schema, { admin: true });
				} catch (error) {
					return {
						error: error,
					}; // Handle job failure
				}
			},
			{
				connection: redisConfig,
				concurrency: 1,
				removeOnComplete: { count: 0 },
				removeOnFail: { count: 0 },
			}
		);
	}
	return workers[clientId];
};

export const createQueueEventsForClient = (clientId: any): void => {
	if (!queueEvents[clientId]) {
		queueEvents[clientId] = new QueueEvents(`client_${clientId}`, { connection: redisConfig });
		queueEvents[clientId].on('progress', async (jobId, data) => {
			console.log(jobId, 'progress');
		});
		queueEvents[clientId].on('waiting', (jobId) => {
			console.log(jobId, 'waiting');
		});

		queueEvents[clientId].on('active', (jobId) => {
			console.log(jobId, 'active');
		});
		queueEvents[clientId].on('completed', (jobId) => {
			console.log(jobId, 'completed');
		});

		queueEvents[clientId].on('failed', (jobId, failedReason) => {
			console.log(jobId, 'failed');
		});
	}
};
export const getQueueForClient = (clientId: any): Queue => {
	createQueueEventsForClient(clientId); // Set up event listeners
	return new Queue(`client_${clientId}`, { connection: redisConfig });
};

export const addJobToClientQueue = async (clientId: any, jobData: any) => {
	const queue = getQueueForClient(clientId);
	createWorkerForClient(clientId, jobData.services);
	const job = await queue.add('orders', jobData, { removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } });
	const counts = await queue.getJobCounts();

	const activeJobsCount = counts.active;
	if (job) {
		const result = await job.waitUntilFinished(queueEvents[clientId]);

		return result;
	} else {
	}
};

const processOrder = async (jobdata: any, services: any, schema: any, accountability: any) => {
	try {
		// Fetch data from collections

		if (jobdata.item == 'update') {
			const order =
				jobdata.collection == 'performing_invoice'
					? await getDataFromCollection(
						services,
						{
							id: {
								_eq: jobdata.id,
							},
						},
						[
							'id',
							'original_value',
							'total_value',
							'total_value_cashback',
							'cashback',
							'date_updated',
							'client',
							'user_created',
							'commerical',
							'poc',
						],
						schema,
						'performing_invoice'
					)
					: jobdata.collection == 'shakepe_orders'
						? await getDataFromCollection(
							services,
							{
								id: {
									_eq: jobdata.id,
								},
							},
							[
								'id',
								'original_value',
								'total_value',
								'commerical',
								'total_value_cashback',
								'cashback',
								'date_updated',
								'date_created',
								'user_created',
								'client',
								'calculation',
								'status',
								'payment',
								'cashback',
								'type',
								'campiagn',
								'payment_terms',
								'remaining_amount',
								'payment_received',
								'poc',
								'*',
							],
							schema,
							'shakepe_orders'
						)
						: jobdata.collection == 'client_product_mapping'
							? await getDataFromCollection(
								services,
								{
									id: {
										_eq: jobdata.data.id,
									},
								},
								['id', 'credit_limt', 'date_updated', 'user_updated', 'client_id', 'user_created'],
								schema,
								'client_product_mapping'
							)
							: jobdata.collection == 'corporate_load'
								? await getDataFromCollection(
									services,
									{
										id: {
											_eq: jobdata.id,
										},
									},
									[
										'id',
										'amount',
										'transaction_type',
										'date_updated',
										'user_created',
										'payment_terms',
										'client_name',
										'poc',
									],
									schema,
									'corporate_load'
								)
								: jobdata.collection == 'payment_verify'
									? await getDataFromCollection(
										services,
										{
											id: {
												_eq: jobdata.id,
											},
										},
										[
											'id',
											'corporate_load.amount',
											'corporate_load.transaction_type',
											'corporate_load.id',
											'corporate_load.payment_terms',
											'corporate_load.poc',
											'date_updated',
											'user_created',
											'amount',
											'corporate_load.client_name',
										],
										schema,
										'payment_verify'
									)
									: jobdata.collection == 'client'
										? await getDataFromCollection(
											services,
											{
												id: {
													_eq: jobdata.id,
												},
											},
											[
												'id',
												'credit_limit',
												'previous_credit_limit',
												'credit_wallet',
												'user_created',
												'requested_credit_limit',
											],
											schema,
											'client'
										)
										: jobdata.collection == 'poc_fund_transfer'
											? await getDataFromCollection(
												services,
												{
													id: {
														_eq: jobdata.id,
													},
												},
												['client', 'sender_poc.*', 'receiver_poc.*', 'amount', 'status'],
												schema,
												'poc_fund_transfer'
											)
											: null;
			if (order) {
				const orders = { ...order[0], collection: jobdata.collection };
				// Process each order sequentially

				if (orders.collection === 'performing_invoice') {
					// Fetch client wallet details

					const client_wallet_data = await getDataFromCollection(
						services,
						{ id: { _eq: orders.client } },
						['wallet', 'outstanding_wallet'],
						schema,
						'client'
					);
					const poc_wallet = await getDataFromCollection(
						services,
						{ id: { _eq: orders.poc } },
						['id', 'wallet'],
						schema,
						'client_point_of_contact'
					);
					const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);

					// Extract wallet and outstanding wallet values
					const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);
					const amountToProcess = parseFloat(
						orders.commerical === 'Cashback'
							? orders.total_value_cashback
							: orders.total_value
								? orders.total_value
								: orders.original_value
					).toFixed(2);
					await updateWallet(
						orders.client,
						orders.id,
						schema,
						services,
						'credit',
						'perform_invoice',
						'wallet',
						amountToProcess,
						clientWallet,
						orders.user_created,
						null
					);
					await pocUpdateWallet(
						services,
						schema,
						orders.poc,
						amountToProcess,
						pocWallet,
						'credit',
						orders.user_created,
						'perform_invoice',
						'cpp',
						orders.id,
						orders.client
					);
				} else if (orders.collection === 'shakepe_orders') {
					const client_wallet_data = await getDataFromCollection(
						services,
						{ id: { _eq: orders.client } },
						['wallet', 'outstanding_wallet', 'credit_wallet', 'credit_used'],
						schema,
						'client'
					);
					const coins = await getDataFromCollection(
						services,
						{ id: { _eq: orders.product_type } },
						['id', 'coins', 'product_type.product_types', 'product_type.coin'],
						schema,
						'client_product_mapping'
					);
					const totalOrderValue = parseFloat(
						orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
					);

					const productType = coins[0].product_type.product_types;
					const productId = coins[0].id;
					const poc_wallet = await getDataFromCollection(
						services,
						{ id: { _eq: orders.poc } },
						['id', 'wallet'],
						schema,
						'client_point_of_contact'
					);
					const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);
					// Extract wallet and outstanding wallet values
					const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);
					const amountToProcess = parseFloat(
						orders.commerical === 'Cashback'
							? orders.total_value_cashback
							: orders.total_value
								? orders.total_value
								: orders.original_value
					).toFixed(2);

					const walletType = coins[0].product_type.coin;
					const product_points = await getDataFromCollection(
						services,
						{ id: { _eq: orders.poc } },
						['id', walletType],
						schema,
						'client_point_of_contact'
					);

					const coinsWallet = coins[0].coins
						? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
						: 0;
					if (orders.payment_terms == 'Advance' && orders.status == 'draft') {
						const totalOrderValue = parseFloat(
							jobdata.data.total_value_cashback ? jobdata.data.total_value_cashback : jobdata.data.total_order_value
						);
						const amountToProcess = parseFloat(
							orders.commerical === 'Cashback'
								? jobdata.data.total_value_cashback
								: jobdata.data.total_value_cashback
									? jobdata.data.total_value
									: jobdata.data.original_value
						).toFixed(2);

						if (amountToProcess <= pocWallet) {
							if (jobdata.data.order_confirm == 'true') {
								const ledger = await updateWallet(
									orders.client,
									orders.id,
									schema,
									services,
									'debit',
									'shakepe_orders',
									'wallet',
									amountToProcess,
									clientWallet,
									orders.user_created,
									orders.calculation.includes('Previous') ? 'reserved' : null
								);

								await pocUpdateWallet(
									services,
									schema,
									orders.poc,
									amountToProcess,
									pocWallet,
									'debit',
									orders.user_created,
									'shakepe_orders',
									'cpp',
									orders.id,
									orders.client
								);

								const data = await updateCoins(
									services,
									schema,
									'credit',
									coinsWallet,
									totalOrderValue,
									orders.user_created,
									orders.poc,
									'cpp',
									orders.client,
									'shakepe_orders',
									orders.id,
									productType,
									walletType
								);
								return {
									payment: 'Payment Received',
									status: orders.calculation.includes('Previous') ? 'Approval Pending' : 'Order Open',
									approval_status: orders.calculation.includes('Previous') ? 'Pending' : null,
								};
							} else {
								return {
									status: 'draft',
								};
							}
						} else {
							return {
								error: constant.ERROR.INSUFFIENT,
							};
						}
					} else if (orders.payment_terms == 'Credit' && jobdata.data.payment === 'Payment Received') {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client } },
							['wallet', 'credit_wallet', 'credit_used'],
							schema,
							'client'
						);

						const clientCreditWallet = parseFloat(client_wallet_data[0].credit_wallet);
						const clientCreditUsed = parseFloat(
							isNaN(client_wallet_data[0].credit_used) ? 0 : client_wallet_data[0].credit_used
						);

						const amountToProcess =
							orders.payment == 'partial_payment_recevied'
								? parseFloat(orders.remaining_amount).toFixed(2)
								: parseFloat(
									orders.commerical === 'Cashback'
										? orders.total_value_cashback
										: orders.total_value
											? orders.total_value
											: orders.original_value
								).toFixed(2);
						const poc_data = await getDataFromCollection(
							services,
							{
								_and: [
									{
										id: {
											_eq: orders.poc,
										},
									},
								],
							},
							['credit_used'],
							schema,
							'client_point_of_contact'
						);
						const pocCreditUsed = parseFloat(isNaN(poc_data[0].credit_used) ? 0 : poc_data[0].credit_used);
						await updateOneNoEmit(
							{
								credit_used: pocCreditUsed - amountToProcess,
							},
							'client_point_of_contact',
							services,
							orders.poc,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);
						await updateOneNoEmit(
							{
								credit_used: clientCreditUsed - amountToProcess,
							},
							'client',
							services,
							orders.client,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);

						await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'credit',
							'shakepe_orders',
							'credit_wallet',
							amountToProcess,
							clientCreditWallet,
							orders.user_created,
							null
						);
					} else if (jobdata.data.status == 'Order Cancelled') {
						if (orders.payment_terms == 'Advance') {
							const client_wallet_data = await getDataFromCollection(
								services,
								{ id: { _eq: orders.client } },
								['wallet', 'credit_wallet'],
								schema,
								'client'
							);
							const clientWallet = parseFloat(client_wallet_data[0].wallet);
							await updateWallet(
								orders.client,
								orders.id,
								schema,
								services,
								'credit',
								'shakepe_orders',
								'wallet',
								amountToProcess,
								clientWallet,
								orders.user_created,
								'reverse'
							);

							await pocUpdateWallet(
								services,
								schema,
								orders.poc,
								amountToProcess,
								pocWallet,
								'credit',
								orders.user_created,
								'shakepe_orders',
								'cpp',
								orders.id,
								orders.client
							);
							await updateCoins(
								services,
								schema,
								'debit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								orders.id,
								productType,
								walletType
							);
						} else if (orders.payment_terms == 'Credit' && orders.payment == 'Payment Pending') {
							const client_wallet_data = await getDataFromCollection(
								services,
								{ id: { _eq: orders.client } },
								['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
								schema,
								'client'
							);
							const poc_data = await getDataFromCollection(
								services,
								{
									_and: [
										{
											id: {
												_eq: orders.poc,
											},
										},
									],
								},
								['credit_used'],
								schema,
								'client_point_of_contact'
							);
							const pocCreditUsed = parseFloat(isNaN(poc_data[0].credit_used) ? 0 : poc_data[0].credit_used);
							await updateOneNoEmit(
								{
									credit_used: pocCreditUsed - amountToProcess,
								},
								'client_point_of_contact',
								services,
								orders.poc,
								schema,
								{
									admin: true,
									user: orders.user_created,
								}
							);

							const clientCreditWallet = parseFloat(client_wallet_data[0].credit_wallet);
							const clientCreditUsed = parseFloat(client_wallet_data[0].credit_used);
							await updateOneNoEmit(
								{
									credit_used: clientCreditUsed - amountToProcess,
								},
								'client',
								services,
								orders.client,
								schema,
								{
									admin: true,
									user: orders.user_created,
								}
							);

							await updateWallet(
								orders.client,
								orders.id,
								schema,
								services,
								'credit',
								'shakepe_orders',
								'credit_wallet',
								amountToProcess,
								clientCreditWallet,
								orders.user_created,
								'reverse'
							);
							await updateCoins(
								services,
								schema,
								'debit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								orders.id,
								productType,
								walletType
							);
						} else if (orders.payment_terms == 'Credit' && orders.payment == 'partial_payment_recevied') {
							const client_wallet_data = await getDataFromCollection(
								services,
								{ id: { _eq: orders.client } },
								['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
								schema,
								'client'
							);
							const clientWallet = parseFloat(client_wallet_data[0].wallet);
							const clientCreditWallet = parseFloat(client_wallet_data[0].credit_wallet);
							const clientCreditUsed = parseFloat(client_wallet_data[0].credit_used);
							const poc_data = await getDataFromCollection(
								services,
								{
									_and: [
										{
											id: {
												_eq: orders.poc,
											},
										},
									],
								},
								['credit_used'],
								schema,
								'client_point_of_contact'
							);
							const pocCreditUsed = parseFloat(isNaN(poc_data[0].credit_used) ? 0 : poc_data[0].credit_used);
							await updateOneNoEmit(
								{
									credit_used: pocCreditUsed - parseFloat(orders.remaining_amount),
								},
								'client_point_of_contact',
								services,
								orders.poc,
								schema,
								{
									admin: true,
									user: orders.user_created,
								}
							);
							await updateWallet(
								orders.client,
								orders.id,
								schema,
								services,
								'credit',
								'shakepe_orders',
								'wallet',
								parseFloat(orders.payment_received),
								clientWallet,
								orders.user_created,
								'reverse'
							);

							await updateOneNoEmit(
								{
									credit_used: clientCreditUsed - parseFloat(orders.remaining_amount),
								},
								'client',
								services,
								orders.client,
								schema,
								{
									admin: true,
									user: orders.user_created,
								}
							);
							await updateWallet(
								orders.client,
								orders.id,
								schema,
								services,
								'credit',
								'shakepe_orders',
								'credit_wallet',
								parseFloat(orders.remaining_amount),
								clientCreditWallet,
								orders.user_created,
								'reverse'
							);
							await updateCoins(
								services,
								schema,
								'debit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								orders.id,
								productType,
								walletType
							);
						}
					} else if (orders.status == 'Order Completed' && orders.commerical == 'Cashback' && orders?.cashback) {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client } },
							['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
							schema,
							'client'
						);
						const clientWallet = parseFloat(client_wallet_data[0].wallet);

						await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'credit',
							'shakepe_orders',
							'wallet',
							orders?.cashback,
							clientWallet,
							orders.user_created,
							'cashback'
						);
						await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							parseFloat(orders?.cashback),
							pocWallet,
							'credit',
							orders.user_created,
							'shakepe_orders',
							'cpp',
							'reverse',
							orders.client
						);
					} else if (jobdata.data.status == 'Order Processed') {
						if (productType == 'ShakePe Points') {
							const update = await updateOneNoEmit(
								{
									consume_status: 'not_consumed',
								},
								'shakepe_orders',
								services,
								orders.id,
								schema,
								{
									admin: true,
									user: orders.user_created,
								}
							);
							const coinsCredit = await updateCoins(
								services,
								schema,
								'credit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								orders.id,
								productType,
								walletType
							);
							const santa = await fetch(process.env.SANTA_API + '?dispatch=add_products_from_zeus.ledger_credit', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									Authorization: 'Bearer ' + process.env.SANTA_TOKEN,
								},
								body: JSON.stringify({
									user_id: 0,
									user_email: null,
									user_name: 0,
									firstname: 0,
									lastname: 0,
									request_id: 0,
									company_id: 0,
									entity_id: null,
									siteadmin_id: 0,
									points_type: 'A',
									amount: totalOrderValue,
									campaign_id: 0,
									created_at: orders.date_created,
									expire_date: '',
									action: 'A',
									reason: 'SP ' + orders.id + '/' + (orders?.po_number ?? ''),
									reward_point_change_id: 0,
									timestamp: 0,
									emp_id: 0,
									is_code: 0,
									zeus_company_id: orders.poc,
								}),
							});
							return true;
						} else {
							await updateCoins(
								services,
								schema,
								'debit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								orders.id,
								productType,
								walletType
							);
						}
					}
				} else if (orders.collection == 'client_product_mapping') {
					const client_wallet_data = await getDataFromCollection(
						services,
						{ id: { _eq: orders.client_id } },
						['credit_wallet', 'credit_limit'],
						schema,
						'client'
					);

					const clientCreditWallet = parseFloat(
						isNaN(client_wallet_data[0].credit_wallet) ? 0 : client_wallet_data[0].credit_wallet
					);
					const creditLimit = parseFloat(
						isNaN(client_wallet_data[0].credit_limit) ? 0 : client_wallet_data[0].credit_limit
					);

					const amountToProcess = parseFloat(orders.credit_limt).toFixed(2);
					await updateWallet(
						orders.client_id,
						null,
						schema,
						services,
						'credit',
						null,
						'credit_wallet',
						amountToProcess,
						clientCreditWallet,
						orders.user_created,
						null
					);
					await updateOneNoEmit(
						{
							credit_limit: creditLimit + amountToProcess,
						},
						'client',
						services,
						orders.client_id,
						schema,
						{
							admin: true,
							user: orders.user_created,
						}
					);
				} else if (orders.collection == 'payment_verify') {
					if (orders.corporate_load.transaction_type == 'reload' && orders.corporate_load.payment_terms == 'advance') {
						// 	// Fetch client wallet details
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.corporate_load.client_name } },
							['wallet'],
							schema,
							'client'
						);
						// Extract wallet and outstanding wallet values
						const clientWallet = parseFloat(client_wallet_data[0].wallet);
						const amountToProcess = parseFloat(orders.amount).toFixed(2);
						const poc_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.corporate_load.poc } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);
						const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);
						const creditPOCWallet = await pocUpdateWallet(
							services,
							schema,
							orders.corporate_load.poc,
							amountToProcess,
							pocWallet,
							'credit',
							orders.user_created,
							'corporate_load',
							'cpp',
							orders.corporate_load.id,
							orders.corporate_load.client_name
						);
						await updateWallet(
							orders.corporate_load.client_name,
							orders.corporate_load.id,
							schema,
							services,
							'credit',
							'corporate_load',
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							null
						);
					} else if (
						orders.corporate_load.transaction_type == 'reload' &&
						orders.corporate_load.payment_terms == 'credit'
					) {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.corporate_load.client_name } },
							['wallet', 'credit_wallet', 'credit_used'],
							schema,
							'client'
						);
						const clientCreditUsed = client_wallet_data[0].credit_used
							? parseFloat(isNaN(client_wallet_data[0].credit_used) ? 0 : client_wallet_data[0].credit_used)
							: 0;

						const amountToProcess = parseFloat(orders.amount).toFixed(2);
						const clientCreditWallet = parseFloat(client_wallet_data[0].credit_wallet);
						await updateOneNoEmit(
							{
								credit_used: clientCreditUsed - amountToProcess,
							},
							'client',
							services,
							orders.client,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);

						await updateWallet(
							orders.corporate_load.client_name,
							orders.corporate_load.id,
							schema,
							services,
							'credit',
							'corporate_load',
							'credit_wallet',
							amountToProcess,
							clientCreditWallet,
							orders.user_created,
							null
						);
					}
				} else if (orders.collection == 'corporate_load' && jobdata.data.status == 'approved') {
					if (orders.transaction_type == 'cashback') {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client_name } },
							['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
							schema,
							'client'
						);
						const poc_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.poc } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);
						const amountToProcess = parseFloat(orders.amount).toFixed(2);
						const clientWallet = parseFloat(client_wallet_data[0].wallet);
						const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);

						const creditWallet = await updateWallet(
							orders.client_name,
							orders.id,
							schema,
							services,
							'credit',
							'corporate_load',
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							null,
							'Corporate Load'
						);
						const creditPOCWallet = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							amountToProcess,
							pocWallet,
							'credit',
							orders.user_created,
							'corporate_load',
							'cpp',
							null,
							orders.client_name
						);
						return true;
					} else if (orders.transaction_type == 'debit') {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client_name } },
							['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
							schema,
							'client'
						);
						const poc_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.poc } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);
						const amountToProcess = parseFloat(orders.amount).toFixed(2);

						const clientWallet = parseFloat(client_wallet_data[0].wallet);
						const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);
						const creditWallet = await updateWallet(
							orders.client_name,
							orders.id,
							schema,
							services,
							'debit',
							'corporate_load',
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							null,
							'Corporate Load'
						);
						const creditPOCWallet = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							amountToProcess,
							pocWallet,
							'debit',
							orders.user_created,
							'corporate_load',
							'cpp',
							null,
							orders.client_name
						);
						return true;
					} else if (orders.transaction_type == 'reload' && orders.payment_terms == 'credit') {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client_name } },
							['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
							schema,
							'client'
						);
						const poc_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.poc } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);

						const amountToProcess = parseFloat(orders.amount).toFixed(2);
						const clientWallet = parseFloat(client_wallet_data[0].wallet);
						const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);

						const creditWallet = await updateWallet(
							orders.client_name,
							orders.id,
							schema,
							services,
							'credit',
							'corporate_load',
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							null,
							'Corporate Load'
						);
						const creditPOCWallet = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							amountToProcess,
							pocWallet,
							'credit',
							orders.user_created,
							'corporate_load',
							'cpp',
							null,
							orders.client_name
						);
						return true;
					}
				} else if (orders.collection == 'corporate_load' && jobdata.data.status == 'cancelled') {
					if (orders.transaction_type == 'reload' && orders.payment_terms == 'credit') {
						const client_wallet_data = await getDataFromCollection(
							services,
							{ id: { _eq: orders.client_name } },
							['wallet', 'credit_wallet', 'credit_used', 'outstanding_wallet'],
							schema,
							'client'
						);
						const amountToProcess = parseFloat(orders.amount).toFixed(2);
						const clientCreditWallet = parseFloat(client_wallet_data[0].credit_wallet);
						const clientCreditUsed = client_wallet_data[0].credit_used
							? parseFloat(isNaN(client_wallet_data[0].credit_used) ? 0 : client_wallet_data[0].credit_used)
							: 0;
						await updateOneNoEmit(
							{
								credit_used: clientCreditUsed - amountToProcess,
							},
							'client',
							services,
							orders.client_name,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);
						await updateWallet(
							orders.client_name,
							orders.id,
							schema,
							services,
							'credit',
							'corporate_load',
							'credit_wallet',
							amountToProcess,
							clientCreditWallet,
							orders.user_created,
							null
						);
					}
				} else if (orders.collection == 'client' && jobdata.data.credit_limit_status == 'approved') {
					const amountToProcess = parseFloat(orders?.requested_credit_limit - orders?.credit_limit).toFixed(2);
					const clientCreditWallet = parseFloat(isNaN(orders.credit_wallet) ? 0 : orders.credit_wallet);
					const creditLimit = parseFloat(isNaN(orders.credit_limit) ? 0 : orders.credit_limit);
					await updateWallet(
						orders.id,
						null,
						schema,
						services,
						'credit',
						null,
						'credit_wallet',
						amountToProcess,
						orders?.credit_wallet,
						orders.user_created,
						null
					);
					return {
						credit_limit: orders?.requested_credit_limit,
					};
				} else if (orders.collection == 'poc_fund_transfer') {
					const amountToProcess = orders.amount.toFixed(2);
					if (amountToProcess > orders.sender_poc.wallet) {
						return {
							error: constant.ERROR.INSUFFIENT,
						};
					} else {
						const sender_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.sender_poc.id } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);
						const receiver_wallet = await getDataFromCollection(
							services,
							{ id: { _eq: orders.receiver_poc.id } },
							['id', 'wallet'],
							schema,
							'client_point_of_contact'
						);

						await pocUpdateWallet(
							services,
							schema,
							orders.sender_poc.id,
							amountToProcess,
							sender_wallet[0].wallet,
							'debit',
							orders.user_created,
							'poc_fund_transfer',
							'cpp',
							null,
							orders.client
						);
						await pocUpdateWallet(
							services,
							schema,
							orders.receiver_poc.id,
							amountToProcess,
							receiver_wallet[0].wallet,
							'credit',
							orders.user_created,
							'poc_fund_transfer',
							'cpp',
							null,
							orders.client
						);
						return true;
					}
				}
			} else {
				return true;
			}
		} else if (jobdata.item == 'create') {
			const orders = jobdata.data;
			if (
				orders &&
				jobdata.collection == 'shakepe_orders' &&
				jobdata.data.type != 'enterprise' &&
				jobdata.data.type != 'DIY'
			) {
				const client_wallet_data = await getDataFromCollection(
					services,
					{ id: { _eq: orders.client } },
					['wallet', 'credit_wallet', 'credit_used'],
					schema,
					'client'
				);
				const poc_wallet = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', 'wallet'],
					schema,
					'client_point_of_contact'
				);

				const coins = await getDataFromCollection(
					services,
					{ id: { _eq: orders.product_type } },
					['id', 'coins', 'product_type.*'],
					schema,
					'client_product_mapping'
				);
				const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);
				const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);
				const clientCreditUsed = client_wallet_data[0].credit_used
					? parseFloat(isNaN(client_wallet_data[0].credit_used) ? 0 : client_wallet_data[0].credit_used)
					: 0;
				const clientCreditWallet = parseFloat(
					isNaN(client_wallet_data[0].credit_wallet) ? 0 : client_wallet_data[0].credit_wallet
				);
				const amountToProcess = parseFloat(
					orders.commerical == 'Cashback'
						? orders.total_value_cashback
						: orders.total_value
							? orders.total_value
							: orders.original_value
				).toFixed(2);

				const totalOrderValue = parseFloat(
					orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
				);
				const productType = coins[0].product_type.product_types;
				const walletType = coins[0].product_type.coin;
				const product_points = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', walletType],
					schema,
					'client_point_of_contact'
				);
				const coinsWallet = coins[0].coins
					? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
					: 0;

				if (orders.payment_terms == 'Advance') {
					if (amountToProcess <= clientWallet && amountToProcess <= pocWallet) {
						const ledger = await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'debit',
							'shakepe_orders',
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							orders.calculation.includes('Previous') ? 'reserved' : null
						);

						const pocDebit = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							amountToProcess,
							pocWallet,
							'debit',
							orders.user_created,
							'shakepe_orders',
							'cpp',
							null,
							orders.client
						);
						if (productType != 'ShakePe Points') {
							const coinsCredit = await updateCoins(
								services,
								schema,
								'credit',
								coinsWallet,
								totalOrderValue,
								orders.user_created,
								orders.poc,
								'cpp',
								orders.client,
								'shakepe_orders',
								null,
								productType,
								walletType
							);
							return {
								transaction_create: [ledger, pocDebit, coinsCredit],
								payment: 'Payment Received',
								status: orders.calculation.includes('Previous') ? 'Approval Pending' : 'Order Open',
								approval_status: orders.calculation.includes('Previous') ? 'Pending' : null,
							};
						}

						return {
							transaction_create: [ledger, pocDebit],
							payment: 'Payment Received',
							status: orders.calculation.includes('Previous') ? 'Approval Pending' : 'Order Open',
							approval_status: orders.calculation.includes('Previous') ? 'Pending' : null,
							consume_status: 'not_consumed',
						};
					} else {
						return {
							error: constant.ERROR.INSUFFIENT,
						};
					}
				} else if (orders.payment_terms == 'Credit') {
					const coins = await getDataFromCollection(
						services,
						{ id: { _eq: orders.product_type } },
						['id', 'coins', 'product_type.product_types', 'product_type.coin'],
						schema,
						'client_product_mapping'
					);
					const totalOrderValue = parseFloat(
						orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
					);
					const productType = coins[0].product_type.product_types;
					const walletType = coins[0].product_type.coin;
					const product_points = await getDataFromCollection(
						services,
						{ id: { _eq: orders.poc } },
						['id', walletType],
						schema,
						'client_point_of_contact'
					);
					const coinsWallet = coins[0].coins
						? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
						: 0;
					if (clientCreditWallet < 0) {
						return {
							error: constant.ERROR.NEGATIVE_VALUE,
						};
					}
					if (amountToProcess <= pocWallet) {
						const ledger = await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'debit',
							null,
							'wallet',
							amountToProcess,
							clientWallet,
							orders.user_created,
							orders.calculation.includes('Previous') ? 'reserved' : null
						);

						const pocDebit = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							amountToProcess,
							pocWallet,
							'debit',
							orders.user_created,
							'shakepe_orders',
							'shakepe_orders',
							null,
							orders.client
						);
						const coinsCredit =
							productType != 'ShakePe Points'
								? await updateCoins(
									services,
									schema,
									'credit',
									coinsWallet,
									totalOrderValue,
									orders.user_created,
									orders.poc,
									'cpp',
									orders.client,
									'shakepe_orders',
									null,
									productType,
									walletType
								)
								: null;

						return {
							transaction_create: [ledger, pocDebit, coinsCredit].filter((id: any) => id != null),
							payment: 'Payment Received',
							payment_terms: 'Advance',
							status: orders.calculation.includes('Previous') ? 'Approval Pending' : 'Order Open',
							approval_status: orders.calculation.includes('Previous') ? 'Pending' : null,
							consume_status: 'not_consumed',
						};
					} else if (pocWallet == 0) {
						const coins = await getDataFromCollection(
							services,
							{ id: { _eq: orders.product_type } },
							['id', 'coins', 'product_type.product_types', 'product_type.coin'],
							schema,
							'client_product_mapping'
						);
						const totalOrderValue = parseFloat(
							orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
						);
						const productType = coins[0].product_type.product_types;
						const walletType = coins[0].product_type.coin;
						const product_points = await getDataFromCollection(
							services,
							{ id: { _eq: orders.poc } },
							['id', walletType],
							schema,
							'client_point_of_contact'
						);
						const coinsWallet = coins[0].coins
							? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
							: 0;

						const coinsCredit =
							productType != 'ShakePe Points'
								? await updateCoins(
									services,
									schema,
									'credit',
									coinsWallet,
									totalOrderValue,
									orders.user_created,
									orders.poc,
									'cpp',
									orders.client,
									'shakepe_orders',
									null,
									productType,
									walletType
								)
								: null;
						await updateOneNoEmit(
							{
								credit_used: clientCreditUsed + amountToProcess,
							},
							'client',
							services,
							orders.client,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);
						const debitCreditWallet = await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'debit',
							'shakepe_orders',
							'credit_wallet',
							amountToProcess,
							clientCreditWallet,
							orders.user_created,
							orders.calculation.includes('Previous') || amountToProcess > clientCreditWallet ? 'reserved' : null
						);

						const poc_data = await getDataFromCollection(
							services,
							{
								_and: [
									{
										id: {
											_eq: orders.poc,
										},
									},
								],
							},
							['credit_used'],
							schema,
							'client_point_of_contact'
						);
						const pocCreditUsed = parseFloat(isNaN(poc_data[0].credit_used) ? 0 : poc_data[0].credit_used);
						await updateOneNoEmit(
							{
								credit_used: pocCreditUsed + amountToProcess,
							},
							'client_point_of_contact',
							services,
							orders.poc,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);

						return {
							transaction_create: [debitCreditWallet, coinsCredit].filter((id: any) => id != null),
							payment: 'Payment Pending',
							status: orders.calculation.includes('Previous')
								? 'Approval Pending'
								: orders.modified_credit_days && orders.actual_credit_days < orders.credit_days
									? 'Approval Pending'
									: amountToProcess > clientCreditWallet
										? 'Approval Pending'
										: 'Order Open',
							approval_status: orders.calculation.includes('Previous')
								? 'Pending'
								: orders.modified_credit_days && orders.actual_credit_days < orders.credit_days
									? 'Pending'
									: amountToProcess > clientCreditWallet
										? 'Pending'
										: null,
							changes: amountToProcess > clientCreditWallet ? 'exceceed_limit' : null,
							consume_status: 'not_consumed',
						};
					} else {
						const coins = await getDataFromCollection(
							services,
							{ id: { _eq: orders.product_type } },
							['id', 'coins', 'product_type.product_types', 'product_type.coin'],
							schema,
							'client_product_mapping'
						);
						const totalOrderValue = parseFloat(
							orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
						);
						const productType = coins[0].product_type.product_types;
						const walletType = coins[0].product_type.coin;
						const product_points = await getDataFromCollection(
							services,
							{ id: { _eq: orders.poc } },
							['id', walletType],
							schema,
							'client_point_of_contact'
						);
						const coinsWallet = coins[0].coins
							? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
							: 0;
						const coinsCredit =
							productType != 'ShakePe Points'
								? await updateCoins(
									services,
									schema,
									'credit',
									coinsWallet,
									totalOrderValue,
									orders.user_created,
									orders.poc,
									'cpp',
									orders.client,
									'shakepe_orders',
									null,
									productType,
									walletType
								)
								: null;
						const pocDebit = await pocUpdateWallet(
							services,
							schema,
							orders.poc,
							pocWallet,
							pocWallet,
							'debit',
							orders.user_created,
							'shakepe_orders',
							'cpp',
							null,
							orders.client
						);
						const ledger = await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'debit',
							null,
							'wallet',
							pocWallet,
							clientWallet,
							orders.user_created,
							orders.calculation.includes('Previous') ? 'reserved' : null
						);
						const remainingAmount = amountToProcess - pocWallet;

						await updateOneNoEmit(
							{
								credit_used: clientCreditUsed + remainingAmount,
							},
							'client',
							services,
							orders.client,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);

						const debitCreditWallet = await updateWallet(
							orders.client,
							orders.id,
							schema,
							services,
							'debit',
							null,
							'credit_wallet',
							remainingAmount,
							clientCreditWallet,
							orders.user_created,
							orders.calculation.includes('Previous') || remainingAmount > clientCreditWallet ? 'reserved' : null,
							'cpp'
						);

						const poc_data = await getDataFromCollection(
							services,
							{
								_and: [
									{
										id: {
											_eq: orders.poc,
										},
									},
								],
							},
							['credit_used'],
							schema,
							'client_point_of_contact'
						);
						const pocCreditUsed = parseFloat(isNaN(poc_data[0].credit_used) ? 0 : poc_data[0].credit_used);
						await updateOneNoEmit(
							{
								credit_used: pocCreditUsed + clientCreditWallet,
							},
							'client_point_of_contact',
							services,
							orders.poc,
							schema,
							{
								admin: true,
								user: orders.user_created,
							}
						);

						return {
							transaction_create: [pocDebit, debitCreditWallet, coinsCredit, ledger].filter((id: any) => id != null),
							payment: 'partial_payment_recevied',
							status: orders.calculation.includes('Previous')
								? 'Approval Pending'
								: orders.modified_credit_days && orders.actual_credit_days < orders.credit_days
									? 'Approval Pending'
									: remainingAmount > clientCreditWallet
										? 'Approval Pending'
										: 'Order Open',
							approval_status: orders.calculation.includes('Previous')
								? 'Pending'
								: orders.modified_credit_days && orders.actual_credit_days < orders.credit_days
									? 'Pending'
									: remainingAmount > clientCreditWallet
										? 'Pending'
										: null,
							remaining_amount: remainingAmount,
							payment_received: pocWallet,
							changes: remainingAmount > clientCreditWallet ? 'exceceed_limit' : null,
							consume_status: 'not_consumed',
						};
					}
				}
			} else if (orders && jobdata.collection == 'shakepe_orders' && jobdata.data.type == 'DIY') {
				const client_wallet_data = await getDataFromCollection(
					services,
					{ id: { _eq: orders.client } },
					['wallet', 'outstanding_wallet', 'credit_wallet', 'credit_used'],
					schema,
					'client'
				);
				const poc_wallet = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', 'wallet'],
					schema,
					'client_point_of_contact'
				);

				const coins = await getDataFromCollection(
					services,
					{ id: { _eq: orders.product_type } },
					['id', 'coins', 'product_type.product_types', 'product_type.coin'],
					schema,
					'client_product_mapping'
				);
				const totalOrderValue = parseFloat(
					orders.total_value_cashback ? orders.total_value_cashback : orders.total_order_value
				);
				const productType = coins[0].product_type.product_types;
				const walletType = coins[0].product_type.coin;
				const product_points = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', walletType],
					schema,
					'client_point_of_contact'
				);
				const coinsWallet = coins[0].coins
					? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
					: 0;

				const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);
				// Extract wallet and outstanding wallet values
				const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);
				const amountToProcess = parseFloat(
					orders.commerical === 'Cashback'
						? orders.total_value_cashback
						: orders.total_value
							? orders.total_value
							: orders.original_value
				).toFixed(2);
				if (amountToProcess <= clientWallet && amountToProcess <= pocWallet) {
					const ledger = await updateWallet(
						orders.client,
						orders.id,
						schema,
						services,
						'debit',
						'shakepe_orders',
						'wallet',
						amountToProcess,
						clientWallet,
						orders.user_created,
						null,
						jobdata.data.type
					);
					const pocDebitWallet = await pocUpdateWallet(
						services,
						schema,
						orders.poc,
						amountToProcess,
						pocWallet,
						'debit',
						orders.user_created,
						'shakepe_orders',
						'diy',
						null,
						orders.client
					);

					const coinsCredit = await updateCoins(
						services,
						schema,
						'credit',
						coinsWallet,
						totalOrderValue,
						orders.user_created,
						orders.poc,
						'diy',
						orders.client,
						'shakepe_orders',
						null,
						productType,
						walletType
					);

					// Debit amount only for active campaigns
					let coinsdebit;
					const skipDebit = jobdata.data.type === 'DIY' && orders.status === 'Order Open';
					if (!skipDebit) {
						coinsdebit = await updateCoins(
							services,
							schema,
							'debit',
							coinsWallet + totalOrderValue,
							totalOrderValue,
							orders.user_created,
							orders.poc,
							'diy',
							orders.client,
							'shakepe_orders',
							null,
							productType,
							walletType
						);
					}

					let transaction_create;

					if (coinsdebit === 0 || coinsdebit == null || coinsdebit == undefined) {
						transaction_create = [ledger, coinsCredit, pocDebitWallet];
					} else {
						transaction_create = [ledger, coinsdebit, coinsCredit, pocDebitWallet];
					}
					return {
						transaction_create,
						payment: 'Payment Received',
					};
				} else {
					return {
						error: constant.ERROR.INSUFFIENT,
					};
				}
			} else if (orders && jobdata.collection == 'shakepe_orders' && jobdata.data.type == 'enterprise') {
				const coins = await getDataFromCollection(
					services,
					{ id: { _eq: orders.product_type } },
					['id', 'coins', 'product_type.product_types', 'product_type.coin', 'discount'],
					schema,
					'client_product_mapping'
				);

				const amountToProcess = parseFloat(
					orders.commerical === 'Cashback'
						? orders.total_value_cashback
						: orders.total_value
							? orders.total_value
							: orders.original_value
				).toFixed(2);
				const productType = coins[0].product_type.product_types;
				const walletType = coins[0].product_type.coin;
				const productDiscount = coins[0].discount;
				const product_points = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', walletType],
					schema,
					'client_point_of_contact'
				);

				const coinsWallet: any = product_points[0][walletType]
					? parseFloat(isNaN(product_points[0][walletType]) ? 0 : product_points[0][walletType])
					: 0;

				if (amountToProcess <= coinsWallet) {
					const coinsdebit = await updateCoins(
						services,
						schema,
						'debit',
						coinsWallet,
						amountToProcess,
						orders.user_created,
						orders.poc,
						'enterprise',
						orders.client,
						'shakepe_orders',
						null,
						productType,
						walletType
					);
					const shakePeOrder = await getDataFromCollection(
						services,
						{
							_and: [
								{
									client: {
										_eq: orders.client,
									},
								},
								{
									poc: {
										_eq: orders.poc,
									},
								},
								{
									status: {
										_in: ['Order Completed', 'Order Processed'],
									},
								},
								{
									product_type: {
										product_type: {
											_eq: 7,
										},
									},
								},
								{
									campiagn: {
										_null: true,
									},
								},
								{
									consume_status: {
										_in: ['not_consumed', 'partially_consumed'],
									},
								},
							],
						},
						['id', 'total_order_value', 'consume_status', 'consumed_amount', 'date_created'],
						schema,
						'shakepe_orders'
					);
					const consumer: any = {
						create: [],
						update: [],
						delete: [],
					};
					if (shakePeOrder.length != 0) {
						const consumed = consumeAmount(shakePeOrder, amountToProcess, productDiscount);
						await Promise.all(
							consumed.updatedRecords.map(async (orders_points: any) => {
								if (orders_points.consume_status != 'not_consumed') {
									await updateOneNoEmit(
										{
											consume_status: orders_points.consume_status,
											consumed_amount: orders_points.consumed_amount,
										},
										'shakepe_orders',
										services,
										orders_points.id,
										schema,
										{
											admin: true,
											user: orders.user_created,
										}
									);
									consumer.create.push({
										shakepe_orders_id: '+',
										related_shakepe_orders_id: {
											id: orders_points.id,
										},
										amount_debit_coins: orders_points?.consumeNow,
									});
								} else {
									return null;
								}
							})
						);
					}

					return {
						consumer: consumer,
						transaction_create: [coinsdebit],
						payment: 'Payment Received',
					};
				} else {
					return {
						error: constant.ERROR.INSUFFIENT,
					};
				}
			} else if (orders && jobdata.collection == 'corporate_load' && jobdata.data.payment_terms == 'credit') {
				const client_wallet_data = await getDataFromCollection(
					services,
					{ id: { _eq: orders.client_name } },
					['wallet', 'outstanding_wallet', 'credit_wallet', 'credit_used'],
					schema,
					'client'
				);

				const clientCreditWallet = parseFloat(
					isNaN(client_wallet_data[0].credit_wallet) ? 0 : client_wallet_data[0].credit_wallet
				);
				const clientCreditUsed = client_wallet_data[0].credit_used
					? parseFloat(isNaN(client_wallet_data[0].credit_used) ? 0 : client_wallet_data[0].credit_used)
					: 0;
				const amountToProcess = parseFloat(orders.amount).toFixed(2);
				await updateOneNoEmit(
					{
						credit_used: clientCreditUsed + amountToProcess,
					},
					'client',
					services,
					orders.client_name,
					schema,
					{
						admin: true,
						user: orders.user_created,
					}
				);
				const debitCreditWallet = await updateWallet(
					orders.client_name,
					orders.id,
					schema,
					services,
					'debit',
					'corporate_load',
					'credit_wallet',
					amountToProcess,
					clientCreditWallet,
					orders.user_created,
					'reserved',
					'Corporate Load'
				);

				return {
					transaction_create: [debitCreditWallet],
					payment: 'Payment Pending',
				};
			} else if (orders && jobdata.collection == 'corporate_load' && jobdata.data.payment_mode == 'payment_gateway') {
				const client_wallet_data = await getDataFromCollection(
					services,
					{ id: { _eq: orders.client_name } },
					['wallet'],
					schema,
					'client'
				);

				const poc_wallet = await getDataFromCollection(
					services,
					{ id: { _eq: orders.poc } },
					['id', 'wallet'],
					schema,
					'client_point_of_contact'
				);

				// Extract wallet and outstanding wallet values
				const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);

				const amountToProcess = parseFloat(orders.amount).toFixed(2);
				const pocWallet = parseFloat(isNaN(poc_wallet[0].wallet) ? 0 : poc_wallet[0].wallet);

				const creditPOCWallet = await pocUpdateWallet(
					services,
					schema,
					orders.poc,
					amountToProcess,
					pocWallet,
					'credit',
					orders.user_created,
					'corporate_load',
					'cpp',
					null,
					orders.client_name
				);

				const creditWallet = await updateWallet(
					orders.client_name,
					orders.id,
					schema,
					services,
					'credit',
					null,
					'wallet',
					amountToProcess,
					clientWallet,
					orders.user_created,
					null,
					'diy'
				);
				return {
					transaction_create: [creditWallet, creditPOCWallet],
				};
			} else if (orders && jobdata.collection == 'poc_wallet_transfer') {
				const pocPoints = await getDataFromCollection(
					services,
					{
						id: {
							_eq: orders.poc,
						},
					},
					['id', 'wallet', 'links_coins', 'shakepe_codes_coins', 'shakepe_points_coins'],
					schema,
					'client_point_of_contact'
				);
				const client_wallet_data = await getDataFromCollection(
					services,
					{
						_and: [
							{
								id: { _eq: orders.client },
							},
							{
								product_type_mapping: {
									product_type: {
										_eq: orders.type_of_transfer,
									},
								},
							},
							{
								poc: {
									_in: [orders.poc],
								},
							},
						],
					},
					[
						'wallet',
						'product_type_mapping.product_type.product_types',
						'product_type_mapping.discount',
						'product_type_mapping.product_type.id',
						'product_type_mapping.product_type.coin',
					],
					schema,
					'client'
				);
				if (Number.isInteger(orders.amount) && Number(orders.amount) > 0) {
					if (client_wallet_data.length > 0) {
						// Extract wallet and outstanding wallet values
						const clientWallet = parseFloat(isNaN(client_wallet_data[0].wallet) ? 0 : client_wallet_data[0].wallet);
						const productType = client_wallet_data[0].product_type_mapping.find(
							(prod: any) => prod.product_type.id == orders.type_of_transfer
						);
						const findProductTypeDiscount = productType.discount;
						const walletType = productType.product_type.product_types;
						const walletCoins = productType.product_type.coin;
						const pocWallet = parseFloat(isNaN(pocPoints[0]?.wallet) ? 0 : pocPoints[0]?.wallet);
						const shakePeOrder = await getDataFromCollection(
							services,
							{
								_and: [
									{
										client: {
											_eq: orders.client,
										},
									},
									{
										poc: {
											_eq: orders.poc,
										},
									},
									{
										status: {
											_in: ['Order Completed', 'Order Processed'],
										},
									},
									{
										product_type: {
											product_type: {
												_eq: orders.type_of_transfer,
											},
										},
									},
									{
										campiagn: {
											_null: true,
										},
									},
									{
										consume_status: {
											_in: ['not_consumed', 'partially_consumed'],
										},
									},
								],
							},
							[
								'id',
								'total_order_value',
								'consume_status',
								'consumed_amount',
								'date_created',
								'discount',
								'add_or_reduce_discount',
								'order_level_discount',
							],
							schema,
							'shakepe_orders'
						);
						const amount_utilized: any = {
							create: [],
							update: [],
							delete: [],
						};
						const cpp_ledger: any = {
							create: [],
							update: [],
							delete: [],
						};

						const pointsCoins =
							orders.type_of_transfer == 7
								? parseFloat(pocPoints[0]?.shakepe_points_coins)
								: orders.type_of_transfer == 8
									? parseFloat(pocPoints[0]?.shakepe_codes_coins)
									: parseFloat(pocPoints[0]?.links_coins);

						if (pointsCoins >= orders.amount) {
							if (shakePeOrder.length != 0) {
								const consumed = consumeAmount(shakePeOrder, orders.amount, findProductTypeDiscount);
								const remaining =
									consumed.remainingBalance != 0
										? await updateCoins(
											services,
											schema,
											'debit',
											pointsCoins,
											consumed.remainingBalance,
											orders.user_created,
											orders.poc,
											'cpp',
											orders.client,
											'poc_wallet_transfer',
											null,
											walletType,
											walletCoins
										)
										: null;

								remaining
									? cpp_ledger.update.push({
										transfer_poc: '+',
										id: remaining,
									})
									: '';

								const pointsLegeder = await Promise.all(
									consumed.updatedRecords.map(async (orders_points: any) => {
										if (orders_points.consume_status != 'not_consumed') {
											const pocPoints = await getDataFromCollection(
												services,
												{
													id: {
														_eq: orders.poc,
													},
												},
												['id', 'wallet', 'links_coins', 'shakepe_codes_coins', 'shakepe_points_coins'],
												schema,
												'client_point_of_contact'
											);
											const pointsCoins = parseFloat(pocPoints[0]?.shakepe_points_coins);
											await updateOneNoEmit(
												{
													consume_status: orders_points.consume_status,
													consumed_amount: orders_points.consumed_amount,
												},
												'shakepe_orders',
												services,
												orders_points.id,
												schema,
												{
													admin: true,
													user: orders.user_created,
												}
											);
											console.log(walletCoins);
											const updateBalance = await updateCoins(
												services,
												schema,
												'debit',
												pointsCoins,
												orders_points.consumeNow,
												orders.user_created,
												orders.poc,
												'cpp',
												orders.client,
												'poc_wallet_transfer',
												null,

												walletType,
												walletCoins
											);
											amount_utilized.create.push({
												poc_wallet_transfer_id: '+',
												shakepe_orders_id: {
													id: orders_points.id,
												},
												amount_debit_coins: orders_points.consumeNow,
												amount_credit_poc: orders_points.return_amount,
											});
											cpp_ledger.update.push({
												transfer_poc: '+',
												id: updateBalance,
											});

											return updateBalance;
										} else {
											return null;
										}
									})
								);
								const creditPointsWallet = await pocUpdateWallet(
									services,
									schema,
									orders.poc,
									consumed.totalValue,
									pocWallet,
									'credit',
									orders.user_created,
									null,
									'cpp',
									null,
									orders.client
								);
								const ledger = await updateWallet(
									orders.client,
									orders.id,
									schema,
									services,
									'credit',
									'shakepe_orders',
									'wallet',
									consumed.totalValue,
									clientWallet,
									orders.user_created,
									null,
									'cpp'
								);
								cpp_ledger.update.push({
									transfer_poc: '+',
									id: creditPointsWallet,
								});
								cpp_ledger.update.push({
									transfer_poc: '+',
									id: ledger,
								});

								return {
									cpp_ledger: cpp_ledger,
									amount_utilized: amount_utilized,
								};
							} else {
								const discountValue = orders.amount - (orders.amount * findProductTypeDiscount) / 100;
								const debitPointsWallet = await updateCoins(
									services,
									schema,
									'debit',
									pointsCoins,
									orders.amount,
									orders.user_created,
									orders.poc,
									'cpp',
									orders.client,
									'poc_wallet_transfer',
									null,

									walletType,
									walletCoins
								);
								const creditPointsWallet = await pocUpdateWallet(
									services,
									schema,
									orders.poc,
									discountValue,
									pocWallet,
									'credit',
									orders.user_created,
									null,
									'cpp',
									null,
									orders.client
								);
								const ledger = await updateWallet(
									orders.client,
									orders.id,
									schema,
									services,
									'credit',
									'shakepe_orders',
									'wallet',
									discountValue,
									clientWallet,
									orders.user_created,
									null,
									'cpp'
								);
								const cpp_ledger: any = {
									create: [],
									update: [
										{
											transfer_poc: '+',
											id: creditPointsWallet,
										},
										{
											transfer_poc: '+',
											id: debitPointsWallet,
										},
										{
											transfer_poc: '+',
											id: ledger,
										},
									],
									delete: [],
								};

								return { cpp_ledger: cpp_ledger };
							}
						} else {
							return {
								error: constant.ERROR.INSUFFIENT,
							};
						}
					} else {
						return {
							error: constant.ERROR.PRODUCT_TYPE,
						};
					}
				} else {
					return {
						error: constant.ERROR.IS_NAN,
					};
				}
			}
		}
	} catch (error) {
		return {
			error: constant.ERROR.INSUFFIENT,
		};
	}
};

const updateWallet = async (
	clientId: any,
	id: any,
	schema: any,
	services: any,
	type: any,
	order: any,
	wallet_type: any,
	amount: any,
	balance: any,
	user: any,
	reserved: any,
	orderSource?: any
) => {
	const amountToProcess =
		type == 'credit' ? parseFloat(balance) + parseFloat(amount) : parseFloat(balance) - parseFloat(amount);
	await updateOneNoEmit(
		wallet_type == 'outstanding_wallet'
			? { outstanding_wallet: amountToProcess }
			: wallet_type == 'credit_wallet'
				? { credit_wallet: amountToProcess }
				: { wallet: amountToProcess },
		'client',
		services,
		clientId,
		schema,
		{
			admin: true,
			user: user,
		}
	);

	return await createOne(
		services,
		'cpp_ledger',
		{
			opening_balance: balance,
			closing_balance: amountToProcess,
			client_id: clientId,
			amount: type == 'credit' ? amount : null,
			wallet_type: wallet_type,
			status: type,
			tag: reserved ? reserved : order == 'perform_invoice' ? 'perform_invoice' : null,
			debit_amount: type == 'debit' ? amount : null,
			order_id: order == 'shakepe_orders' ? id : null,
			load_id: order == 'corporate_load' ? id : null,
			pi_id: order == 'perform_invoice' ? id : null,
			pi: order == 'perform_invoice' ? id : null,
			order: order == 'shakepe_orders' ? id : null,
			load: order == 'corporate_load' ? id : null,
			order_source: orderSource ? orderSource : 'cpp',
		},
		schema,
		{ admin: true, user: user }
	);
};

const pocUpdateWallet = async (
	services: any,
	schema: any,
	poc_id: any,
	amount: any,
	balance: any,
	type: any,
	user: any,
	order: any,
	orderSource: any,
	id: any,
	clientId?: any
) => {
	const amountToProcess =
		type == 'credit' ? parseFloat(balance) + parseFloat(amount) : parseFloat(balance) - parseFloat(amount);
	await updateOneNoEmit({ wallet: amountToProcess }, 'client_point_of_contact', services, poc_id, schema, {
		admin: true,
		user: user,
	});

	return await createOne(
		services,
		'cpp_ledger',
		{
			opening_balance: balance,
			closing_balance: amountToProcess,
			amount: type == 'credit' ? amount : null,
			wallet_type: 'poc_wallet',
			status: type,
			tag: null,
			debit_amount: type == 'debit' ? amount : null,
			load_id: order == 'corporate_load' ? id : null,
			pi_id: order == 'perform_invoice' ? id : null,
			pi: order == 'perform_invoice' ? id : null,
			order: order == 'shakepe_orders' ? id : null,
			order_id: order == 'shakepe_orders' ? id : null,
			load: order == 'corporate_load' ? id : null,
			order_source: orderSource ? orderSource : 'cpp',
			poc_id: poc_id,
			client_id: clientId,
		},
		schema,
		{ admin: true, user: user }
	);
};

const updateCoins = async (
	services: any,
	schema: any,
	type: any,
	balance: any,
	amount: any,
	user: any,
	poc_id: any,
	orderSource: any,
	clientId: any,
	order: any,
	id: any,
	wallet_type: any,
	wallet_name: any
) => {
	const amountToProcess: any =
		type == 'credit' ? parseFloat(balance) + parseFloat(amount) : parseFloat(balance) - parseFloat(amount);
	await updateOneNoEmit({ [wallet_name]: amountToProcess }, 'client_point_of_contact', services, poc_id, schema, {
		admin: true,
		user: user,
	});
	return await createOne(
		services,
		'cpp_ledger',
		{
			opening_balance: balance,
			closing_balance: amountToProcess,
			amount: type == 'credit' ? amount : null,
			wallet_type: wallet_type,
			status: type,
			tag: null,
			debit_amount: type == 'debit' ? amount : null,
			order: order == 'shakepe_orders' ? id : null,
			order_id: order == 'shakepe_orders' ? id : null,
			order_source: orderSource ? orderSource : 'cpp',
			client_id: clientId,
			poc_id: poc_id,
		},
		schema,
		{ admin: true, user: user }
	);
};

function consumeAmount(records: any, requestedAmount: any, productDiscount: any) {
	const availableAmount: any = records.reduce(
		(sum: any, record: any) => sum + (record.total_order_value - parseFloat(record.consumed_amount)),
		0
	);
	let amountToConsume = Math.min(availableAmount, requestedAmount);
	const remainingBalance: any = requestedAmount - availableAmount > 0 ? requestedAmount - availableAmount : 0;
	let totalValue = 0;

	for (const record of records) {
		if (amountToConsume <= 0) break;

		const remaining: any = record.total_order_value - parseFloat(record.consumed_amount);
		const consumeNow: any = Math.min(remaining, amountToConsume);
		record.consumed_amount = (parseFloat(record.consumed_amount) + consumeNow).toFixed(2);
		record.consumeNow = consumeNow;
		record.return_amount =
			consumeNow -
			(record?.order_level_discount
				? (consumeNow * record?.order_level_discount) / 100
				: (consumeNow * record?.discount) / 100);
		totalValue = totalValue + record.return_amount;
		record.consume_status =
			record.total_order_value === parseFloat(record.consumed_amount) ? 'consumed' : 'partially_consumed';
		delete records.total_order_value;
		delete record.date_created;
		amountToConsume -= consumeNow;
	}

	return {
		updatedRecords: records,
		remainingBalance,
		totalValue: totalValue + remainingBalance - (remainingBalance * productDiscount) / 100,
	};
}

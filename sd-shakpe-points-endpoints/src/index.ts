import { defineEndpoint } from '@directus/extensions-sdk';
import { createOne, createOneNoEmit, deleteOne, logGenerator, updateBatch, updateOne } from './db/setters';
import constant from './constant.json';
import { getDataFromCollection } from './db/getters';
import { env } from 'process';
import axios from 'axios';
import * as amqp from 'amqplib';
import { Readable } from 'stream';
import { toArray } from 'lodash';

export default defineEndpoint(async (router, { services, getSchema, database }) => {
	const schema = await getSchema();

	router.get('/consumerup', (req: any, res: any) => {
		checkAndCreateConsumer();
		checkCreateConsumer();

		res.status(200).json({
			message: constant.rabbitMQ.rabbitMQ,
		});
	});
	router.get('/retry/points/:id', async (req: any, res: any) => {
		const data = req.params;
		const campiagn = await getDataFromCollection(
			services,
			{
				campiagn: {
					_eq: data.id,
				},
			},
			['campiagn'],
			-1,
			schema,
			'shakepe_orders'
		);
		const queueData = {
			status: 'S',
			message: 'Successfully Created the ShakePe Orders',
			request_id: data.id,
		};

		const rabbitMq = await amqp.connect({
			hostname: env.RABBIT_HOST_NAME,
			port: env.RABBIT_PORT,
			username: env.RABBIT_USERNAME,
			password: env.RABBIT_PASSWORD,
		});
		if (campiagn.length > 0) {
			const codeChannel = await rabbitMq.createChannel();
			await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
			const assertQueue = codeChannel.sendToQueue(
				env.SHAKEPE_POINTS_ORDERS_RESPONSE,
				Buffer.from(JSON.stringify(queueData))
			);
			res.status(200).send({ campiagn: queueData });
			logGenerator(
				queueData,
				constant.log_type.success,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		} else {
			const codeChannel = await rabbitMq.createChannel();
			await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
			const assertQueue = codeChannel.sendToQueue(
				env.SHAKEPE_POINTS_ORDERS_RESPONSE,
				Buffer.from(
					JSON.stringify({
						status: 'F',
						message: 'Order is not created',
						request_id: data.id,
					})
				)
			);
			logGenerator(
				{
					status: 'F',
					message: 'Order is not created',
					request_id: data.id,
				},
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
			res.status(400).send({
				status: 'F',
				message: 'Order is not created',
				request_id: data.id,
			});
		}
	});
	async function checkAndCreateConsumer() {
		try {
			const response = await axios.get(
				`http://${env.RABBIT_HOST_NAME}:1${env.RABBIT_PORT}/api/queues/%2F/${env.SHAKEPE_POINTS_ORDERS}`,
				{
					auth: {
						username: env.RABBIT_USERNAME,
						password: env.RABBIT_PASSWORD,
					},
				}
			);
			if (response?.data?.consumer_details?.length == 0) {
				createConsumer();
			}
		} catch (error) {
			createConsumer();

			logGenerator(
				error,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		}
	}

	const createConsumer = async () => {
		try {
			const queue = env.SHAKEPE_POINTS_ORDERS;
			const rabbitMq = await amqp.connect({
				hostname: env.RABBIT_HOST_NAME,
				port: env.RABBIT_PORT,
				username: env.RABBIT_USERNAME,
				password: env.RABBIT_PASSWORD,
			});
			const channel = await rabbitMq.createChannel();

			process.once('SIGINT', async () => {
				await channel.close();
				await rabbitMq.close();
			});

			await channel.assertQueue(queue, { durable: false });
			await channel.consume(
				queue,
				async (message: any) => {
					if (message) {
						logGenerator(
							message?.content?.toString(),
							constant.log_type.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						try {
							const data: any = JSON.parse(message?.content?.toString());
							const client_details = await getDataFromCollection(
								services,
								{
									id: {
										_eq: data.client,
									},
								},
								['id', 'client_id.id', 'shakepe_points_coins', 'client_id.product_type_mapping.*'],
								-1,
								schema,
								'client_point_of_contact'
							);
							if (client_details.length > 0) {
								const checking_product_type = client_details[0].client_id.product_type_mapping.find((product: any) => {
									return product.product == 'ShakePe Points';
								});
								const clientId = client_details[0].client_id.id;

								if (checking_product_type) {
									const order_creation = data;
									order_creation.product_type = checking_product_type.id;
									order_creation.payment_terms = 'Advance';
									order_creation.commerical = 'Upfront';
									order_creation.payment = 'Payment Received';
									order_creation.status = 'Order Completed';
									order_creation.original_value = data.total_order_value;
									order_creation.poc = data.client;
									order_creation.client = clientId;

									const campiagnCreation = {
										id: order_creation.campiagn.request_id,
										campaign_name: order_creation.campiagn.campiagn_name,
										status: order_creation.campiagn.campiagn_status,
										number_of_users: order_creation.campiagn.number_of_users,
										uploaded_file: null,
									};
									const requestId = order_creation.campiagn.request_id;
									const campiagn = await getDataFromCollection(
										services,
										{
											id: {
												_eq: requestId,
											},
										},
										['id'],
										-1,
										schema,
										'shakepe_points_orders'
									);
									if (campiagn?.length > 0) {
										const queueData = {
											status: 'F',
											message: 'Dublicate Request ID',
											request_id: data.campiagn.request_id,
										};

										const codeChannel = await rabbitMq.createChannel();
										await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
										const assertQueue = codeChannel.sendToQueue(
											env.SHAKEPE_POINTS_ORDERS_RESPONSE,
											Buffer.from(JSON.stringify(queueData))
										);
										logGenerator(
											queueData,
											constant.log_type.error,
											constant.collection_name.santa_log,
											schema,
											{
												admin: true,
											},
											services
										);
									} else {
										const { FilesService } = services;
										const service = new FilesService({
											accountability: {
												admin: true,
											},
											schema: schema,
										});
										if (data?.csv_file) {
											const disk: any = toArray(env['STORAGE_LOCATIONS'])[0];
											const primaryKey = await service.uploadOne(
												bufferToStream(Buffer.from(data.csv_file, 'base64')),
												{
													type: 'text/csv',
													storage: disk,
													filename_download: campiagnCreation.id + '.csv',
													title: campiagnCreation.id,
												},
												undefined
											);
											campiagnCreation.uploaded_file = primaryKey;
										} else {
											delete campiagnCreation?.uploaded_file;
										}

										const campiagn = await createOneNoEmit(
											services,
											'shakepe_points_orders',
											campiagnCreation,
											schema,
											{
												admin: true,
												user: '07d8e6bd-c621-4665-9b21-e2e312c77236',
											}
										);

										order_creation.campiagn = campiagn;
										if (campiagn) {
											const orderId = await createOne(services, 'shakepe_orders', order_creation, schema, {
												admin: true,
												user: '07d8e6bd-c621-4665-9b21-e2e312c77236',
											});
											if (orderId?.error == 'error') {
												const queueData = {
													status: 'F',
													message: orderId.message.message,
													request_id: data.campiagn.request_id,
												};
												const codeChannel = await rabbitMq.createChannel();
												await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
												const assertQueue = codeChannel.sendToQueue(
													env.SHAKEPE_POINTS_ORDERS_RESPONSE,
													Buffer.from(JSON.stringify(queueData))
												);
												const delet = await deleteOne('shakepe_points_orders', services, campiagn, schema, {
													admin: true,
													user: '07d8e6bd-c621-4665-9b21-e2e312c77236',
												});
												logGenerator(
													queueData,
													constant.log_type.error,
													constant.collection_name.santa_log,
													schema,
													{
														admin: true,
													},
													services
												);
											} else {
												const queueData = {
													status: 'S',
													message: 'Successfully Created the ShakePe Orders',
													request_id: campiagn,
												};
												const codeChannel = await rabbitMq.createChannel();
												await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
												const assertQueue = codeChannel.sendToQueue(
													env.SHAKEPE_POINTS_ORDERS_RESPONSE,
													Buffer.from(JSON.stringify(queueData))
												);
												logGenerator(
													queueData,
													constant.log_type.success,
													constant.collection_name.santa_log,
													schema,
													{
														admin: true,
													},
													services
												);
											}
										} else {
											const queueData = {
												status: 'F',
												message: 'Dublicate Request ID',
												request_id: data.campiagn.request_id,
											};
											const codeChannel = await rabbitMq.createChannel();
											await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
											const assertQueue = codeChannel.sendToQueue(
												env.SHAKEPE_POINTS_ORDERS_RESPONSE,
												Buffer.from(JSON.stringify(queueData))
											);

											logGenerator(
												queueData,
												constant.log_type.error,
												constant.collection_name.santa_log,
												schema,
												{
													admin: true,
												},
												services
											);
										}
									}
								} else {
									const queueData = {
										status: 'F',
										message: 'Client is Not Mapped with ShakePe Points',
										request_id: data.campiagn.request_id,
									};
									logGenerator(
										queueData,
										constant.log_type.log,
										constant.collection_name.santa_log,
										schema,
										{
											admin: true,
										},
										services
									);
									const codeChannel = await rabbitMq.createChannel();
									await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
									const assertQueue = codeChannel.sendToQueue(
										env.SHAKEPE_POINTS_ORDERS_RESPONSE,
										Buffer.from(JSON.stringify(queueData))
									);
								}
							} else {
								const queueData = {
									status: 'F',
									message: 'Client is not there in zeus',
									request_id: data.campiagn.request_id,
								};

								const codeChannel = await rabbitMq.createChannel();
								await codeChannel.assertQueue(env.SHAKEPE_POINTS_ORDERS_RESPONSE, { durable: false });
								const assertQueue = codeChannel.sendToQueue(
									env.SHAKEPE_POINTS_ORDERS_RESPONSE,
									Buffer.from(JSON.stringify(queueData))
								);
								logGenerator(
									queueData,
									constant.log_type.error,
									constant.collection_name.santa_log,
									schema,
									{
										admin: true,
									},
									services
								);
							}
						} catch (error) {
							logGenerator(
								error,
								constant.log_type.error,
								constant.collection_name.santa_log,
								schema,
								{
									admin: true,
								},
								services
							);
						}
					}
				},
				{ noAck: true }
			);
		} catch (err) {
			logGenerator(
				err,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		}
	};

	async function checkCreateConsumer() {
		try {
			const response = await axios.get(
				`http://${env.RABBIT_HOST_NAME}:1${env.RABBIT_PORT}/api/queues/%2F/${env.EMPLOYEE_DETIALS}`,
				{
					auth: {
						username: env.RABBIT_USERNAME,
						password: env.RABBIT_PASSWORD,
					},
				}
			);
			if (response?.data?.consumer_details?.length == 0) {
				createConsumerPoints();
			}
		} catch (error) {
			createConsumerPoints();

			logGenerator(
				error,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		}
	}

	const createConsumerPoints = async () => {
		try {
			const queue = env.EMPLOYEE_DETIALS;
			const rabbitMq = await amqp.connect({
				hostname: env.RABBIT_HOST_NAME,
				port: env.RABBIT_PORT,
				username: env.RABBIT_USERNAME,
				password: env.RABBIT_PASSWORD,
			});
			const channel = await rabbitMq.createChannel();

			process.once('SIGINT', async () => {
				await channel.close();
				await rabbitMq.close();
			});

			await channel.assertQueue(queue, { durable: false });
			await channel.consume(
				queue,
				async (message: any) => {
					if (message) {
						logGenerator(
							message?.content?.toString(),
							constant.log_type.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						try {
							const data: any = JSON.parse(message?.content?.toString());
							const requestId: any = data.campiagn.request_id;
							const createItems: any = data.campiagn.employee_details?.map((employee: any) => {
								return {
									...employee,
									campign_id: requestId,
									validity_date: data?.validity_date,
									employee_id: employee?.emp_id,
									birthday_date: employee?.birthday_date,
									marriage_date: employee?.marriage_date,
								};
							});
							const created = await createItems.map(async (emp: any) => {
								return await createOneNoEmit(services, 'points_campaign_details', emp, schema, {
									admin: true,
								});
							});
							const { FilesService } = services;
							const service = new FilesService({
								accountability: {
									admin: true,
								},
								schema: schema,
							});
							if (data?.csv_file) {
								const disk: any = toArray(env['STORAGE_LOCATIONS'])[0]
									? toArray(env['STORAGE_LOCATIONS'])[0]
									: env['STORAGE_LOCATIONS'];
								const primaryKey = await service.uploadOne(
									bufferToStream(Buffer.from(data.csv_file, 'base64')),
									{
										type: 'text/csv',
										storage: disk,
										filename_download: requestId + '.csv',
										title: requestId,
									},
									undefined
								);
								const updateData = await updateOne(
									{ uploaded_file: primaryKey },
									'shakepe_points_orders',
									service,
									requestId,
									schema,
									{ admin: true }
								);
							}
						} catch (error) {
							logGenerator(
								error,
								constant.log_type.error,
								constant.collection_name.santa_log,
								schema,
								{
									admin: true,
								},
								services
							);
						}
					}
				},
				{ noAck: true }
			);
		} catch (err) {
			logGenerator(
				err,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		}
	};
});

function bufferToStream(buffer: any) {
	const readableInstanceStream = new Readable({
		read() {
			this.push(buffer);
			this.push(null);
		},
	});
	return readableInstanceStream;
}

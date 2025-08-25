import { defineEndpoint } from '@directus/extensions-sdk';
import { logGenerator, updateBatch, updateOne } from './db/setters';
import constant from './constant.json';
import { getDataFromCollection } from './db/getters';
import { env } from 'process';
import axios from 'axios';
import * as amqp from 'amqplib';

export default defineEndpoint(async (router, { services, getSchema, database }) => {
	const schema = await getSchema();
	const authMiddleware = async (req: any, res: any, next: any) => {
		if (req.token) {
			const user = await database
				.select('directus_users.id', 'directus_users.role', 'directus_roles.admin_access', 'directus_roles.app_access')
				.from('directus_users')
				.leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
				.where({
					'directus_users.token': req.token,
					status: 'active',
				})
				.first();
			logGenerator(
				{
					user: user,
				},
				constant.log_type.log,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
			if (!user.role && !user.admin_access && !user.app_access) {
				res.status(401).send({
					errors: [
						{
							message: constant.messages.invaildCredentials,
							extensions: {
								code: constant.code_error.INVALID_CREDENTIALS,
							},
						},
					],
				});
			} else {
				req.accountability.user = user.id;
				req.accountability.role = user.role;
				req.accountability.admin = user.admin_access === true || user.admin_access == 1;
				req.accountability.app = user.app_access === true || user.app_access == 1;
				next();
			}
		} else {
			res.status(401).send({
				errors: [
					{
						message: constant.messages.invaildCredentials,
						extensions: {
							code: constant.code_error.INVALID_CREDENTIALS,
						},
					},
				],
			});
		}
	};
	router.post('/verifiedsantacodes', authMiddleware, async (req: any, res: any) => {
		logGenerator(
			{
				body: req.body,
				header: req.headers,
			},
			constant.log_type.log,
			constant.collection_name.santa_log,
			schema,
			{
				admin: true,
			},
			services
		);
		const { status, response, reference_number } = req.body;
		setTimeout(async () => {
			if (status && response && reference_number) {
				const orderId = reference_number.split('_');
				const orderData = await getDataFromCollection(
					services,
					{
						_and: [
							{
								code_id: {
									shake_pe_order_id: {
										id: {
											_eq: parseInt(orderId[0]),
										},
									},
								},
							},
						],
					},
					constant.collections.shakepe_codes_inventory,
					-1,
					schema,
					'shakepe_codes_inventory'
				);

				if (orderData.length > 0) {
					const currentDate = new Date();
					const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
					const updateInventory = orderData.map((code: any) => {
						if (status == 'S') {
							const activationDate = parseDate(code?.activation_date);
							if (activationDate <= currentDateOnly) {
								return {
									id: code.id,
									status: constant.status,
									code_status:  constant.status_update.active,
									validity_status: constant.status_update.valid,
									redemption_status: constant.status_update.unredeemed,
								};
							} else {
								return {
									id: code.id,
									status: constant.status,
								};
							}
						} else {
							return {
								id: code.id,
								status: constant.available,
								code_id: null,
								denomination: null,
								validity: null,
								activation_date: null,
							};
						}
					});
					logGenerator(
						{
							update: updateInventory,
							order: orderData,
							order_id: parseInt(orderId[0]),
						},
						constant.log_type.log,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					updateBatch(updateInventory, 'shakepe_codes_inventory', services, schema, {
						admin: true,
					});
					if (status == 'S') {
						updateOne(
							{
								enterprice_status: constant.success,
								enterprice_comment: constant.success_comment,
							},
							'shakepe_orders',
							services,
							parseInt(orderId[0]),
							schema,
							{
								admin: true,
							}
						);
					} else {
						updateOne(
							{
								enterprice_status: constant.failed,
								enterprice_comment: response,
								prefix: '',
							},
							'shakepe_orders',
							services,
							parseInt(orderId[0]),
							schema,
							{
								admin: true,
							}
						);
					}

					return res.status(201).send({
						message: status == 'S' ? constant.messages.successful : constant.messages.revoked,
						status: constant.success,
					});
				} else {
					res.status(401).send({
						message: constant.messages.order_id_notexit,
					});
				}
			} else {
				logGenerator(
					{
						body: req.body,
						header: req.headers,
						message: constant.messages.invaildpayload,
					},
					constant.log_type.log,
					constant.collection_name.santa_log,
					schema,
					{
						admin: true,
					},
					services
				);
				res.status(401).send({
					message: constant.messages.invaildpayload,
				});
			}
		}, 3000);
	});

	router.get('/consumerup', (req : any , res : any) => {
		checkAndCreateConsumer()
		res.status(200).json({
			message : constant.rabbitMQ.rabbitMQ
		})
	} )
	function parseDate(dateString: any) {
		const date = new Date(dateString);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	}
	(async () => {
		try {
			const queue = env.RABBIT_QUEUE_RECEVIED ?? 'zeus_codes_recevied';
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
				(message: any) => {
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
						const data: any = JSON.parse(message?.content?.toString());

						const { status, response, reference_number } = data;
						setTimeout(async () => {
							if (status && response && reference_number) {
								const orderId = reference_number.split('_');
								const orderData = await getDataFromCollection(
									services,
									{
										id: {
											_eq: parseInt(orderId[0]),
										},
										filtering_with_product_type: {
											_eq: constant.codes,
										},
									},
									constant.collections.shakepe_orders,
									1,
									schema,
									'shakepe_orders'
								);
								if (orderData.length == 1) {
									const order = orderData[0];
									const updateInventory = order.shakepe_codes_orders
										.map((codes: any) => {
											return codes.sd_codes.map((code: any) => {
												if (status == 'S') {
													return {
														id: code.id,
														status: constant.status,
													};
												} else {
													return {
														id: code.id,
														status: constant.available,
														code_id: null,
														denomination: null,
														validity: null,
														activation_date: null,
													};
												}
											});
										})
										.flat(1);
									logGenerator(
										{
											update: updateInventory,
											order: order,
											order_id: parseInt(orderId[0]),
										},
										constant.log_type.log,
										constant.collection_name.santa_log,
										schema,
										{
											admin: true,
										},
										services
									);
									updateBatch(updateInventory, 'shakepe_codes_inventory', services, schema, {
										admin: true,
									});
									if (status == 'S') {
										updateOne(
											{
												enterprice_status: constant.success,
												enterprice_comment: constant.success_comment,
											},
											'shakepe_orders',
											services,
											parseInt(orderId[0]),
											schema,
											{
												admin: true,
											}
										);
									} else {
										updateOne(
											{
												enterprice_status: constant.failed,
												enterprice_comment: response,
												prefix: '',
											},
											'shakepe_orders',
											services,
											parseInt(orderId[0]),
											schema,
											{
												admin: true,
											}
										);
									}
								} else {
									logGenerator(
										{
											body: data,
											orderData: orderData,
											message: constant.messages.invaildpayload,
										},
										constant.log_type.error,
										constant.collection_name.santa_log,
										schema,
										{
											admin: true,
										},
										services
									);
								}
							} else {
								logGenerator(
									{
										body: data,
										message: constant.messages.invaildpayload,
									},
									constant.log_type.error,
									constant.collection_name.santa_log,
									schema,
									{
										admin: true,
									},
									services
								);
							}
						}, 3000);
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
	})();

	async function checkAndCreateConsumer() {
		try {
			const response = await axios.get(
				`http://${env.RABBIT_HOST_NAME}:1${env.RABBIT_PORT}/api/queues/%2F/${env.CODE_STATUS_UPDATE}`,
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
			const queue = env.CODE_STATUS_UPDATE;
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
				(message: any) => {
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

							const { action, code_status, codes_info } = data;
							setTimeout(async () => {
								if (codes_info?.length > 0) {
									let updateInventory = await getDataFromCollection(
										services,
										{
											code: {
												_in: codes_info,
											},
										},
										['id'],
										-1,
										schema,
										'shakepe_codes_inventory'
									);
									updateInventory = updateInventory.map((code: any) => {
										switch (action) {
											case constant.santa.code_activation:
												return {
													id: code.id,
													code_status: constant.status_update.active,
													validity_status: constant.status_update.valid,
													redemption_status: constant.status_update.unredeemed,
												};
											case constant.santa.code_expire:
												return {
													id: code.id,

													validity_status: constant.status_update.expired,
												};
											case constant.santa.code_redeemed:
												return {
													id: code.id,
													redemption_status: constant.status_update.redeemed,
													redemption_status_of_points: constant.status_update.unredeemed,
												};
											case constant.santa.points_redeemed:
												return {
													id: code.id,
													redemption_status_of_points:
														code_status == constant.santa.partially_redeemed
															? constant.status_update.partially_redeemed
															: constant.status_update.fully_redeemed,
												};
											case constant.santa.code_single_status:
												if (code_status == 'A') {
													return {
														id: code.id,
														code_status: constant.status_update.active,
														validity_status: constant.status_update.valid,
														redemption_status: constant.status_update.unredeemed,
													};
												} else {
													return {
														id: code.id,
														code_status:
															code_status == 'E' ? constant.status_update.disabled : constant.status_update.inactive,
													};
												}

											default:
												return {
													id: code.id,
												};
										}
									});
									updateBatch(updateInventory, 'shakepe_codes_inventory', services, schema, {
										admin: true,
									});
								} else {
									logGenerator(
										data,
										constant.log_type.error,
										constant.collection_name.santa_log,
										schema,
										{
											admin: true,
										},
										services
									);
								}
							}, 3000);
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

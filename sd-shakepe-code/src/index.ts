import { defineHook } from '@directus/extensions-sdk';
import constant from './constant.json';
import {
	updateOne,
	updateBatch,
	logGenerator,
	mail,
	createMany,
	createOne,
	updateOneNoEmit,
	deleteMany,
} from './db/setter';
import { env } from 'process';
import { getDataFromCollection, assetServices } from './db/getter';
import * as amqp from 'amqplib';
import axios from 'axios';
import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';

const emailEndpointIds = {
	codeReq: 31,
	appNewCodeReq: 32,
	decNewCodeReq: 33,
	printReqWithPin: 34,
	sendPiToclient: 35,
	pocFundTrans: 62,
};
const notificationId = {
	codeReq: 30,
	appNewCodeReq: 31,
	decNewCodeReq: 32,
	pocFundTrans: 52,
};

export default defineHook(async ({ filter, action }, { services, exceptions, database, getSchema }) => {
	const { ItemsService, MailService } = services;
	const { InvalidPayloadException } = exceptions;
	const schema = await getSchema();
	filter('shakepe_orders.items.create', async (payload: any, meta: any, context: any) => {
		if (payload?.filtering_with_product_type == constant.shakepe_orders.shakepe_codes) {
			if (!payload?.form_factor || payload?.form_factor == constant.shakepe_orders.virtual) {
				const codeValidty = payload?.validity_of_code;

				const totalNumberOfCodes = payload.shakepe_codes_orders.create.reduce(
					(acc: any, current: any) => acc + current.total_no_of_codes,
					0
				);
				if (totalNumberOfCodes > 5000) {
					throw new InvalidPayloadException(constant.error.virual_codes);
				}
				const vaildTill = payload.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						validity: addingValidDate(code.activation ? code.activation : payload?.activation_date, codeValidty),
					};
				});
				payload.shakepe_codes_orders.create = vaildTill;
				return payload;
			}
			if (
				payload.form_factor != constant.shakepe_orders.virtual &&
				payload?.checkbox.length > 0 &&
				payload?.checkbox[0] == 'TRUE'
			) {
				const codeValidty = payload?.validity_of_code;
				const vaildTill = payload.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						activation: payload.activation_date,

						validity: addingValidDate(payload.activation_date, codeValidty),
					};
				});
				payload.shakepe_codes_orders.create = vaildTill;
				return payload;
			}
			if (payload?.checkbox == 0 && payload.form_factor != constant.shakepe_orders.virtual) {
				const codeValidty = payload?.validity_of_code;
				const vaildTill = payload.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						validity: addingValidDate(code?.activation, codeValidty),
					};
				});
				payload.shakepe_codes_orders.create = vaildTill;
				return payload;
			}
		}
	});
	filter('shakepe_orders.items.update', async (payload: any, meta, context) => {
		const { event, keys, collection } = meta;

		const shakepeOrder = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
				status: {
					_in: constant.condition.shakepe_orders,
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

		if (shakepeOrder?.length > 0) {
			if (payload?.prefix && shakepeOrder[0].form_factor == constant.shakepe_orders.virtual && payload?.code_length) {
				if (payload?.code_length < 14 || payload?.code_length > 18) {
					throw new InvalidPayloadException(constant.error.code_length);
				}
				const orderCodeIds = shakepeOrder[0].shakepe_codes_orders.map((data: any) => {
					return data.id;
				});

				const codesInventoryData = await getDataFromCollection(
					services,
					{
						code_id: {
							_in: orderCodeIds,
						},
					},
					constant.collections.shakepe_codes_inventory,
					-1,
					schema,
					'shakepe_codes_inventory'
				);
				const gettingValues = shakepeOrder[0].shakepe_codes_orders.reduce(
					(accumulator: any, item: any) => {
						const totalCodes = Number(item.total_no_of_codes);

						// Calculate the product and add to the accumulator
						accumulator.total_codes_value += item.value_of_code * totalCodes;

						// Add total_no_of_codes to the total sum
						accumulator.total_codes += totalCodes;
						accumulator.aleady_codes += item.sd_codes.length;

						return accumulator;
					},
					{ total_codes_value: 0, total_codes: 0, aleady_codes: 0 }
				);
				if (codesInventoryData.length >= gettingValues.total_codes) {
					logGenerator(
						{
							shakepe_order: shakepeOrder[0].id,
							error: constant.error.code_generated,
						},
						constant.logger.error,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					throw new InvalidPayloadException(constant.error.code_generated);
				} else {
					try {
						const retry = parseInt(shakepeOrder[0].retry) + 1;
						const referenceNumber = shakepeOrder[0].id + '_' + retry;
						const postingDate = {
							zeus_company_id: shakepeOrder[0].poc,
							zeus_company_name: shakepeOrder[0].client.client_name,
							total_codes_points: gettingValues.total_codes_value,
							reference_number: referenceNumber,
						};
						logGenerator(
							postingDate,
							constant.logger.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						const enterpriseAmountCheck = await axios.post(env.ENTERPRISE_URL, postingDate, {
							headers: {
								Authorization: `Basic ${env.ENTERPRISE_TOKEN}`,
								'Content-Type': 'application/json',
							},
						});
						logGenerator(
							enterpriseAmountCheck?.data,
							constant.logger.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						if (enterpriseAmountCheck?.data?.status == 'S') {
							const newlyCreatedCodes = await Promise.all(
								shakepeOrder[0].shakepe_codes_orders.map(async (codes: any) => {
									return await codeCreation(
										payload.prefix,
										codes.total_no_of_codes,
										database,
										codes.id,
										payload.code_length,
										shakepeOrder[0].form_factor,
										codes.value_of_code,
										codes.validity,
										codes.activation
									);
								})
							);

							createChunksRecursive(newlyCreatedCodes.flat(1), database, schema, services);
							try {
								const data = await rabbitMq(
									shakepeOrder[0],
									referenceNumber,
									gettingValues,
									newlyCreatedCodes,
									schema,
									services,
									InvalidPayloadException,
									shakepeOrder[0].form_factor
								);
								if (data) {
									payload.retry = retry;
									payload.enterprice_status = constant.Pushed;
									payload.enterprice_comment = constant.comment_enterprice;
									payload.status = constant.condition.processed;

									return payload;
								}
							} catch (error) {
								logGenerator(
									{
										hostname: env.RABBIT_HOST_NAME,
										port: env.RABBIT_PORT,
										username: env.RABBIT_USERNAME,
										password: env.RABBIT_PASSWORD,
										status: 'failed',
									},
									constant.logger.error,
									constant.collection_name.santa_log,
									schema,
									{
										admin: true,
									},
									services
								);
								throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
							}
						} else {
							logGenerator(
								enterpriseAmountCheck.data,
								constant.logger.error,
								constant.collection_name.santa_log,
								schema,
								{
									admin: true,
								},
								services
							);
							throw {
								error: new InvalidPayloadException(constant.error.insufficient_balance),
								data: enterpriseAmountCheck.data,
							};
						}
					} catch (error: any) {
						logGenerator(
							{
								shakepe_order: shakepeOrder[0].id,
								url: env.ENTERPRISE_URL,
								method: 'post',
								status: 'failed',
								response: error?.data,
							},
							constant.logger.error,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						if (error.data?.status == 'F') {
							throw new InvalidPayloadException(error.data.response);
						} else {
							throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
						}
					}
				}
			}
			if (shakepeOrder[0].form_factor != constant.shakepe_orders.virtual && payload?.prefix) {
				logGenerator(
					{
						shakepe_order: shakepeOrder[0].id,
						shakepelength: shakepeOrder?.length,
						payload: payload.prefix,
					},
					constant.logger.log,
					constant.collection_name.santa_log,
					schema,
					{
						admin: true,
					},
					services
				);
				const orderDetails = shakepeOrder[0];
				if (
					!orderDetails.client.id &&
					!orderDetails.client.client_name &&
					!orderDetails.shakepe_codes_orders &&
					!orderDetails.id
				) {
					throw InvalidPayloadException(constant.error.something);
				}

				const gettingValues = orderDetails.shakepe_codes_orders.reduce(
					(accumulator: any, item: any) => {
						const totalCodes = Number(item.total_no_of_codes);

						// Calculate the product and add to the accumulator
						accumulator.total_codes_value += item.value_of_code * totalCodes;

						// Add total_no_of_codes to the total sum
						accumulator.total_codes += totalCodes;
						accumulator.aleady_codes += item.sd_codes.length;

						return accumulator;
					},
					{ total_codes_value: 0, total_codes: 0, aleady_codes: 0 }
				);
				const codesInventory = await getDataFromCollection(
					services,
					{
						_and: [
							{
								code_id: {
									_null: true,
								},
							},
							{
								prefix: {
									_eq: payload?.prefix,
								},
							},
							{
								status: {
									_eq: constant.Available,
								},
							},
							{
								_or: [
									{
										creation_id: {
											printers: {
												id: {
													_eq: orderDetails.printer.printer_id,
												},
											},
										},
									},
									{
										creation_id: {
											client: {
												_eq: shakepeOrder[0].product_type,
											},
										},
									},
								],
							},
						],
					},
					constant.collections.shakepe_codes_inventory,
					gettingValues?.total_codes,
					schema,
					'shakepe_codes_inventory',
					['serial_number']
				);
				if (gettingValues.aleady_codes >= gettingValues?.total_codes) {
					logGenerator(
						{
							shakepe_order: shakepeOrder[0].id,
							already_assigned: true,
						},
						constant.logger.error,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					throw new InvalidPayloadException(constant.error.assigned);
				}
				if (codesInventory?.length == gettingValues?.total_codes) {
					try {
						logGenerator(
							{
								shakepe_order: shakepeOrder[0].id,
								checking_length: true,
								codesInventory: codesInventory,

								filter: {
									_and: [
										{
											code_id: {
												_null: true,
											},
										},
										{
											prefix: {
												_eq: payload?.prefix,
											},
										},
										{
											status: {
												_eq: constant.Available,
											},
										},
										{
											creation_id: {
												printers: {
													_eq: orderDetails.printer.printer_id,
												},
											},
										},
										{
											creation_id: {
												printer: {
													_eq: null,
												},
											},
										},
									],
								},

								inventory_length: codesInventory?.length,
								order_length: gettingValues?.total_codes,
							},
							constant.logger.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						const retry = parseInt(orderDetails.retry) + 1;
						const referenceNumber = orderDetails.id + '_' + retry;
						const postingDate = {
							zeus_company_id: orderDetails.poc,
							zeus_company_name: orderDetails.client.client_name,
							total_codes_points: gettingValues.total_codes_value,
							reference_number: referenceNumber,
						};
						logGenerator(
							postingDate,
							constant.logger.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						const enterpriseAmountCheck = await axios.post(env.ENTERPRISE_URL, postingDate, {
							headers: {
								Authorization: `Basic ${env.ENTERPRISE_TOKEN}`,
								'Content-Type': 'application/json',
							},
						});
						logGenerator(
							enterpriseAmountCheck?.data,
							constant.logger.log,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						if (enterpriseAmountCheck?.data?.status == 'S') {
							try {
								const data = await rabbitMq(
									orderDetails,
									referenceNumber,
									gettingValues,
									codesInventory,
									schema,
									services,
									InvalidPayloadException
								);
								if (data) {
									const statusChange = data?.codes_info
										.map((file: any) => {
											return file.codes_data.map((code: any) => {
												return {
													id: code.id,
													code_id: file.id,
													denomination: file.denomination,
													activation_date: file.activation_date,
													validity: file.valid_till,
													status: constant.status.assigningClient,
													user_updated: context?.accountability?.user,
													code_status: constant.InActive,
													date_updated: new Date(),
												};
											});
										})
										.flat(1);
									const updatePromises = statusChange?.map(async (update: any) => {
										return await database('shakepe_codes_inventory').where('id', update.id).update(update);
									});
									Promise.allSettled(updatePromises);
									payload.retry = retry;
									payload.enterprice_status = constant.Pushed;
									payload.enterprice_comment = constant.comment_enterprice;
									payload.status = constant.condition.processed;

									return payload;
								}
							} catch (error) {
								logGenerator(
									{
										hostname: env.RABBIT_HOST_NAME,
										port: env.RABBIT_PORT,
										username: env.RABBIT_USERNAME,
										password: env.RABBIT_PASSWORD,
										status: 'failed',
									},
									constant.logger.error,
									constant.collection_name.santa_log,
									schema,
									{
										admin: true,
									},
									services
								);
								throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
							}
						} else {
							logGenerator(
								enterpriseAmountCheck.data,
								constant.logger.error,
								constant.collection_name.santa_log,
								schema,
								{
									admin: true,
								},
								services
							);
							throw {
								error: new InvalidPayloadException(constant.error.insufficient_balance),
								data: enterpriseAmountCheck.data,
							};
						}
					} catch (error: any) {
						logGenerator(
							{
								shakepe_order: shakepeOrder[0].id,
								url: env.ENTERPRISE_URL,
								method: 'post',
								status: 'failed',
								response: error?.data,
							},
							constant.logger.error,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						if (error.data?.status == 'F') {
							throw new InvalidPayloadException(error.data.response);
						} else {
							throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
						}
					}
				} else {
					logGenerator(
						{
							shake_pe_order: shakepeOrder[0].id,
							checking_length: false,
							inventory_length: codesInventory?.length,
							order_length: gettingValues?.total_codes,
							codesInventory: codesInventory,
							filter: {
								_and: [
									{
										code_id: {
											_null: true,
										},
									},
									{
										prefix: {
											_eq: payload?.prefix,
										},
									},
									{
										status: {
											_eq: constant.Available,
										},
									},
									{
										creation_id: {
											printers: {
												_eq: orderDetails.printer.printer_id,
											},
										},
									},
									{
										creation_id: {
											printer: {
												_null: true,
											},
										},
									},
								],
							},
						},
						constant.logger.error,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					throw new InvalidPayloadException(constant.error.insufficient_qty);
				}
			}
			if (
				shakepeOrder[0].form_factor != constant.shakepe_orders.virtual &&
				payload?.status == constant.condition.processed
			) {
				const dataFile = shakepeOrder[0].file_upload_data.map((file: any) => {
					return {
						serial_number: file.serial_number,
						denomination: file.denomination,
					};
				});
				const orderDetails = shakepeOrder[0];
				const codesInventory = await getDataFromCollection(
					services,
					{
						_and: [
							{
								serial_number: {
									_in: dataFile.map((file: any) => {
										return file.serial_number;
									}),
								},
							},
							{
								status: {
									_eq: constant.Available,
								},
							},
							{
								creation_id: {
									client: {
										_eq: shakepeOrder[0].product_type,
									},
								},
							},
						],
					},
					constant.collections.shakepe_codes_inventory,
					-1,
					schema,
					'shakepe_codes_inventory',
					['serial_number']
				);

				if (codesInventory.length == dataFile.length) {
					const gettingValues = orderDetails.shakepe_codes_orders.reduce(
						(accumulator: any, item: any) => {
							const totalCodes = Number(item.total_no_of_codes);

							// Calculate the product and add to the accumulator
							accumulator.total_codes_value += item.value_of_code * totalCodes;

							// Add total_no_of_codes to the total sum
							accumulator.total_codes += totalCodes;
							accumulator.aleady_codes += item.sd_codes.length;

							return accumulator;
						},
						{ total_codes_value: 0, total_codes: 0, aleady_codes: 0 }
					);

					logGenerator(
						{
							shake_pe_order: shakepeOrder[0].id,
							checking_length: true,
							inventory_length: codesInventory?.length,
							order_length: gettingValues?.total_codes,
						},
						constant.logger.log,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					const retry = parseInt(orderDetails.retry) + 1;
					const referenceNumber = orderDetails.id + '_' + retry;
					const postingDate = {
						zeus_company_id: orderDetails.poc,
						zeus_company_name: orderDetails.client.client_name,
						total_codes_points: gettingValues.total_codes_value,
						reference_number: referenceNumber,
					};
					logGenerator(
						postingDate,
						constant.logger.log,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					const enterpriseAmountCheck = await axios.post(env.ENTERPRISE_URL, postingDate, {
						headers: {
							Authorization: `Basic ${env.ENTERPRISE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});
					logGenerator(
						enterpriseAmountCheck?.data,
						constant.logger.log,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					if (enterpriseAmountCheck?.data?.status == 'S') {
						try {
							const data = await rabbitMq(
								orderDetails,
								referenceNumber,
								gettingValues,
								codesInventory,
								schema,
								services,
								InvalidPayloadException,
								'data'
							);
							if (data) {
								const statusChange = data?.codes_info
									.map((file: any) => {
										return file.codes_data.map((code: any) => {
											return {
												id: code.id,
												code_id: file.id,
												denomination: file.denomination,
												activation_date: file.activation_date,
												validity: file.valid_till,
												status: constant.status.assigningClient,
												user_updated: context?.accountability?.user,
												code_status: constant.InActive,
												date_updated: new Date(),
											};
										});
									})
									.flat(1);
								const updatePromises = statusChange?.map(async (update: any) => {
									return await database('shakepe_codes_inventory').where('id', update.id).update(update);
								});
								Promise.allSettled(updatePromises);
								payload.retry = retry;
								payload.enterprice_status = constant.Pushed;
								payload.enterprice_comment = constant.comment_enterprice;
								payload.status = constant.condition.processed;
								return payload;
							}
						} catch (error) {
							logGenerator(
								{
									hostname: env.RABBIT_HOST_NAME,
									port: env.RABBIT_PORT,
									username: env.RABBIT_USERNAME,
									password: env.RABBIT_PASSWORD,
									status: 'failed',
								},
								constant.logger.error,
								constant.collection_name.santa_log,
								schema,
								{
									admin: true,
								},
								services
							);
							throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
						}
					} else {
						logGenerator(
							enterpriseAmountCheck.data,
							constant.logger.error,
							constant.collection_name.santa_log,
							schema,
							{
								admin: true,
							},
							services
						);
						throw {
							error: new InvalidPayloadException(constant.error.insufficient_balance),
							data: enterpriseAmountCheck.data,
						};
					}
				} else {
					logGenerator(
						{
							codesInventory: codesInventory,
							dataFile: dataFile,
						},
						constant.logger.error,
						constant.collection_name.santa_log,
						schema,
						{
							admin: true,
						},
						services
					);
					throw new InvalidPayloadException(constant.error.insufficient_qty);
				}
			}
		}
	});
	filter('shakepe_codes_inventory.items.read', async (query: any, meta: any, context: any) => {
		// eslint-disable-next-line no-prototype-builtins
		const allObjectsHaveKey = query.every((obj: object) => obj?.hasOwnProperty('code'));
		if (allObjectsHaveKey && context?.accountability?.role != env.ADMIN_ROLE && !context?.accountability?.admin) {
			query = query?.map((codes: any) => {
				return {
					...codes,
					code: maskString(codes.code, env.MASK_FRONT, env.MASK_BACK, env.MASK_CHARACTER),
				};
			});
			return query;
		}
	});
	filter('shakepe_orders.items.read', async (query: any) => {
		const shakepeCodeOrders = query.every((codes: any) => {
			return codes?.shakepe_codes_orders != undefined;
		});
		if (shakepeCodeOrders) {
			const codesChecking = query.map((codes: any) => {
				return {
					...codes,
					shakepe_codes_orders:
						codes?.shakepe_codes_orders?.length > 0
							? codes?.shakepe_codes_orders?.map((codeData: any) => {
								return {
									...codeData,
									sd_codes:
										codeData?.sd_codes?.length > 0
											? codeData?.sd_codes?.map((code: any) => {
												return {
													...code,
													code: code?.code
														? maskString(code.code, env.MASK_FRONT, env.MASK_BACK, env.MASK_CHARACTER)
														: '',
												};
											})
											: [],
								};
							})
							: [],
				};
			});
			return codesChecking;
		}
	});
	filter('shakepe_codes_creations.items.create', async (payload: any) => {
		payload.status = constant.status.pending;
		if (payload?.printer) {
			const printerDetails = await getDataFromCollection(
				services,
				{
					id: {
						_eq: payload?.printer,
					},
				},
				['printer_id'],
				1,
				schema,
				'printer_client_mapping'
			);
			payload.printers = printerDetails[0]?.printer_id;
		}
		return payload;
	});
	action('shakepe_codes_creations.items.create', async (payload: any, context: any) => {
		const roles_filter = {
			id: {
				_eq: env.MANAGAMENT_ROLE,
			},
		};
		const idmanagement = await getDataFromCollection(
			services,
			roles_filter,
			['users.email', 'users.id'],
			-1,
			schema,
			'directus_roles'
		);
		const management = idmanagement[0]?.users?.map((user: any) => {
			return user.email;
		});
		const managementIds = idmanagement[0]?.users?.map((user: any) => {
			return user.id;
		});
		const clientDetails = await getDataFromCollection(
			services,
			{
				id: {
					_eq: payload.payload.client,
				},
			},
			constant.collections.client_product_mapping,
			1,
			schema,
			'client_product_mapping'
		);
		const printerDetails = await getDataFromCollection(
			services,
			{
				id: {
					_eq: payload.payload.printers,
				},
			},
			['printer_name', 'per_card_cost_for_printer'],
			1,
			schema,
			'printer_details'
		);
		const printerClient = clientDetails[0]?.printer_details?.find((print: any) => {
			return print.id == payload.payload.printer;
		});
		const emailTemplate = {
			to: management,
			users: managementIds,
			subject_data: {
				id: payload.key,
				...payload.payload,
				url_link: env.CURRENT_URL + 'admin/content/shakepe_codes_creations/' + payload.key,
				codelength: payload.payload.code_length ? payload.payload.code_length : 14,
				printerDetails: printerDetails,
				printerClient: printerClient,
				clientDetails: clientDetails,
			},

			body_data: {
				...payload.payload,
				url_link: env.CURRENT_URL + 'admin/content/shakepe_codes_creations/' + payload.key,
				id: payload.key,
				codelength: payload.payload.code_length ? payload.payload.code_length : 14,
				printerDetails: printerDetails,
				printerClient: printerClient,
				clientDetails: clientDetails,
			},
			item: payload.key,
		};
		axios
			.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.codeReq}`, emailTemplate)
			.then((response) => {
				return response;
			})
			.catch((error) => {
				return error;
			});
		axios
			.post(`${env.CURRENT_URL}email/notifications/${notificationId.codeReq}`, emailTemplate)
			.then((response) => {
				return response;
			})
			.catch((error) => {
				return error;
			});
	});
	filter('shakepe_codes_creations.items.update', async (payload: any, meta: any, context: any) => {
		try {
			const mailService = new MailService({ schema, knex: database });
			if (payload.status) {
				const codeOrdered = await getDataFromCollection(
					services,
					{
						id: {
							_eq: meta.keys[0],
						},
					},
					constant.fields.shakepe_codes_request,
					1,
					schema,
					'shakepe_codes_creations'
				);
				switch (payload.status) {
					case constant.status.approved:
						{
							const mailOptions = {
								to: [codeOrdered[0].user_created.email],
								users: [codeOrdered[0].user_created.id],
								subject_data: {
									id: meta.keys[0],
									prefix: codeOrdered[0]?.prefix,
									number_of_codes: codeOrdered[0]?.number_of_codes,
									url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
									client_name: codeOrdered[0]?.client?.client_id,
									printer_details: codeOrdered[0]?.printer,
									codelength: codeOrdered[0]?.code_length,
								},
								body_data: {
									prefix: codeOrdered[0]?.prefix,
									number_of_codes: codeOrdered[0]?.number_of_codes,
									url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
									client_name: codeOrdered[0]?.client?.client_id,
									printer_details: codeOrdered[0]?.printer,
									codelength: codeOrdered[0]?.code_length,
									id: meta.keys[0],
								},
								item: meta.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.appNewCodeReq}`, mailOptions)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.appNewCodeReq}`, mailOptions)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});

							return payload;
						}
						break;
					case constant.status.declined:
						{
							const mailOptions = {
								to: [codeOrdered[0].user_created.email],
								users: [codeOrdered[0].user_created.id],

								subject_data: {
									id: meta.keys[0],
									prefix: codeOrdered[0]?.prefix,
									number_of_codes: codeOrdered[0]?.number_of_codes,
									url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
									client_name: codeOrdered[0]?.client?.client_id,
									printer_details: codeOrdered[0]?.printer,
									codelength: codeOrdered[0]?.code_length,
									comment: payload?.comments ? payload?.comments : data?.comments,
								},
								body_data: {
									prefix: codeOrdered[0]?.prefix,
									number_of_codes: codeOrdered[0]?.number_of_codes,
									url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
									client_name: codeOrdered[0]?.client?.client_id,
									printer_details: codeOrdered[0]?.printer,
									codelength: codeOrdered[0]?.code_length,
									id: meta.keys[0],
									comment: payload?.comments ? payload?.comments : data?.comments,
								},
								item: meta.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.decNewCodeReq}`, mailOptions)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.decNewCodeReq}`, mailOptions)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
						}
						break;
					case constant.status.sendtoprinter:
						if (codeOrdered[0].shakepe_codes == 0) {
							const files =
								codeOrdered[0]?.printer?.file_upload?.length > 0
									? await Promise.all(
										codeOrdered[0]?.printer?.file_upload?.map(async (files: any) => {
											return {
												content: await assetServices(
													files.directus_files_id.id,
													services,
													schema,
													context.accountability
												),
												filename: files.directus_files_id.filename_download,
											};
										})
									)
									: [];
							const newCodes = await codeCreation(
								codeOrdered[0].prefix,
								codeOrdered[0].number_of_codes,
								database,
								meta.keys[0],
								codeOrdered[0].code_length,
								codeOrdered[0].type
							);
							const password = generateRandomNumber(5);
							const excelBuffer = await excelGeneration(newCodes, password, InvalidPayloadException);

							createChunksRecursive(newCodes.flat(1), database, schema, services);
							const mailOptions = {
								to: [codeOrdered[0].printers.email],
								users: [codeOrdered[0].printers.id],
								bcc: env.BCC_PRINTER_VENDOR_EMAIL,
								body_data: {
									...payload.payload,
									url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
									id: payload.key,
									password: password,
								},
								attachments: [
									{
										content: excelBuffer,
										filename: `${meta.keys[0]}_${codeOrdered[0].prefix}_${formatDate(new Date())}.xlsx`,
									},
									...files,
								],
							};

							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.printReqWithPin}`, mailOptions)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
						} else {
							throw {
								error: constant.error.code_generated,
							};
						}
						break;
					default:
						return payload;
				}
			} else if (payload.comments == constant.resend) {
				const codeOrdered = await getDataFromCollection(
					services,
					{
						id: {
							_eq: meta.keys[0],
						},
					},
					constant.fields.shakepe_codes_request_resend,
					1,
					schema,
					'shakepe_codes_creations'
				);
				const password = generateRandomNumber(5);

				const files =
					codeOrdered[0]?.printer?.file_upload?.length > 0
						? await Promise.all(
							codeOrdered[0]?.printer?.file_upload?.map(async (files: any) => {
								return {
									content: await assetServices(files.directus_files_id.id, services, schema, context.accountability),
									filename: files.directus_files_id.filename_download,
								};
							})
						)
						: [];
				const codes = await getDataFromCollection(
					services,
					{
						creation_id: {
							_eq: meta.keys[0],
						},
					},
					constant.fields.shakepe_codes_inventory,
					-1,
					schema,
					'shakepe_codes_inventory'
				);

				const excelBuffer = await excelGeneration(codes, password, InvalidPayloadException);

				const mailOptions = {
					to: [codeOrdered[0].printers.email],
					users: [codeOrdered[0].printers.id],
					bcc: env.BCC_PRINTER_VENDOR_EMAIL,
					body_data: {
						...payload.payload,
						url_link: env.CURRENT_URL + '/admin/content/shakepe_codes_creations/' + payload.key,
						id: payload.key,
						password: password,
					},
					attachments: [
						{
							content: excelBuffer,
							filename: `${meta.keys[0]}_${codeOrdered[0].prefix}_${formatDate(new Date())}.xlsx`,
						},
						...files,
					],
				};

				axios
					.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.printReqWithPin}`, mailOptions)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
				payload.comments = '';
				return payload;
			}
		} catch (error: any) {
			throw new InvalidPayloadException(error?.error ? error.error : error);
		}
	});

	filter('client.items.create', async (payload: any, meta: any, context: any) => {
		const create = payload?.product_type_mapping?.create?.find((data: any) => {
			return data.product_type == 8;
		});

		const update = payload?.product_type_mapping.update?.find((data: any) => {
			return data.product_type == 8;
		});

		if (create?.product_type == 8 && create?.form_factor == 'Physical') {
			if (update && !update?.printer_details?.create?.length) {
				throw new InvalidPayloadException(constant.error.printer);
			} else if (update) {
				payload.product_type_mapping.create = payload.product_type_mapping.create.map((data: any) => {
					if (data.product_type == 8) {
						return update;
					} else {
						return data;
					}
				});
				return payload;
			} else if (create && !create?.printer_details?.create?.length) {
				throw new InvalidPayloadException(constant.error.printer);
			}
		}
	});

	filter('client.items.update', async (payload: any, meta: any, context: any) => {
		const { event, keys, collection } = meta;
		const readData = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
			},
			constant.collections.client, // array
			1, //
			schema,
			'client'
		);

		const shakepe_codes = readData[0].product_type_mapping?.find((client: any) => client.product_type == 8);

		if (shakepe_codes && payload?.product_type_mapping?.update?.length > 0) {
			const finding = payload?.product_type_mapping?.update?.find((e: any) => e.id == shakepe_codes.id);

			const inactive = readData[0].product_type_mapping
				.filter((e: any) => e.id != shakepe_codes.id)
				.every((data: any) => data.status == 'InActive');
			if (finding && finding?.validity_of_codes > shakepe_codes?.validity_of_codes && inactive) {
				payload.product_type_mapping.update = payload?.product_type_mapping.update.map((a: any) => {
					if (a.id == shakepe_codes.id) {
						return {
							...a,
							status: 'InActive',
							approval_status: 'Pending',
						};
					} else {
						return a;
					}
				});
				payload.status = 'InActive';
				return payload;
			} else if (finding && finding?.validity_of_codes > shakepe_codes?.validity_of_codes) {
				payload.product_type_mapping.update = payload?.product_type_mapping.update.map((a: any) => {
					if (a.id == shakepe_codes.id) {
						return {
							...a,
							status: 'InActive',
							approval_status: 'Pending',
						};
					} else {
						return a;
					}
				});
				return payload;
			} else {
				return payload;
			}
		} else {
			return payload;
		}
	});

	filter('client.items.update', async (payload: any, meta: any, context: any) => {
		const { event, keys, collection } = meta;
		const readData = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
			},
			constant.collections.client,
			1,
			schema,
			'client'
		);
		const shakepe_codes = readData[0]?.product_type_mapping?.find((codes: any) => codes.product_type == 8);
		if (
			shakepe_codes &&
			payload?.product_type_mapping?.update.filter((code: any) => code.id == shakepe_codes.id) &&
			shakepe_codes?.printer_details?.length == 0
		) {
			const physical = payload?.product_type_mapping?.update.filter((code: any) => code.id == shakepe_codes.id);
			const combined = physical?.reduce((acc: any, item: any) => {
				const itemId = item.id;
				if (!acc[itemId]) {
					acc[itemId] = { ...item };
				} else {
					for (let key in item) {
						if (Array.isArray(item[key]) && Array.isArray(acc[itemId][key])) {
							acc[itemId][key] = acc[itemId][key].concat(item[key]);
						} else if (typeof item[key] === 'object' && typeof acc[itemId][key] === 'object') {
							acc[itemId][key] = { ...acc[itemId][key], ...item[key] };
						} else {
							acc[itemId][key] = item[key];
						}
					}
				}
				return acc;
			}, {});
			const combinedObject: any = Object.values(combined)[0];
			if (combinedObject?.form_factor == 'Physical' && !combinedObject?.printer_details?.create?.length) {
				throw new InvalidPayloadException(constant.error.printer);
			} else {
				payload.product_type_mapping.update = [
					...payload?.product_type_mapping?.update.filter((code: any) => code.id != shakepe_codes.id),
					combinedObject,
				];
				payload.product_type_mapping.update = payload.product_type_mapping.update.filter(
					(code: any) => code != undefined
				);
				return payload;
			}
		}
		const create_codes = payload?.product_type_mapping?.create.find((codes: any) => codes.product_type == 8);
		const update_codes = payload?.product_type_mapping?.update.find((codes: any) => codes.product_type == 8);

		if (create_codes && create_codes?.form_factor == 'Physical' && !create_codes?.printer_details?.create?.length) {
			if (update_codes?.printer_details?.create?.length > 0) {
				payload.product_type_mapping.create = [
					...payload.product_type_mapping.create.filter((codes: any) => codes.product_type != 8),
					update_codes,
				];
				payload.product_type_mapping.update = [...payload.product_type_mapping.update.filter((codes: any) => codes.id)];
				return payload;
			} else {
				throw new InvalidPayloadException(constant.error.printer);
			}
		}
	});

	filter('performing_invoice.items.update', async (payload: any, meta: any, context: any) => {
		const { event, keys, collection } = meta;
		const readData = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
			},
			constant.collections.performing_invoices,
			1,
			schema,
			'performing_invoice'
		);
		const performingInvoiceData = readData[0];

		if (performingInvoiceData && payload?.send_to_client) {
			const piDownloadData = performingInvoiceData.pi_download;
			const toClientName = performingInvoiceData.client.client_name;
			const sendToClient = payload.send_to_client;
			if (piDownloadData && piDownloadData.length > 0) {
				const largestId = Math.max(...piDownloadData);
				const filesData = await getDataFromCollection(
					services,
					{
						id: {
							_eq: largestId,
						},
					},
					constant.collections.directus_inovoice_files,
					1,
					schema,
					'performing_invoice_files'
				);
				if (filesData && filesData.length > 0) {
					const performingInvoiceFilesData = filesData[0];
					const directusFilesId = performingInvoiceFilesData.directus_files_id;
					const filesDataName = await getDataFromCollection(
						services,
						{
							id: {
								_eq: directusFilesId,
							},
						},
						constant.collections.directus_files,
						1,
						schema,
						'directus_files'
					);

					if (filesDataName && filesDataName.length > 0) {
						const fileNameData = filesDataName[0];
						const fileName = fileNameData.filename_download;

						const mailplayload = {
							to: [sendToClient],
							body_data: {
								client_name: toClientName,
							},
							attachments: [
								{
									id: directusFilesId,
									filename: `${fileName}`,
								},
							],
						};
						axios
							.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.sendPiToclient}`, mailplayload)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
					}
				}
			}
		}
	});
	filter('client_product_mapping.items.create', async (payload: any, meta: any, context: any) => {
		if (payload?.payment_terms === 'Credit' && payload?.credit_limt > 0) {
			payload.credit_limit_status = constant.status.pending;
			payload.action = 'N';
		} else if (payload?.payment_terms === 'Credit' && payload?.credit_limt < 0) {
			throw new InvalidPayloadException(constant.error.creditLimitZero);
		}
	});

	filter('client_product_mapping.items.update', async (payload: any, meta: any, context: any) => {
		const { event, keys, collection } = meta;
		const paymentData = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
			},
			constant.collections.client_product_mapping,
			1,
			schema,
			'client_product_mapping'
		);
		const data = paymentData[0];
		const creditLimit = payload.credit_limt ? payload.credit_limt : data.credit_limt;
		if (payload?.credit_limt) {
			if (payload.credit_limt === data.credit_limt) {
				payload.credit_limit_status = constant.status.approved;
				return payload;
			}
			if (payload.credit_limt < data.credit_limt) {
				throw new InvalidPayloadException(constant.error.creditWallet);
			} else {
				payload.previous_credit_limit = data.credit_limt;
			}
			if (creditLimit && payload.credit_limit_status != 'approved') {
				payload.credit_limit_status = constant.status.pending;
				return payload;
			}
		}
	});

	filter('client.items.update', async (payload: any, meta: any, context: any) => {
		const { event, keys, collection } = meta;
		const paymentData = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys[0],
				},
			},
			constant.collections.client,
			1,
			schema,
			'client'
		);

		const data = paymentData[0];
		const creditLimit = payload.credit_limit ? payload.credit_limit : data.credit_limit;
		if (payload.requested_credit_limit === data.previous_credit_limit) {
			payload.credit_limit_status = constant.status.approved;
			return payload;
		}
		if (payload.requested_credit_limit) {
			if (payload.requested_credit_limit < data.credit_limit) {
				throw new InvalidPayloadException(constant.error.creditWallet);
			}
			if (data.credit_limit_status !== 'approved') {
				payload.credit_limit_status = constant.status.pending;
				payload.previous_credit_limit = data.credit_limit;
			}
			payload.credit_limit_status = constant.status.pending;
			return payload;
		}
		if (payload?.credit_limit_status == 'approved') {
			payload.previous_credit_limit = creditLimit;
		}
		if (payload.requested_credit_limit < data.credit_limit) {
			throw new InvalidPayloadException(constant.error.creditWallet);
		}
	});

	filter('poc_fund_transfer.items.create', async (payload: any, meta: any, context: any) => {
		const senderFilter = {
			id: {
				_eq: payload?.sender_poc?.id ? payload?.sender_poc.id : payload?.sender_poc,
			},
		};
		const receiverFilter = {
			id: {
				_eq: payload?.receiver_poc,
			},
		};
		const sender = await getDataFromCollection(
			services,
			senderFilter,
			constant.collections.client_point_of_contact,
			1,
			schema,
			'client_point_of_contact'
		);
		if (payload?.sender_poc === payload?.receiver_poc) {
			throw new InvalidPayloadException(constant.error.samePoc);
		} else if (payload?.amount) {
			if (payload.amount > sender[0].wallet) {
				throw new InvalidPayloadException(constant.error.insufficient_amount);
			} else {
				payload.status = constant.status.pending;
			}
		}
	});
	action('poc_fund_transfer.items.create', async (data: any) => {
		const filter = {
			id: {
				_eq: env.MANAGAMENT_ROLE,
			},
		};
		const clientFilter = {
			id: {
				_eq: data.payload.client,
			},
		};
		const clientData = await getDataFromCollection(
			services,
			clientFilter,
			constant.collections.client_product_mapping,
			1,
			schema,

			'client_product_mapping'
		);
		const senderFilter = {
			id: {
				_eq: data?.payload?.sender_poc,
			},
		};
		const receiverFilter = {
			id: {
				_eq: data?.payload?.receiver_poc,
			},
		};
		const sender = await getDataFromCollection(
			services,
			senderFilter,
			constant.collections.client_point_of_contact,
			1,
			schema,
			'client_point_of_contact'
		);
		const receiver = await getDataFromCollection(
			services,
			receiverFilter,
			constant.collections.client_point_of_contact,
			1,
			schema,
			'client_point_of_contact'
		);
		const idmanagement = await getDataFromCollection(
			services,
			filter,
			['users.email', 'users.id'],
			1,
			schema,
			'directus_roles'
		);
		const management = idmanagement[0].users.map((user: any) => user.email);
		const managementIds = idmanagement[0].users.map((user: any) => user.id);
		const availableAmount = sender[0].wallet - data.payload.amount;
		if (data.payload.status === 'pending') {
			const baseData = {
				to: management,
				users: managementIds,
				body_data: {
					data: data,
					client: clientData[0],
					sender: sender[0],
					receiver: receiver[0],
					available: availableAmount,
				},
				subject_data: {
					data: data,
					client: clientData[0],
					sender: sender[0],
					receiver: receiver[0],
					available: availableAmount,
				},

				item: data?.key,
			};
			axios
				.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.pocFundTrans}`, baseData)
				.then((response) => {
					return response;
				})
				.catch((error) => {
					return error;
				});
			axios
				.post(`${env.CURRENT_URL}email/notifications/${notificationId.pocFundTrans}`, baseData)
				.then((response) => {
					return response;
				})
				.catch((error) => {
					return error;
				});
		}
	});
	action('sd_brand_details.items.create', async ({ payload, key, collection }, context: any) => {
		updation(key, payload.enterprise_type, services, schema, context);
	});

	action('sd_brand_details.items.update', async (payload: any, context: any) => {
		payload.keys.map((key: any) => {
			updation(key, payload.payload.enterprise_type, services, schema, context);
		});
	});

	const updation = async (key: any, find: any, services: any, schema: any, context: any) => {
		if (find == 'default') {
			// Get all brand IDs
			const brandids = await getDataFromCollection(services, {}, ['id'], -1, schema, 'sd_brand_details');
			// Get all client IDs
			const clientids = await getDataFromCollection(services, {}, ['id'], -1, schema, 'client');
			await Promise.all(
				brandids.map(async (brandid: any) => {
					const patch = {
						enterprise_clients: {
							create: clientids.map((client: any) => ({
								sd_brand_details_id: brandid.id,
								client_id: { id: client.id },
							})),
							update: [],
							delete: [],
						},
					};
					await updateOneNoEmit(patch, 'sd_brand_details', services, brandid.id, schema, {
						admin: true,
					});
				})
			);
		} else if (find == 'not_default') {
			// Fix: filter by sd_brand_details_id, not client_id
			
			const joinRecords = await getDataFromCollection(
				services,
				{
					sd_brand_details_id: { _eq: key },
				},
				['id', 'client_approval_status'],
				-1,
				schema,
				'sd_brand_details_client'
			);

			const nonApprovedRecords = joinRecords.filter(
				(rec: any) => rec.client_approval_status !== 'approved'
			);

			if (nonApprovedRecords.length > 0) {
				deleteMany(
					nonApprovedRecords.map((rec: any) => rec.id),
					'sd_brand_details_client',
					services,
					schema,
					{
						admin: true,
						user: context?.accountability?.user,
					}
				);
			}
		} else if (!find) {
			return;
		}
	};

	const rabbitMq = async (
		orderDetails: any,
		referenceNumber: any,
		gettingValues: any,
		codesInventory: any,
		schema: any,
		services: any,
		InvalidPayloadException: any,
		form_factor?: any
	) => {
		const rabbitMq = await amqp.connect({
			hostname: env.RABBIT_HOST_NAME,
			port: env.RABBIT_PORT,
			username: env.RABBIT_USERNAME,
			password: env.RABBIT_PASSWORD,
		});
		if (
			!orderDetails.client.id &&
			!orderDetails.client.client_name &&
			!orderDetails.shakepe_codes_orders &&
			!orderDetails.id &&
			!orderDetails.po_number
		) {
			throw InvalidPayloadException(constant.error.something);
		}
		const queueData = {
			company_name: orderDetails.client.client_name,
			company_id: orderDetails.poc,
			reference_number: referenceNumber,
			total_codes_value: gettingValues.total_codes_value,
			order_id: orderDetails.id,
			po_number: orderDetails.po_number,
			codes_info:
				form_factor == constant.shakepe_orders.virtual
					? orderDetails.shakepe_codes_orders?.map((codeDetails: any, index: any) => {
						return {
							id: codeDetails.id,
							valid_till: codeDetails.validity,
							activation_date: codeDetails.activation,
							denomination: parseInt(codeDetails.value_of_code),
							no_of_codes: codeDetails.total_no_of_codes,
							codes_data: codesInventory[index],
						};
					})
					: form_factor == 'data'
						? orderDetails.shakepe_codes_orders?.map((codeDetails: any) => {
							return {
								id: codeDetails.id,
								valid_till: codeDetails.validity,
								activation_date: codeDetails.activation,
								denomination: parseInt(codeDetails.value_of_code),
								no_of_codes: codeDetails.total_no_of_codes,
								codes_data: orderDetails.file_upload_data
									.map((codefile: any) => {
										const findInventory = codesInventory.find((inventory: any) => {
											return (
												codeDetails.value_of_code == codefile.denomination &&
												inventory.serial_number == codefile.serial_number
											);
										});
										if (findInventory) {
											return {
												id: findInventory.id,
												serial_number: findInventory.serial_number,
												code: findInventory.code,
											};
										} else {
											return null;
										}
									})
									.filter((code: any) => code != null),
							};
						})
						: orderDetails.shakepe_codes_orders?.map((codeDetails: any) => {
							return {
								id: codeDetails.id,
								valid_till: codeDetails.validity,
								activation_date: codeDetails.activation,
								denomination: parseInt(codeDetails.value_of_code),
								no_of_codes: codeDetails.total_no_of_codes,
								codes_data: codesInventory.splice(0, codeDetails.total_no_of_codes).map((codes: any) => {
									return {
										id: codes.id,
										serial_number: codes.serial_number,
										code: codes.code,
									};
								}),
							};
						}),
		};

		logGenerator(
			queueData,
			constant.logger.log,
			constant.collection_name.santa_log,
			schema,
			{
				admin: true,
			},
			services
		);
		const codeChannel = await rabbitMq.createChannel();
		await codeChannel.assertQueue(env.RABBIT_QUEUE_CODES, { durable: false });
		const assertQueue = codeChannel.sendToQueue(env.RABBIT_QUEUE_CODES, Buffer.from(JSON.stringify(queueData)));
		await codeChannel.close();
		logGenerator(
			queueData,
			constant.logger.success,
			constant.collection_name.santa_log,
			schema,
			{
				admin: true,
			},
			services
		);
		if (assertQueue) {
			return queueData;
		} else {
			logGenerator(
				{
					hostname: env.RABBIT_HOST_NAME,
					port: env.RABBIT_PORT,
					username: env.RABBIT_USERNAME,
					password: env.RABBIT_PASSWORD,
					status: 'failed',
					assertQueue: assertQueue,
				},
				constant.logger.error,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
			throw new InvalidPayloadException(constant.error.enterpricesqueuedown);
		}
	};

	function maskString(str: any, frontOffset: any, backOffset: any, maskCharacter: string) {
		if (str.length < parseInt(frontOffset) + parseInt(backOffset)) {
			return str;
		} else {
			const maskedMiddle = maskCharacter.repeat(str.length - frontOffset - backOffset);
			const visibleFrontPart = str.substring(0, frontOffset);
			const visibleBackPart = str.substring(str.length - backOffset);

			return visibleFrontPart + maskedMiddle + visibleBackPart;
		}
	}
	const codeCreation = async (
		prefix: any,
		totalNumber: number,
		database: any,
		key: any,
		code_length: any,
		type: any,
		denomination?: any,
		validity?: any,
		activation_date?: any
	) => {
		const codeLength: number = parseInt(code_length ? code_length : 14);

		const newCodes = Array.from({ length: totalNumber }, async (_, index) => {
			const characters =
				prefix +
				Array.from({ length: codeLength - (prefix?.length ? prefix.length : 0) }, () =>
					env.CODE_GENERATION.charAt(Math.floor(Math.random() * env.CODE_GENERATION.length))
				).join('');
			const serial_number = await database.raw(`SELECT nextval('${env.SEQUENCE_SHAKEPE_CODE}')`);
			if (type != constant.shakepe_orders.virtual) {
				return {
					serial_number: serial_number?.rows?.length > 0 ? serial_number?.rows[0]?.nextval : 0,
					code: characters,
					prefix: prefix,
					creation_id: key,
					status: constant.status.sendtoprinter,
					type: type,
					code_status: constant.InActive,
					redemption_status: constant.status.na,
					validity_status: constant.status.na,
					redemption_status_of_points: constant.status.na,
					date_created: new Date(),
				};
			} else {
				return {
					serial_number: serial_number?.rows?.length > 0 ? serial_number?.rows[0]?.nextval : 0,
					code: characters,
					prefix: prefix,
					code_id: key,
					status: constant.status.assigningClient,
					denomination: denomination,
					validity: new Date(validity),
					activation_date: new Date(activation_date),
					type: type,
					code_status: constant.InActive,
					redemption_status: constant.status.na,
					validity_status: constant.status.na,
					redemption_status_of_points: constant.status.na,
					date_created: new Date(),
				};
			}
		});

		// Ensure to await all promises
		const resolvedCodes = await Promise.all(newCodes);
		return resolvedCodes;
	};

	const excelGeneration = async (data: any, password: any, InvalidPayloadException: any) => {
		try {
			const temp = await XlsxPopulate.fromBlankAsync().then((workbook: any) => {
				const worksheet = workbook.sheet('Sheet1');
				worksheet.cell('A1').value('Serial Number');
				worksheet.cell('B1').value('Code');
				worksheet.cell('C1').value('Prefix');

				data.forEach((data: any, index: any) => {
					worksheet.cell(`A${index + 2}`).value(data.serial_number);
					worksheet.cell(`B${index + 2}`).value(data.code);
					worksheet.cell(`C${index + 2}`).value(data.prefix);
				});
				return workbook.outputAsync({ password: password.toString() });
			});
			return temp;
		} catch (error) {
			throw {
				error: new InvalidPayloadException(constant.error.excel_error),
			};
		}
	};
	function generateRandomNumber(length: number) {
		// Calculate the minimum and maximum values based on the length
		const min = Math.pow(10, length - 1);
		const max = Math.pow(10, length) - 1;
		// Generate a random number within the specified range
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function formatDate(dateString: any) {
		const date = new Date(dateString);
		const day = String(date.getDate()).padStart(2, '0');
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const year = String(date.getFullYear()).slice(-2);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const amOrPm = date.getHours() >= 12 ? 'PM' : 'AM';

		return `${day}-${month}-${year}-${hours}-${minutes}-${amOrPm}`;
	}

	async function createChunksRecursive(codes: any, database: any, schema: any, services: any) {
		try {
			const chunkSize = 1000;
			const codeChunks = Array.from({ length: Math.ceil(codes.length / chunkSize) }, (_, index) =>
				codes.splice(0, chunkSize)
			);
			return await Promise.all(
				codeChunks.map(async (data: any) => {
					return await database('shakepe_codes_inventory').insert(data);
				})
			);
		} catch (error) {
			logGenerator(
				{
					error: error,
					collection: 'shakepe_codes_inventory',
				},
				constant.logger.success,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
		}
	}

	function addingValidDate(date: any, month: any) {
		const newDate = new Date(date);
		const currentMonth = newDate.getMonth();
		newDate.setMonth(currentMonth + month);
		// Handling cases where the new month might have fewer days
		const currentDay = newDate.getDate();
		const maxDayInNewMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
		newDate.setDate(Math.min(currentDay, maxDayInNewMonth));

		return newDate;
	}
});

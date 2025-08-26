import { createOne, createOneNoEmit, updateOneNoEmit } from './db/setter';
/* eslint-disable no-case-declarations */
import { defineHook } from '@directus/extensions-sdk';
import constant from './constant.json';
import { mail, updateOne, updateMany, notificationsServices } from './db/setter';
import { env } from 'process';
import { getDataFromCollection } from './db/getter';
import axios from 'axios';
import { addJobToClientQueue } from './db/queue';

const emailEndpointIds = {
	newClientOnboard: 13,
	newProduct: 14,
	commercial: 15,
	creditDays: 16,
	paymentTerms: 17,
	discount: 18,
	newBrandRequest: 19,
	changeInComm: 20,
	reqApprovalBrand: 21,
	reqApprovalProductType: 22,
	newClientReq: 23,
	newProdReq: 24,
	decNewClient: 25,
	decNewProd: 26,
	reqApprOrderInDiscount: 28,
	appPiReq: 29,
	decPiReq: 30,
	codeReq: 31,
	appNewCodeReq: 32,
	decNewCodeReq: 33,
	printReqWithPin: 34,
	sendPiToclient: 35,
	increasedBrandDisc: 45,
};

const notificationId = {
	newCLient: 2,
	newProduct: 3,
	clientAppr: 4,
	clientDec: 5,
	prodAppr: 6,
	prodDec: 7,
	commReq: 8,
	commAppr: 9,
	commDec: 10,
	creditdaysReq: 11,
	creditdaysAppr: 12,
	creditDaysDec: 13,
	paymentTermsReq: 14,
	paymentTermsAppr: 15,
	paymentTermsDec: 16,
	discountReq: 17,
	discountAppr: 18,
	discountDec: 19,
	brandAppr: 20,
	brandDec: 21,
	brandReq: 22,
	piDiscount: 23,
	piAppr: 24,
	piDec: 25,
	inBrandDiscount: 26,
};
export default defineHook(async ({ filter, action }, { services, exceptions, database, getSchema }) => {
	const { ItemsService, MailService } = services;
	const { InvalidPayloadException } = exceptions;
	const schema = await getSchema();
	async function logError(error: any, collection: any) {
		try {
			const error_log: any = {};
			const errorLogService = new ItemsService('error_log_zeus', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			error_log.collection_name = collection;
			error_log.error = String(error);

			await errorLogService.createOne({ error: JSON.stringify(error_log) });
		} catch (error) {
			return error;
		}
	}

	filter('shakepe_orders.items.create', (data: any) => {
		if (data.discount == '') {
			return {
				...data,
				discount: 0,
			};
		}
	});
	// Total Value  ,  Orginal Value Creation Area
	filter('shakepe_orders.items.create', async (data: any, meta: any, context: any) => {
		if (data?.type != 'enterprise' && data?.type != 'DIY') {
			const service_amount = parseFloat(data?.service_amount && data?.service_fee ? data.service_amount : 0);
			const discount = parseFloat(data.discount ? data.discount : 0);
			const orderLevelDiscount = parseFloat(data?.order_level_discount ? data.order_level_discount : 0);
			const gpr = data?.filtering_with_product_type === constant.GPR;
			const giftCard = data?.filtering_with_product_type == constant.GIFT_CARD;
			const vouchers = data?.filtering_with_product_type == constant.VOUCHERS;
			const links = data?.filtering_with_product_type == constant.LINKS;
			const points = data?.filtering_with_product_type == constant.SHAKEPEPOINT;
			const codes = data?.filtering_with_product_type == constant.SHAKEPECODE;
			const commerical = data.commerical;

			const client = await getDataFromCollection(
				services,
				{
					id: {
						_eq: data.client,
					},
				},
				constant.FIELDSDATA.CLIENT,
				schema,
				'client'
			);

			switch (true) {
				case gpr:
					const load_amount = parseFloat(data?.load_amount ? data.load_amount : 0);
					const totalValue = load_amount - (load_amount * discount) / 100 + service_amount;
					if (orderLevelDiscount != discount && data?.add_or_reduce_discount) {
						const orderLevelValue = load_amount - (load_amount * orderLevelDiscount) / 100 + service_amount;
						const final = {
							...data,
							total_value: commerical == constant.UPFRONT && data.add_or_reduce_discount ? orderLevelValue : null,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback: commerical != constant.UPFRONT ? (load_amount * orderLevelDiscount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							previous_cashback: commerical != constant.UPFRONT ? (load_amount * discount) / 100 : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};

						const job = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: final,
						});
						if (job?.error) {
							throw new InvalidPayloadException(job?.error);
						}

						return {
							...final,
							...job,
						};
					} else {
						const final = {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback: commerical != constant.UPFRONT ? (load_amount * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};

						const job = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: final,
						});
						if (job?.error) {
							throw new InvalidPayloadException(job?.error);
						}

						return {
							...final,
							...job,
						};
					}
				case giftCard:
					let totalReturnGift = 0;
					let orderLevelValueGift = 0;
					let subTotal = 0;
					data.brand_sku_mapping?.create.forEach((brand: any) => {
						const { add_or_reduce, denomination, quantity, actual_discoubt, order_level_discount } =
							brand.gift_card_order_details_id;
						const totalValueGift = denomination - (denomination * actual_discoubt) / 100;
						const returnValue = totalValueGift * quantity;
						subTotal += denomination * quantity;
						totalReturnGift += returnValue;
						if (actual_discoubt < order_level_discount || (actual_discoubt > order_level_discount && add_or_reduce)) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discoubt) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						}
					});
					const totalAfterDiscount = totalReturnGift + service_amount;

					const gift_card_final = {
						...data,
						total_value:
							commerical == constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? orderLevelValueGift + service_amount
								: null,
						original_value: commerical == constant.UPFRONT ? totalAfterDiscount : null,
						cashback:
							commerical != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - orderLevelValueGift
								: commerical != constant.UPFRONT
								? subTotal - totalReturnGift
								: null,
						previous_cashback:
							commerical != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - totalReturnGift
								: null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotal + service_amount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotal : null,
					};

					const job_gift = await addJobToClientQueue(gift_card_final?.client, {
						collection: 'shakepe_orders',
						item: 'create',
						schema: schema,
						services: services,
						data: gift_card_final,
					});
					if (job_gift?.error) {
						throw new InvalidPayloadException(job_gift?.error);
					}

					return {
						...gift_card_final,
						...job_gift,
					};
				case vouchers:
					let totalReturnVoucher = 0;
					let orderLevelValueVoucher = 0;
					let subTotalVoucher = 0;

					data?.brand_sku_mapping_voucher?.create &&
						data?.brand_sku_mapping_voucher?.create.forEach((brand: any) => {
							const { add_or_reduce_discount, denomination, quantity, actual_discount, order_level_discount } = brand;

							const totalValuediscount = denomination - (denomination * actual_discount) / 100;
							const returnValue = totalValuediscount * quantity;
							subTotalVoucher += denomination * quantity;
							totalReturnVoucher += returnValue;

							if (
								actual_discount < order_level_discount ||
								(actual_discount > order_level_discount && add_or_reduce_discount)
							) {
								const totalValue = denomination - (denomination * order_level_discount) / 100;
								const returnValue = totalValue * quantity;
								orderLevelValueVoucher += returnValue;
							} else {
								const totalValue = denomination - (denomination * actual_discount) / 100;
								const returnValue = totalValue * quantity;
								orderLevelValueVoucher += returnValue;
							}
						});
					const totalVoucher = totalReturnVoucher + service_amount;
					const final_voucher = {
						...data,
						total_value:
							commerical == constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? orderLevelValueVoucher + service_amount
								: null,
						original_value: commerical == constant.UPFRONT ? totalVoucher : null,
						cashback:
							commerical != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - orderLevelValueVoucher
								: commerical != constant.UPFRONT
								? subTotalVoucher - totalReturnVoucher
								: null,

						previous_cashback:
							commerical != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - totalReturnVoucher
								: null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotalVoucher + service_amount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotalVoucher : null,
					};

					const job_vouchers = await addJobToClientQueue(final_voucher?.client, {
						collection: 'shakepe_orders',
						item: 'create',
						schema: schema,
						services: services,
						data: final_voucher,
					});
					if (job_vouchers?.error) {
						throw new InvalidPayloadException(job_vouchers?.error);
					}

					return {
						...final_voucher,
						...job_vouchers,
					};
				case links:
					if (data?.generic_links_details?.create) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						data?.generic_links_details?.create.map((e: any) => {
							const { denomination, quantity } = e;

							subTotal += denomination * quantity;
							itemDiscount += denomination * quantity * (discount / 100);
							itemOrderDiscount += data.add_or_reduce_discount
								? denomination * quantity * (data.order_level_discount / 100)
								: denomination * quantity * (discount / 100);
						});

						const generic_links_final = {
							...data,
							total_value:
								commerical == constant.UPFRONT && data.add_or_reduce_discount
									? subTotal - itemOrderDiscount + service_amount
									: null,
							original_value: commerical == constant.UPFRONT ? subTotal - itemDiscount + service_amount : null,
							cashback:
								commerical != constant.UPFRONT && data.add_or_reduce_discount
									? itemOrderDiscount
									: commerical != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commerical != constant.UPFRONT ? subTotal + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? subTotal : null,
						};

						const job_generic = await addJobToClientQueue(generic_links_final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: generic_links_final,
						});
						if (job_generic?.error) {
							throw new InvalidPayloadException(job_generic?.error);
						}

						return {
							...generic_links_final,
							...job_generic,
						};
					} else if (data?.catalog_links_orders?.create) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						data?.catalog_links_orders?.create.map((e) => {
							const { denomination, total_no_links } = e;
							subTotal += denomination * total_no_links;
							itemDiscount += denomination * total_no_links * (data.discount / 100);
							itemOrderDiscount +=
								data.order_level_discount && data?.add_or_reduce_discount
									? denomination * total_no_links * (data.order_level_discount / 100)
									: denomination * total_no_links * (data.discount / 100);
						});
						const catalog_links_final = {
							...data,
							total_value:
								commerical == constant.UPFRONT && data.add_or_reduce_discount
									? subTotal - itemOrderDiscount + service_amount
									: null,
							original_value: commerical == constant.UPFRONT ? subTotal - itemDiscount + service_amount : null,
							cashback:
								commerical != constant.UPFRONT && data.add_or_reduce_discount
									? itemOrderDiscount
									: commerical != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commerical != constant.UPFRONT ? subTotal + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? subTotal : null,
						};
						const job_catalog = await addJobToClientQueue(catalog_links_final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: catalog_links_final,
						});
						if (job_catalog?.error) {
							throw new InvalidPayloadException(job_catalog?.error);
						}

						return {
							...catalog_links_final,
							...job_catalog,
						};
					}
					break;
				case points:
					const load_amount_points = parseFloat(data?.load_amount ? data.load_amount : 0);
					const totalValuePoints = load_amount_points - (load_amount_points * discount) / 100;
					if ((orderLevelDiscount > discount && data?.add_or_reduce_discount) || orderLevelDiscount < discount) {
						const orderLevelValuePoints =
							load_amount_points - (load_amount_points * orderLevelDiscount) / 100 + service_amount;

						const final = {
							...data,
							total_value: commerical == constant.UPFRONT && data.add_or_reduce_discount ? orderLevelValuePoints : null,
							original_value: commerical == constant.UPFRONT ? totalValuePoints + service_amount : null,
							cashback:
								commerical != constant.UPFRONT && data?.add_or_reduce_discount
									? (load_amount_points * orderLevelDiscount) / 100
									: null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount_points + service_amount : null,
							previous_cashback:
								commerical != constant.UPFRONT && data?.add_or_reduce_discount
									? (load_amount_points * discount) / 100
									: null,
							total_order_value: commerical == constant.UPFRONT ? load_amount_points : null,
						};
						const job_points = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: final,
						});
						if (job_points?.error) {
							throw new InvalidPayloadException(job_points?.error);
						}

						return {
							...final,
							...job_points,
						};
					} else {
						const final = {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValuePoints + service_amount : null,
							cashback: commerical != constant.UPFRONT ? (load_amount_points * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount_points + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount_points : null,
						};
						const job_points = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'create',
							schema: schema,
							services: services,
							data: final,
						});
						if (job_points?.error) {
							throw new InvalidPayloadException(job_points?.error);
						}

						return {
							...final,
							...job_points,
						};
					}
				case codes:
					let subTotalCode = 0;
					let itemDiscountCode = 0;
					let itemOrderDiscountCode = 0;

					data.shakepe_codes_orders.create.map((e: any) => {
						const { value_of_code, total_no_of_codes } = e;
						subTotalCode += value_of_code * total_no_of_codes;
						itemDiscountCode += value_of_code * total_no_of_codes * (discount / 100);
						itemOrderDiscountCode +=
							orderLevelDiscount && data?.add_or_reduce_discount
								? value_of_code * total_no_of_codes * (orderLevelDiscount / 100)
								: value_of_code * total_no_of_codes * (discount / 100);
					});
					const codes_final = {
						...data,
						total_value:
							commerical == constant.UPFRONT && data.add_or_reduce_discount
								? subTotalCode - itemOrderDiscountCode + service_amount
								: null,
						original_value: commerical == constant.UPFRONT ? subTotalCode - itemDiscountCode + service_amount : null,
						cashback:
							commerical != constant.UPFRONT && data.add_or_reduce_discount
								? itemOrderDiscountCode
								: commerical != constant.UPFRONT
								? itemDiscountCode
								: null,
						previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscountCode : null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotalCode + service_amount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotalCode : null,
					};

					const job_codes = await addJobToClientQueue(codes_final?.client, {
						collection: 'shakepe_orders',
						item: 'create',
						schema: schema,
						services: services,
						data: codes_final,
					});
					if (job_codes?.error) {
						throw new InvalidPayloadException(job_codes?.error);
					}

					return {
						...codes_final,
						...job_codes,
					};
				default:
					break;
			}
		} else {
			const job = await addJobToClientQueue(data?.client, {
				collection: 'shakepe_orders',
				item: 'create',
				schema: schema,
				services: services,
				data: data,
			});
			if (job?.error) {
				throw new InvalidPayloadException(job?.error);
			} else {
				delete data?.csv_file;
				data.consumer = job?.consumer ? job?.consumer : null;
				delete job?.consumer;
				return {
					...data,
					...job,
				};
			}
		}
	});
	//  PO Creation for Vouchers
	filter('shakepe_orders.items.update', async (data: any, keys: any) => {
		try {
			const shakepe_orders = new ItemsService('shakepe_orders', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const order_details = await shakepe_orders.readByQuery({
				filter: {
					id: {
						_eq: keys.keys[0],
					},
				},
				fields: [
					'filtering_with_product_type',
					'status',
					'brand_sku_mapping_voucher.id',
					'brand_sku_mapping_voucher.quantity',
					'brand_sku_mapping_voucher.denomination',
					'brand_sku_mapping_voucher.vendor_detail.*',
				],
			});

			if (
				(data.status != constant.ORDERPROCESSED || data.status != constant.ORDEROPEN) &&
				data.brand_sku_mapping_voucher &&
				(order_details[0]?.status == constant.ORDERPROCESSED || order_details[0]?.status == constant.ORDEROPEN) &&
				order_details[0]?.filtering_with_product_type == constant.VOUCHERS &&
				order_details.length != 0
			) {
				const final = order_details.map((e: any) => {
					if (e.brand_sku_mapping_voucher.length != 0 && data?.brand_sku_mapping_voucher?.update?.length != 0) {
						return e.brand_sku_mapping_voucher.map((a: any) => {
							const old = a.vendor_detail.reduce(
								(sum: any, detail: any) => (sum + detail.quantity ? parseInt(detail.quantity) : 0),
								0
							);
							const findingNew = data.brand_sku_mapping_voucher.update.filter((g: any) => g.id == a.id);
							const newValue = findingNew.reduce(
								(sum: any, newItems: any) =>
									sum +
									newItems.vendor_detail.create.reduce(
										(sum: any, detail: any) => (sum + detail?.quantity ? parseInt(detail.quantity) : a.quantity),
										0
									),
								0
							);
							if (old + newValue <= a.quantity) {
								return data;
							} else {
								throw { error: constant.VENDORQTYEXCEDDED };
							}
						});
					}
				});

				return final.flat(1)[0];
			} else {
				return data;
			}
		} catch (error) {
			if (error?.error == constant.VENDORQTYEXCEDDED) {
				throw new InvalidPayloadException(constant.VENDORQTYEXCEDDED);
			} else {
				logError(error, 'shakepe_order');
			}
		}
	});
	//  Approve Pending Status
	filter('shakepe_orders.items.create', (data: any) => {
		try {
			if (data?.calculation?.includes(constant.PREVIOUS)) {
				data.credit_addional_discount = constant.APPROVEPENDIND;
				data.approval_status = constant.PENDING;
				data.status = constant.APPROVALPENDING;
				return data;
			}
		} catch (error) {
			logError(error, 'shakepe_order');
		}
	});
	//  GST Validation for Updation and Creation
	filter('client.items.create', async (data: any) => {
		try {
			if (data?.client_type == constant.CORPORATE) {
				const gstVaildation = data?.client_address_details?.create
					? data.client_address_details.create.every((e: any) => {
							return e.client_address_id.gstin;
					  })
					: true;
				if (!gstVaildation) {
					throw {
						error: constant.GSTINMANDATORY,
					};
				} else {
					return data;
				}
			}
		} catch (error: any) {
			if (error?.error == constant.GSTINMANDATORY) {
				throw new InvalidPayloadException(constant.GSTINMANDATORY);
			} else {
				logError(error, 'client');
			}
		}
	});

	filter('client.items.update', async (data: any, keys: any) => {
		try {
			const clientCollection = new ItemsService('client', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const clientDetails = await clientCollection.readByQuery({
				filter: {
					id: {
						_eq: keys.keys[0],
					},
				},
				fields: ['poc.client_address.client_address_id.gstin', 'id', 'client_limit'],
			});
			if (data?.credit_limit_status == 'approved') {
				const job = await addJobToClientQueue(keys.keys[0], {
					collection: 'client',
					item: 'update',
					schema: schema,
					services: services,
					data: data,
					id: keys.keys[0],
				});
				return job;
			}
			if (data?.client_type == constant.CORPORATE) {
				let gstVaildation: any = clientDetails[0]?.poc
					?.map((poc: any) => {
						return poc?.client_address?.every((client: any) => client.client_address_id.gstin) ? true : false;
					})
					.every((gst: any) => gst == true);

				gstVaildation = gstVaildation = data?.poc?.update
					? data.poc.update
							.map((poc: any) => {
								return poc?.client_address?.update.every((client: any) => client.client_address_id.gstin)
									? true
									: false;
							})
							.every((gst: any) => gst == true)
					: data?.poc?.update?.length == 0
					? true
					: false;

				if (gstVaildation) {
					gstVaildation = data?.poc?.create
						.map((poc: any) => {
							return poc?.client_address?.create.every((client: any) => client.client_address_id.gstin) ? true : false;
						})
						.every((gst: any) => gst == true);
				}

				if (!gstVaildation) {
					throw {
						error: constant.GSTINMANDATORY,
					};
				} else {
					return data;
				}
			}
		} catch (error: any) {
			if (error?.error == constant.GSTINMANDATORY) {
				throw new InvalidPayloadException(constant.GSTINMANDATORY);
			} else {
				logError(error, 'client');
			}
		}
	});
	// DUPLICATE Product Type Identification Area
	filter('client.items.create', async (data: any) => {
		try {
			if (data.product_type_mapping?.create) {
				const createItems = data?.product_type_mapping?.create ? data.product_type_mapping.create : [];
				const setLength = [...new Set(createItems.map((product: any) => product.product_type))];
				if (setLength.length != createItems.length) {
					throw { error: constant.DUPLICATEPRODUCT };
				} else {
					return data;
				}
			}
		} catch (error: any) {
			if (error?.error == constant.DUPLICATEPRODUCT) {
				throw new InvalidPayloadException(constant.DUPLICATEPRODUCT);
			} else {
				logError(error, 'client');
			}
		}
	});
	filter('client.items.update', async (data: any, keys: any) => {
		try {
			const clientCollection = new ItemsService('client', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const clientDetails = await clientCollection.readByQuery({
				filter: {
					id: {
						_eq: keys.keys[0],
					},
				},
				fields: ['product_type_mapping.product_type'],
			});
			if (
				clientDetails.length > 0 &&
				clientDetails[0]?.product_type_mapping &&
				data?.product_type_mapping?.create.length > 0
			) {
				clientDetails[0].product_type_mapping.push(...data.product_type_mapping.create);
				const finalArray = clientDetails[0].product_type_mapping;
				const setLength = [...new Set(finalArray.map((product: any) => product.product_type))];
				if (setLength.length != finalArray.length) {
					throw { error: constant.DUPLICATEPRODUCT };
				} else {
					return data;
				}
			}
		} catch (error: any) {
			if (error?.error == constant.DUPLICATEPRODUCT) {
				throw new InvalidPayloadException(constant.DUPLICATEPRODUCT);
			} else {
				logError(error, 'client');
			}
		}
	});
	// Primary Contact Only One Area
	filter('client.items.create', async (data: any) => {
		try {
			if (data?.client_address_details?.create.length > 0) {
				const createItems = data.client_address_details.create;
				let lastdata = data;
				createItems.forEach((item: any) => {
					const pointOfContact = item?.client_address_id?.point_of_contact?.create;
					let primaryCount = 0;
					if (pointOfContact) {
						pointOfContact.forEach((contact: any) => {
							if (contact.primary) {
								primaryCount++;
								if (primaryCount > 1) {
									throw {
										error: constant.PRIMARYCONTACT,
									};
								}
							}
						});
					} else {
						lastdata = data;
					}
				});
				return data;
			}
		} catch (error: any) {
			if (error?.error == constant.PRIMARYCONTACT) {
				throw new InvalidPayloadException(constant.PRIMARYCONTACT);
			} else {
				logError(error, 'client');
			}
		}
	});
	filter('client.items.create', async (data: any) => {
		const final = data;
		final.product_type_mapping.update = [];
		final.previous_discount = final.discount;
		return final;
	});

	filter('client_product_mapping.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};
		const manage_filter = {
			id: {
				_eq: context?.accountability?.user,
			},
		};
		const filterAccounts = {
			id: {
				_eq: env.ACCOUNT_ROLE,
			},
		};
		const idaccounts = await getDataFromCollection(services, filterAccounts, ['users.email'], schema, 'directus_roles');
		const accounts = idaccounts[0]?.users?.map((user: any) => {
			return user.email;
		});
		const managementAccepted = await getDataFromCollection(
			services,
			manage_filter,
			['first_name'],
			schema,
			'directus_users'
		);
		const fields = constant.FIELDSDATA.CLIENT_UPDATE;
		const client = await getDataFromCollection(services, filter, fields, schema, keys.collection);
		const mailService = new MailService({ schema, knex: database });
		const roles_filter = {
			id: {
				_eq: env.MANAGAMENT_ROLE,
			},
		};
		const idmanagement = await getDataFromCollection(
			services,
			roles_filter,
			['users.email', 'users.id'],
			schema,
			'directus_roles'
		);
		const management = idmanagement[0]?.users?.map((user: any) => {
			return user.email;
		});
		const managementIds = idmanagement[0]?.users?.map((user: any) => {
			return user.id;
		});

		if (client.length > 0 && !data[0]?.client_product_mapping?.update) {
			if (
				client[0].payment_terms == 'Credit' &&
				client[0]?.credit_limt &&
				client[0].action == 'N' &&
				data?.approval_status == constant.APPROVED
			) {
				const job = await addJobToClientQueue(client[0]?.id, {
					collection: 'client_product_mapping',
					item: 'update',
					schema: schema,
					services: services,
					data: {
						id: client[0].id,
					},
				});
				data.action = 'Y';
			}
			if (client[0]?.approval_status != constant.PENDING) {
				try {
					if (data?.approval_status == constant.APPROVED) {
						if (client[0]?.changes == constant.COMMERICAL) {
							const baseData = {
								to: [client[0]?.user_updated?.email],
								users: [client[0]?.user_updated?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_commercials:
										client[0]?.commerical == constant.UPFRONT ? constant.Cashback : constant.UPFRONT,
									new_commercials: client[0]?.commerical,
									approved: managementAccepted[0]?.first_name,
									comment: data?.comment,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_commercials:
										client[0]?.commerical == constant.UPFRONT ? constant.Cashback : constant.UPFRONT,
									new_commercials: client[0]?.commerical,
									approved: managementAccepted[0]?.first_name,
									comment: data?.comment,
								},
								item: keys?.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.commercial}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.commAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							data.changes = null;
							return data;
						} else if (client[0]?.changes == constant.CREDITDAYS) {
							const baseData = {
								to: [client[0]?.user_updated?.email],
								users: [client[0]?.user_updated?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_credit: client[0]?.previous_credit,
									modify_credit: client[0]?.credit_days,
									approved: managementAccepted[0]?.first_name,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_credit: client[0]?.previous_credit,
									modify_credit: client[0]?.credit_days,
									approved: managementAccepted[0]?.first_name,
								},
								item: keys?.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.creditDays}`, baseData)
								.then((response) => {
									return baseData;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.creditdaysAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							data.changes = null;
							data.previous_credit = null;
							return data;
						} else if (client[0]?.changes == constant.PAYMENTTERMS) {
							const baseData = {
								to: [client[0]?.user_updated?.email],
								users: [client[0]?.user_updated?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_credit: client[0]?.previous_credit,
									modify_credit: client[0]?.credit_days,
									approved: managementAccepted[0]?.first_name,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_credit: client[0]?.previous_credit,
									modify_credit: client[0]?.credit_days,
									approved: managementAccepted[0]?.first_name,
								},

								item: keys?.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.paymentTerms}`, baseData)
								.then((response) => {
									return baseData;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.paymentTermsAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							data.changes = null;
							return data;
						} else if (client[0]?.changes == constant.DISCOUNT) {
							const baseData = {
								to: [client[0]?.user_updated?.email],
								users: [client[0]?.user_updated?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_discount: client[0]?.previous_discount,
									modify_discount: client[0]?.discount,
									approved: managementAccepted[0]?.first_name,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									payment_terms: client[0]?.payment_terms,
									previous_discount: client[0]?.previous_discount,
									modify_discount: client[0]?.discount,
									approved: managementAccepted[0]?.first_name,
								},
								item: keys?.keys[0],
							};

							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.discount}`, baseData)
								.then((response) => {
									return baseData;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.discountAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							data.previous_discount = null;
							data.changes = null;
							return data;
						} else if (client[0]?.changes == constant.BRANDDISCOUNT) {
							const baseData = {
								to: [client[0]?.user_created?.email],
								users: [client[0]?.user_created?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									noofbrands: client[0]?.client_product_mapping.length,
									url_link: env.CURRENT_URL,
									approved: managementAccepted[0]?.first_name,
									comment: data?.comment,
								},
								item: keys?.keys[0],
							};

							if (data?.requestBrands) {
								delete data.requestBrands;
							}
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, baseData)
								.then((response) => {
									return baseData;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							const updateids = client[0].client_product_mapping.map((brand: any) => {
								return brand.id;
							});
							updateMany({ previous_discount: 0 }, 'client_brand_commercial', services, updateids, schema, null);
							data.changes = null;
							return data;
						} else if (client[0]?.changes == constant.NEW && client[0]?.client_product_mapping?.length > 0) {
							const baseData = {
								to: [client[0]?.user_created?.email],
								users: [client[0]?.user_created?.id],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
								},
								body_data: {
									filter: 'approved',
									client_name: client[0]?.client_id?.client_name,
									client_email: client[0]?.client_id?.client_email,
									client_pan: client[0]?.client_id?.pan_number,
									product_type: client[0]?.product,
									noofbrands: client[0]?.client_product_mapping.length,
									url_link: env.CURRENT_URL,
									approved: managementAccepted[0]?.first_name,
									comment: data?.comment,
								},
								item: keys?.keys[0],
							};
							if (data?.requestBrands) {
								delete data.requestBrands;
							}
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, baseData)
								.then((response) => {
									return baseData;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandAppr}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							if (data?.requestBrands) {
								delete data.requestBrands;
							}
						}
					} else {
						if (client[0]?.approval_status == constant.DECLINED) {
							data.approval_status = constant.PENDING;
							data.status = constant.INACTIVE;
							data.changes = client[0]?.changes
								? client[0]?.changes
								: client[0]?.discount < data?.discount
								? constant.DISCOUNT
								: data?.credit_days > client[0]?.previous_credit
								? constant.CREDITDAYS
								: null;
							const declind = client[0]?.client_product_mapping
								?.filter((data: any) => {
									return data.status == constant.DECLINED;
								})
								?.map(async (id: any) => {
									await updateOneNoEmit(
										{
											status: constant.PENDING,
										},
										'client_brand_commercial',
										services,
										id.id,
										schema,
										context.accountability
									);
								});
							return data;
						} else {
							if (data?.commerical) {
								const baseData = {
									to: management,
									users: managementIds,
									cc: accounts,
									subject_data: {
										sub: 'request',
										data: data,
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										previous_commercials: client[0]?.commerical,
										new_commercials: data?.commerical,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									body_data: {
										filter: 'request',
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										previous_commercials: client[0]?.commerical,
										new_commercials: data?.commerical,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									item: keys?.keys[0],
								};
								axios
									.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.commercial}`, baseData)
									.then((response) => {
										return baseData;
									})
									.catch((error) => {
										return error;
									});
								axios
									.post(`${env.CURRENT_URL}email/notifications/${notificationId.commReq}`, baseData)
									.then((response) => {
										return response;
									})
									.catch((error) => {
										return error;
									});
								data.approval_status = constant.PENDING;
								data.status = constant.INACTIVE;
								data.changes = constant.COMMERICAL;
								return data;
							}
							if (client[0]?.discount < data?.discount) {
								const baseData = {
									to: management,
									users: managementIds,

									cc: accounts,
									subject_data: {
										sub: 'request',
										data: data,
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										previous_discount: client[0]?.discount,
										modify_discount: data?.discount,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									body_data: {
										filter: 'request',
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										previous_discount: client[0]?.discount,
										modify_discount: data?.discount,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									item: keys?.keys[0],
								};

								axios
									.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.discount}`, baseData)
									.then((response) => {
										return baseData;
									})
									.catch((error) => {
										return error;
									});
								axios
									.post(`${env.CURRENT_URL}email/notifications/${notificationId.discountReq}`, baseData)
									.then((response) => {
										return response;
									})
									.catch((error) => {
										return error;
									});
								data.approval_status = constant.PENDING;
								data.status = constant.INACTIVE;
								data.changes = constant.DISCOUNT;
								data.previous_discount = client[0]?.previous_discount
									? client[0]?.previous_discount
									: client[0]?.discount;
								return data;
							} else if (data?.client_product_mapping?.update) {
								const clientexisting = client[0]?.client_product_mapping;
								const clientupdating = data?.client_product_mapping?.update;
								// Check if any discount has increased
								const hasIncreasedDiscount = clientexisting.some((existing: any) => {
									const updated = clientupdating.find((p: any) => p.id === existing.id);
									return (
										(updated && updated?.discount > existing?.discount) ||
										existing?.previous_discount < updated?.discount
									);
								});
								if (hasIncreasedDiscount) {
									const idsArray = data.client_product_mapping.update
										.map((idObj: any) => {
											const foundItem = client[0].client_product_mapping.find((item: any) => item.id === idObj.id);
											return foundItem ? foundItem.id : null;
										})
										.filter((id: any) => id !== null);

									const baseURL = env.CURRENT_URL + 'admin/content/client_brand_commercial/';
									const urls = idsArray.map((id: any) => `${baseURL}${id}`);

									const area = data.client_product_mapping.update.map((brand: any) => {
										const id = client[0]?.client_product_mapping.find((existing: any) => existing.id == brand.id);
										if (id && !brand?.previous_discount) {
											return {
												...brand,
												status: constant.PENDING,
												previous_discount: id.discount,
												brand_name: id.brand_name,
											};
										} else {
											return brand;
										}
									});
									const baseData = {
										to: management,
										users: managementIds,
										body_data: {
											client_name: client[0]?.client_id?.client_name,
											client_email: client[0]?.client_id?.client_email,
											client_pan: client[0]?.client_id?.pan_number,
											commercials: client[0]?.commerical,
											product_type: client[0]?.product,
											payment_terms: client[0]?.payment_terms,
											link: urls,
											brand_detail: area,
										},
										subject_data: {
											client_name: client[0]?.client_id?.client_name,
											client_email: client[0]?.client_id?.client_email,
											client_pan: client[0]?.client_id?.pan_number,
											commercials: client[0]?.commerical,
											product_type: client[0]?.product,
											payment_terms: client[0]?.payment_terms,
											link: urls,
											brand_detail: area,
										},

										item: keys?.keys[0],
									};
									axios
										.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.increasedBrandDisc}`, baseData)
										.then((response) => {
											return response;
										})
										.catch((error) => {
											return error;
										});
									axios
										.post(`${env.CURRENT_URL}email/notifications/${notificationId.inBrandDiscount}`, baseData)
										.then((response) => {
											return response;
										})
										.catch((error) => {
											return error;
										});

									data.client_product_mapping.update = area;
									return data;
								} else if (client[0]?.approval_status == constant.DECLINED) {
									if (client[0]?.payment_terms == constant.ADVANCE) {
										const baseData = {
											to: management,
											users: managementIds,
											cc: accounts,
											body_data: {
												client_name: client[0]?.client_id.client_name,
												client_email: client[0]?.client_id.client_email,
												client_pan: client[0]?.client_id.pan_number,
												commercials: client[0].commerical,
												product_type: client[0].product,
												payment_terms: client[0].payment_terms,
												url_link: env.CURRENT_URL,
											},
										};
										axios
											.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.reqApprovalProductType}`, baseData)
											.then((response) => {
												return baseData;
											})
											.catch((error) => {
												return error;
											});
									}
									data.approval_status = constant.PENDING;
									data.status = constant.INACTIVE;
									return data;
								}
							}
							logError({ log: 'Credit' }, 'client_product_mapping');
							if (data?.payment_terms == constant.CREDIT) {
								logError({ log: 'Credit Days' }, 'client_product_mapping');

								const baseData = {
									to: management,
									users: managementIds,
									cc: accounts,
									subject_data: {
										sub: 'request',
										data: data,
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										credit_day: client[0]?.credit_days,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									body_data: {
										filter: 'request',
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										credit_day: client[0]?.credit_days,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									item: keys?.keys[0],
								};
								axios
									.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.paymentTerms}`, baseData)
									.then((response) => {
										return baseData;
									})
									.catch((error) => {
										return error;
									});
								axios
									.post(`${env.CURRENT_URL}email/notifications/${notificationId.paymentTermsReq}`, baseData)
									.then((response) => {
										return response;
									})
									.catch((error) => {
										return error;
									});
								data.approval_status = constant.PENDING;
								data.status = constant.INACTIVE;
								data.changes = constant.PAYMENTTERMS;
								return data;
							}

							if (client[0]?.credit_days < data?.credit_days || client[0]?.previous_credit) {
								const baseData = {
									to: management,
									users: managementIds,
									cc: accounts,
									subject_data: {
										sub: 'request',
										data: data,
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										credit_days: client[0]?.credit_days,
										modify_days: data?.credit_days,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									body_data: {
										filter: 'request',
										client_name: client[0]?.client_id?.client_name,
										client_email: client[0]?.client_id?.client_email,
										client_pan: client[0]?.client_id?.pan_number,
										product_type: client[0]?.product,
										payment_terms: client[0]?.payment_terms,
										credit_days: client[0]?.credit_days,
										modify_days: data?.credit_days,
										link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
									},
									item: keys?.keys[0],
								};
								axios
									.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.creditDays}`, baseData)
									.then((response) => {
										return baseData;
									})
									.catch((error) => {
										return error;
									});
								axios
									.post(`${env.CURRENT_URL}email/notifications/${notificationId.creditdaysReq}`, baseData)
									.then((response) => {
										return response;
									})
									.catch((error) => {
										return error;
									});
								data.approval_status = constant.PENDING;
								data.status = constant.INACTIVE;
								data.previous_credit = client[0]?.previous_credit ? client[0]?.previous_credit : client[0]?.credit_days;
								data.changes = constant.CREDITDAYS;
								return data;
							}
							if (data?.requestBrands && data?.approval_status == constant.DECLINED) {
								delete data.requestBrands;
								return data;
							}
						}
					}
				} catch (error) {
					throw new InvalidPayloadException(constant.PENDING_MESSAGE);
				}
			} else if (data?.approval_status == constant.DECLINED) {
				const manage_filter = {
					id: {
						_eq: context?.accountability?.user,
					},
				};
				const managementDecline = await getDataFromCollection(
					services,
					manage_filter,
					['first_name'],
					schema,
					'directus_users'
				);

				if (client[0]?.changes == constant.COMMERICAL) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'declined',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical,
							new_commercials: data?.commerical,
							declined: managementDecline[0]?.first_name,
							comment: data?.comment,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical,
							new_commercials: data?.commerical,
							declined: managementDecline[0]?.first_name,
							comment: data?.comment,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.commercial}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.commDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.CREDITDAYS) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'declined',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							declined: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							declined: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.creditDays}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.creditDaysDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.PAYMENTTERMS) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'declined',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							credit_day: client[0]?.credit_days,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							declined: managementAccepted[0]?.first_name,
							credit_day: client[0]?.credit_days,
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.paymentTerms}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.paymentTermsDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.DISCOUNT) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,

						subject_data: {
							sub: 'declined',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_discount: client[0]?.previous_discount,
							modify_discount: client[0]?.discount,
							declined: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_discount: client[0]?.previous_discount,
							modify_discount: client[0]?.discount,
							declined: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						item: keys?.keys[0],
					};

					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.discount}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.discountDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.NEW && client[0]?.client_product_mapping?.length > 0) {
					const baseData = {
						to: [client[0]?.user_created?.email],
						users: [client[0]?.user_created?.id],
						cc: accounts,
						subject_data: {
							sub: 'declined',
							data: data,
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							noofbrands: data?.requestBrands?.length
								? data.requestBrands.length
								: client[0]?.client_product_mapping.length,
							url_link: env.CURRENT_URL,
							approved: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					const brands =
						data?.requestBrands?.length > 0
							? data?.requestBrands
							: client[0].client_product_mapping.map((brands: any) => {
									return brands.id;
							  });
					updateMany(
						{ status: constant.DECLINED },
						'client_brand_commercial',
						services,
						brands,
						schema,
						context.accountability
					);

					if (data?.requestBrands) {
						delete data.requestBrands;

						return data;
					}
				}

				if (client[0]?.changes == constant.BRANDDISCOUNT) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'declined',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical,
							new_commercials: data?.commerical,
							declined: managementDecline[0]?.first_name,
							comment: data?.comment,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
							url_link: env.CURRENT_URL,
						},
						body_data: {
							filter: 'declined',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical,
							new_commercials: data?.commerical,
							declined: managementDecline[0]?.first_name,
							comment: data?.comment,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
							url_link: env.CURRENT_URL,
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.commercial}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.commDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				}
			} else if (data?.approval_status == constant.APPROVED) {
				if (client[0]?.changes == constant.COMMERICAL) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'approved',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical == constant.UPFRONT ? constant.Cashback : constant.UPFRONT,
							new_commercials: client[0]?.commerical,
							approved: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
						item: keys?.keys[0],
						body_data: {
							filter: 'approved',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_commercials: client[0]?.commerical == constant.UPFRONT ? constant.Cashback : constant.UPFRONT,
							new_commercials: client[0]?.commerical,
							approved: managementAccepted[0]?.first_name,
							comment: data?.comment,
						},
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.commercial}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.commAppr}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});

					data.changes = null;
					return data;
				} else if (client[0]?.changes == constant.CREDITDAYS) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'approved',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							approved: managementAccepted[0]?.first_name,
						},
						body_data: {
							filter: 'approved',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							approved: managementAccepted[0]?.first_name,
						},
						item: keys?.keys[0],
					};
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.creditDays}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.creditdaysAppr}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					data.changes = null;
					data.previous_credit = null;
					return data;
				} else if (client[0]?.changes == constant.PAYMENTTERMS) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'approved',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							credit_day: client[0]?.credit_days,
							link: env.CURRENT_URL + 'admin/content/client_product_mapping/' + keys?.keys[0],
							approved: managementAccepted[0]?.first_name,
						},
						body_data: {
							filter: 'approved',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							approved: managementAccepted[0]?.first_name,
						},
						item: keys?.keys[0],
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.paymentTerms}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.paymentTermsAppr}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					data.changes = null;
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.DISCOUNT) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						subject_data: {
							sub: 'approved',
							data: data,
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_discount: client[0]?.previous_discount,
							modify_discount: client[0]?.discount,
							approved: managementAccepted[0]?.first_name,
						},
						body_data: {
							filter: 'approved',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_discount: client[0]?.previous_discount,
							modify_discount: client[0]?.discount,
							approved: managementAccepted[0]?.first_name,
						},
						item: keys?.keys[0],
					};

					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.discount}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});

					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.discountAppr}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					data.previous_discount = null;
					data.changes = null;
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.BRANDDISCOUNT) {
					const baseData = {
						to: [client[0]?.user_updated?.email],
						users: [client[0]?.user_updated?.id],
						cc: accounts,
						body_data: {
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							payment_terms: client[0]?.payment_terms,
							previous_credit: client[0]?.previous_credit,
							modify_credit: client[0]?.credit_days,
							approved: managementAccepted[0]?.first_name,
						},
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.changeInComm}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});

					const updateids = client[0].client_product_mapping.map((brand: any) => {
						return brand.id;
					});
					updateMany({ previous_discount: 0 }, 'client_brand_commercial', services, updateids, schema, null);
					data.changes = null;
					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					return data;
				} else if (client[0]?.changes == constant.NEW && client[0]?.client_product_mapping?.length > 0) {
					const baseData = {
						to: [client[0]?.user_created?.email],
						users: [client[0]?.user_created?.id],
						cc: accounts,
						subject_data: {
							sub: 'approved',
							data: data,
						},
						body_data: {
							filter: 'approved',
							client_name: client[0]?.client_id?.client_name,
							client_email: client[0]?.client_id?.client_email,
							client_pan: client[0]?.client_id?.pan_number,
							product_type: client[0]?.product,
							noofbrands: client[0]?.client_product_mapping.length,
							url_link: env.CURRENT_URL,
							approved: managementAccepted[0]?.first_name,
							credit_limit: client[0]?.credit_limt,
							comment: data?.comment,
						},
						item: keys?.keys[0],
					};

					if (data?.requestBrands) {
						delete data.requestBrands;
					}
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, baseData)
						.then((response) => {
							return baseData;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandAppr}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				}
			} else {
				throw new InvalidPayloadException(constant.PENDING_MESSAGE);
			}
		}
		if (data?.client_product_mapping?.create?.length > 0) {
			const newBrands = data?.client_product_mapping?.create || [];
			const existingBrands = client[0]?.client_product_mapping || [];
			const brandExistsInData = () => {
				return existingBrands.some((existingBrand: any) => {
					return newBrands.some((newBrand: any) => {
						const existingBrandId = existingBrand?.brand?.id || existingBrand?.brand;
						const newBrandId = newBrand?.brand?.id || newBrand?.brand;
						return existingBrandId === newBrandId;
					});
				});
			};
			if (brandExistsInData()) {
				throw new InvalidPayloadException(constant.BRANDALREADYEXIST);
			}
		}
		if (data[0]?.client_product_mapping?.update?.length > 0) {
			const filter = {
				id: {
					_in: keys?.keys,
				},
			};

			const clientData = await getDataFromCollection(services, filter, fields, schema, keys.collection);
			const result = data.map((client_brand: any) => {
				const updateEmails = clientData
					.find((client_brand_exit: any) => client_brand_exit.id === client_brand.id)
					.client_product_mapping.filter((updateItem: any) =>
						client_brand.client_product_mapping.update.some((update: any) => update.id === updateItem.id)
					)
					.map((filteredItem: any) => ({
						id: filteredItem.id,
						status: client_brand.client_product_mapping.update.find((update: any) => update.id === filteredItem.id)
							.status,
						update_email: filteredItem?.user_updated,
					}));

				const clientDetails = clientData.find((clientDetail: any) => clientDetail.id === client_brand.id);
				return {
					id: client_brand.id,
					client_name: clientDetails?.client_id?.client_name,
					client_email: clientDetails?.client_id?.client_email,
					pan_number: clientDetails?.client_id?.pan_number,
					product_type: clientDetails?.product,
					noofbrands: data[0]?.client_product_mapping?.update?.length,
					emails: updateEmails,
				};
			});

			const notApprovedClientProduct = clientData.filter((clientProduct: any) => {
				if (clientProduct?.status == constant.INACTIVE && data.find((id: any) => id?.id == clientProduct?.id)?.id) {
					return true;
				}
			});
			logError(notApprovedClientProduct, 'client_product_mapping');
			notApprovedClientProduct.map((clients: any) => {
				if (data[0]?.client_product_mapping?.update[0]?.status == constant.APPROVED) {
					const payload = {
						approval_status: constant.APPROVED,
						status: constant.ACTIVE,
						requestBrands: data[0].client_product_mapping.update.map((ids: any) => ids.id),
					};

					updateOne(payload, 'client_product_mapping', services, clients?.id, schema, context?.accountability);
				} else {
					const payload = {
						approval_status: constant.DECLINED,
						status: constant.INACTIVE,
						comment: data[0]?.client_product_mapping?.update[0]?.comment,
						requestBrands: data[0].client_product_mapping.update.map((ids: any) => ids.id),
					};
					updateOne(payload, 'client_product_mapping', services, clients?.id, schema, context?.accountability);
				}
			});
			if (notApprovedClientProduct.length == 0) {
				result.map((clientProduct: any) => {
					const mailset = clientProduct.emails.map((email: any) => email.update_email);
					const uniqueEmails = [...new Set(mailset.map((email: any) => email?.email))].filter((mail) => mail != null);
					uniqueEmails.map((sendMail) => {
						let template;
						if (clientProduct.emails[0].status === constant.APPROVED) {
							const mailtemplate = {
								to: [sendMail],
								cc: accounts,
								subject_data: {
									sub: 'approved',
									data: data,
								},
								body_data: {
									filter: 'approved',
									client_name: clientProduct?.client_name,
									client_email: clientProduct?.client_email,
									client_pan: clientProduct?.pan_number,
									product_type: clientProduct?.product_type,
									noofbrands: data[0]?.client_product_mapping?.update?.length,
									url_link: env.CURRENT_URL,
									approved: managementAccepted[0]?.first_name,
									comment: data[0]?.client_product_mapping?.update[0]?.comment,
								},
								item: keys?.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, mailtemplate)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandAppr}`, mailtemplate)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
						} else {
							const mailtemplate = {
								to: [sendMail],
								cc: accounts,
								subject_data: {
									sub: 'declined',
									data: data,
								},
								body_data: {
									filter: 'declined',
									client_name: clientProduct?.client_name,
									client_email: clientProduct?.client_email,
									client_pan: clientProduct?.pan_number,
									product_type: clientProduct?.product_type,
									noofbrands: data[0]?.client_product_mapping?.update?.length,
									url_link: env.CURRENT_URL,
									approved: managementAccepted[0]?.first_name,
									comment: data[0]?.client_product_mapping?.update[0]?.comment,
								},
								item: keys?.keys[0],
							};
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newBrandRequest}`, mailtemplate)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandDec}`, mailtemplate)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
						}
					});
				});
			}

			return [];
		}
	});
	action('client_product_mapping.items.update', async (data: any, payload: any) => {
		try {
			const filter = {
				id: {
					_eq: data?.payload?.client_id,
				},
			};
			const filterManagement = {
				id: {
					_eq: env.MANAGAMENT_ROLE,
				},
			};
			const filterAccounts = {
				id: {
					_eq: env.ACCOUNT_ROLE,
				},
			};
			const brandFilter = {
				id: {
					_eq: data.keys[0],
				},
			};

			const fields = constant.FIELDSDATA.CLIENT;
			const brandFields = constant.BRANDS;
			const client = await getDataFromCollection(services, filter, fields, schema, 'client');
			const clientProduct = await getDataFromCollection(
				services,
				brandFilter,
				brandFields,
				schema,
				'client_product_mapping'
			);
			if (client.length > 0) {
				const idmanagement = await getDataFromCollection(
					services,
					filterManagement,
					['users.email', 'users.id'],
					schema,
					'directus_roles'
				);
				const idaccounts = await getDataFromCollection(
					services,
					filterAccounts,
					['users.email', 'users.id'],
					schema,
					'directus_roles'
				);

				const management = idmanagement[0]?.users.map((user: any) => user.email);
				const managementIds = idmanagement[0]?.users.map((user: any) => user.id);
				const accounts = idaccounts[0]?.users.map((user: any) => user.email);

				const commerical = data.payload.commerical ?? constant.UPFRONT;
				const brand = constant.PRODUCTS.find((product: any) => product == data?.product);

				if (data?.payload?.client_product_mapping?.create?.length > 0) {
					const desiredBrands = data.payload.client_product_mapping.create;
					const product_types = client[0]?.product_type_mapping
						.filter((product: any) => product.product_type == 3 || product.product_type == 4)
						.map((fields: any) => {
							const brands = fields.client_product_mapping.filter((brand: any) => brand.status === 'Pending');
							const filteredBrands = brands.filter((brand: any) =>
								desiredBrands.some((desiredBrand: any) => desiredBrand.brand === brand.brand)
							);

							return {
								brands: filteredBrands,
								product_type: fields.product,
								length: filteredBrands.length,
							};
						});
					product_types.map((product_type) => {
						const ids = product_type.brands.map((item) => item.id);
						const brandNames = product_type.brands.map((item) => item.brand_name);
						const discounts = product_type.brands.map((item) => item.discount);
						const baseUrl = env.CURRENT_URL + 'admin/content/client_brand_commercial/';
						const generateBrandUrls = (brandIds, baseUrl) => {
							return brandIds.map((brandId) => `${baseUrl}${brandId}`);
						};
						const brandUrls = generateBrandUrls(ids, baseUrl);

						const baseData = {
							to: management,
							users: managementIds,
							cc: accounts,
							subject_data: {
								data: data,
							},
							body_data: {
								client_name: client[0]?.client_name,
								client_email: client[0]?.client_email,
								client_pan: client[0]?.pan_number,
								product_type: product_type.product_type,
								noofbrands: product_type.length,
								brand_ids: ids,
								brand_name: brandNames,
								url_link: env.CURRENT_URL + 'admin/content/client/' + data?.client_id,
								brand_url: brandUrls,
								brand_discount: discounts,
							},
							item: data?.client_id,
						};
						if (product_type.length != 0) {
							axios
								.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.reqApprovalBrand}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
							axios
								.post(`${env.CURRENT_URL}email/notifications/${notificationId.brandReq}`, baseData)
								.then((response) => {
									return response;
								})
								.catch((error) => {
									return error;
								});
						}
					});
				}
			}
		} catch (error) {}
	});

	filter('client_brand_commercial.items.create', async (data: any, keys: any, context: any) => {
		data.status = constant.PENDING;
		return data;
	});
	filter('client_brand_commercial.items.update', async (data: any, keys: any, context: any) => {
		const fields = constant.FIELDSDATA.CLIENT_BRAND_COMMERICAL;
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};
		const clientBrand = await getDataFromCollection(services, filter, fields, schema, keys.collection);
		if (clientBrand[0].status == constant.DECLINED) {
			data.status = constant.PENDING;
			return data;
		}
	});

	filter('client_product_mapping.items.create', async (data: any, payload: any) => {
		const filter = {
			id: {
				_eq: data?.client_id,
			},
		};
		const fields = constant.FIELDSDATA.CLIENT;
		const client = await getDataFromCollection(services, filter, fields, schema, 'client');
		const duplicate = client[0]?.product_type_mapping.find((product: any) => product?.product == data?.product);
		if (!duplicate) {
			data.approval_status = constant.PENDING;
			data.status = constant.INACTIVE;
		} else {
			throw new InvalidPayloadException(constant.DUPLICATEPRODUCT);
		}
	});
	action('client_product_mapping.items.create', async (data: any, payload: any) => {
		const filter = {
			id: {
				_eq: data?.payload?.client_id,
			},
		};
		const filterManagement = {
			id: {
				_eq: env.MANAGAMENT_ROLE,
			},
		};
		const filterAccounts = {
			id: {
				_eq: env.ACCOUNT_ROLE,
			},
		};
		const fields = constant.FIELDSDATA.CLIENT;
		const client = await getDataFromCollection(services, filter, fields, schema, 'client');

		if (client.length > 0) {
			const idmanagement = await getDataFromCollection(
				services,
				filterManagement,
				['users.email', 'users.id'],
				schema,
				'directus_roles'
			);
			const idaccounts = await getDataFromCollection(
				services,
				filterAccounts,
				['users.email', 'users.id'],
				schema,
				'directus_roles'
			);

			const management = idmanagement[0]?.users.map((user: any) => user.email);
			const managementIds = idmanagement[0]?.users.map((user: any) => user.id);
			const accounts = idaccounts[0]?.users.map((user: any) => user.email);
			const accountsIds = idaccounts[0]?.users.map((user: any) => user.id);

			const commerical = data.payload.commerical ?? constant.UPFRONT;
			const brand = constant.PRODUCTS.find((product: any) => product == data?.product);

			const endpointUrl = `${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newProduct}`;

			if (data?.payment_terms == constant.ADVANCE) {
				const baseData = {
					to: management,
					users: managementIds,
					cc: accounts,
					body_data: {
						data: data,
						brand: data?.payload?.client_product_mapping?.create,
						client_name: client[0]?.client_name,
						client_email: client[0]?.client_email,
						client_pan: client[0]?.pan_number,
						commercials: commerical,
						product_type: data?.payload?.product,
						payment_terms: data?.payload?.payment_terms,
						credit_day: data?.payload?.credit_days,
						credit_limit: data?.payload?.credit_limt,
						discount: data?.payload?.discount,
						url: env.CURRENT_URL + 'admin/content/client/' + data?.client_id,
						url_link: env.CURRENT_URL,
						product_id: data?.key,
					},
					subject_data: {
						data: data,
						client: client[0],
					},

					item: data?.key,
				};
				axios.post(endpointUrl, baseData).catch((error) => {
					if (error.response) {
					} else {
						return error;
					}
				});
				axios
					.post(`${env.CURRENT_URL}email/notifications/${notificationId.newProduct}`, baseData)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
			} else {
				const baseData = {
					to: management,
					users: managementIds,
					cc: accounts,
					body_data: {
						data: data,
						brand: data?.payload?.client_product_mapping?.create,
						client_name: client[0]?.client_name,
						client_email: client[0]?.client_email,
						client_pan: client[0]?.pan_number,
						commercials: commerical,
						product_type: data?.payload?.product,
						payment_terms: data?.payload?.payment_terms,
						credit_day: data?.payload?.credit_days,
						credit_limit: data?.payload?.credit_limt,
						discount: data?.payload?.discount,
						url: env.CURRENT_URL + 'admin/content/client/' + data?.client_id,
						url_link: env.CURRENT_URL,
						product_id: data?.key,
					},
					subject_data: {
						data: data,
					},

					item: data?.key,
				};
				axios.post(endpointUrl, baseData).catch((error) => {
					if (error.response) {
					} else {
						return error;
					}
				});
				axios
					.post(`${env.CURRENT_URL}email/notifications/${notificationId.newProduct}`, baseData)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
			}
		}
	});

	//  ONE time Commerical create
	filter('one_time_commerical.items.create', async (data: any) => {
		try {
			if (data.amount < 0) {
				throw {
					error: constant.ONETIMECOMMERICAL,
				};
			} else {
				return data;
			}
		} catch (error: any) {
			if (error?.error == constant.ONETIMECOMMERICAL) {
				throw new InvalidPayloadException(constant.ONETIMECOMMERICAL);
			} else {
				logError(error, 'one_time_commerical');
			}
		}
	});
	//  ONE time Commerical update
	filter('one_time_commerical.items.update', async (data: any) => {
		try {
			if (data.amount > -1) {
				throw {
					error: constant.ONETIMECOMMERICAL,
				};
			} else {
				return data;
			}
		} catch (error: any) {
			if (error?.error == constant.ONETIMECOMMERICAL) {
				throw new InvalidPayloadException(constant.ONETIMECOMMERICAL);
			} else {
				logError(error, 'one_time_commerical');
			}
		}
	});
	filter('vendor_shakepe_order_details.items.create', async (data: any) => {
		const voucherOrderDetails = new ItemsService('voucher_order_details', {
			schema: await getSchema(),
			accountability: { admin: true },
		});
		const voucherDetails = await voucherOrderDetails.readByQuery({
			filter: {
				id: {
					_eq: data?.voucher_order_id,
				},
			},
			fields: ['denomination', 'quantity'],
		});
		if (voucherDetails[0].denomination) {
			const quantity = data?.quantity && data?.same_as_order ? data.quantity : voucherDetails[0].quantity;
			const discount = quantity * voucherDetails[0].denomination * (parseFloat(data.vendor_discount) / 100);
			const poValue = voucherDetails[0].denomination * quantity - discount;
			return {
				...data,
				quantity: quantity,
				po_value: poValue,
			};
		} else {
			return {
				...data,
			};
		}
	});
	action('vendor_shakepe_order_details.items.create', async (data: any) => {
		try {
			const voucherOrderDetails = new ItemsService('voucher_order_details', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const vendorDetails = new ItemsService('sd_vendor_details', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const poCreation = new ItemsService('vendor_payment', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const gettingShakepeOrderId = await voucherOrderDetails.readByQuery({
				filter: {
					id: {
						_eq: data?.payload?.voucher_order_id,
					},
				},
				fields: ['shakepe_order_id', 'quantity', 'denomination'],
			});

			const quantity = data?.payload?.quantity ? data.payload.quantity : gettingShakepeOrderId[0].quantity;
			const discount =
				quantity * gettingShakepeOrderId[0].denomination * (parseFloat(data.payload.vendor_discount) / 100);
			const poValue = gettingShakepeOrderId[0].denomination * quantity - discount;
			if (gettingShakepeOrderId.length > 0 && gettingShakepeOrderId[0]?.shakepe_order_id && data.payload?.vendor) {
				const poItems = await poCreation.readByQuery({
					filter: {
						shake_pe_order_id: {
							_eq: parseInt(gettingShakepeOrderId[0]?.shakepe_order_id),
						},
						vendor: {
							_eq: parseInt(data?.payload?.vendor),
						},
					},
					fields: ['id', 'po_value', 'vendor', 'po_details'],
				});
				if (poItems.length == 0) {
					const vendor = await vendorDetails.readByQuery({
						filter: {
							id: {
								_eq: parseInt(data?.payload?.vendor),
							},
						},
						fields: ['primary_contact', 'fulfillment', 'gstin', 'account_number', 'ifsc_code', 'bank_name'],
					});

					const payloadPo = {
						vendor: data?.payload?.vendor,
						shake_pe_order_id: gettingShakepeOrderId[0]?.shakepe_order_id,
						vendor_point_of_contact: vendor[0].primary_contact,
						vendor_fullfillment: vendor[0].fulfillment,
						vendor_bank: vendor[0].bank_name,
						vendor_bank_account_number: vendor[0].account_number,
						vendor_ifsc_code: vendor[0].ifsc_code,
						vendor_gstin: vendor[0].gstin,
						po_details: [data.key],
						payment_status: constant.PAYEMENTPENDING,
						po_value: poValue,
					};
					return await poCreation.createOne(payloadPo);
				} else {
					const newPoValue = poValue + parseInt(poItems[0]?.po_value);
					const update = await poCreation.updateOne(poItems[0].id, {
						po_value: newPoValue ? newPoValue : 0,
						po_details: [...poItems[0].po_details, data.key],
					});
					return update;
				}
			}
		} catch (error) {
			logError(error, 'vendor_shakepe_order_details');
		}
	});

	action('client.items.create', async (data: any) => {
		const filter = {
			id: {
				_eq: env.MANAGAMENT_ROLE,
			},
		};
		const idmanagement = await getDataFromCollection(
			services,
			filter,
			['users.email', 'users.id'],
			schema,
			'directus_roles'
		);
		const management = idmanagement[0].users.map((user: any) => user.email);
		const managementIds = idmanagement[0].users.map((user: any) => user.id);

		const filterAccounts = {
			id: {
				_eq: env.ACCOUNT_ROLE,
			},
		};
		const idaccounts = await getDataFromCollection(
			services,
			filterAccounts,
			['users.email', 'users.id'],
			schema,
			'directus_roles'
		);
		const accounts = idaccounts[0]?.users.map((user: any) => user.email);
		const accountsIds = idaccounts[0]?.users.map((user: any) => user.id);

		const endpointUrl = `${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newClientOnboard}`;

		const mailtemplate = data.payload.product_type_mapping.create.map((client: any) => {
			const commerical = client.commerical ?? constant.UPFRONT;
			const brand = constant.PRODUCTS.find((product: any) => product == client.product);
			if (client?.payment_terms == constant.ADVANCE) {
				const baseData = {
					to: management,
					users: managementIds,
					cc: accounts,
					body_data: {
						client_name: data?.payload?.client_name,
						client_email: data?.payload?.client_email,
						client_pan: data?.payload?.pan_number,
						commercials: commerical,
						product_type: client?.product,
						payment_terms: client?.payment_terms,
						discount: client?.discount,
						url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
						url_link: env.CURRENT_URL,
						data: data,
					},
					subject_data: {
						data: data,
					},

					item: data?.key,
				};
				axios
					.post(endpointUrl, baseData)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
				axios
					.post(`${env.CURRENT_URL}email/notifications/${notificationId.newCLient}`, baseData)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
			} else {
				const baseData = {
					to: management,
					users: managementIds,
					cc: accounts,
					body_data: {
						client_name: data?.payload?.client_name,
						client_email: data?.payload?.client_email,
						client_pan: data?.payload?.pan_number,
						commercials: commerical,
						product_type: client?.product,
						payment_terms: client?.payment_terms,
						credit_day: client?.credit_days,
						credit_limit: client?.credit_limt,
						discount: client?.discount,
						url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
						url_link: env.CURRENT_URL,
						data: data,
					},
					subject_data: {
						data: data,
					},

					item: data?.key,
				};
				axios
					.post(endpointUrl, baseData)
					.then((response) => {
						return baseData;
					})
					.catch((error) => {
						if (error.response) {
							return baseData;
						}
					});
				axios
					.post(`${env.CURRENT_URL}email/notifications/${notificationId.newCLient}`, baseData)
					.then((response) => {
						return response;
					})
					.catch((error) => {
						return error;
					});
			}
		});
	});

	action(
		'client_product_mapping.items.update',
		async ({ payload, keys, collection }, { database, schema, accountability }) => {
			const data = payload;
			try {
				const mailService = new MailService({ schema, knex: database });

				const filterforClient = {
					id: {
						_eq: keys[0],
					},
				};
				const fields = constant.FIELDSDATA.CLIENT_CREATE;
				const filter = {
					role: {
						_eq: env.MANAGAMENT_ROLE,
					},
				};
				const clientData = await getDataFromCollection(
					services,
					filterforClient,
					fields,
					schema,

					'client_product_mapping'
				);
				const management = await getDataFromCollection(
					services,
					filter,
					['first_name', 'email', 'id'],
					schema,
					'directus_users'
				);
				const manage_filter = {
					id: {
						_eq: accountability?.user,
					},
				};
				const managementAccepted = await getDataFromCollection(
					services,
					manage_filter,
					['first_name'],
					schema,
					'directus_users'
				);

				if (data?.approval_status == constant.APPROVED && clientData[0]?.changes == constant.NEW) {
					if (clientData[0].client_id.status == constant.INACTIVE) {
						updateOneNoEmit(
							{ status: constant.ACTIVE },
							'client',
							services,
							clientData[0].client_id.id,
							schema,
							accountability
						);
						const baseData = {
							to: [clientData[0].user_created.email],
							users: [clientData[0].user_created.id],
							body_data: {
								client_name: clientData[0]?.client_id?.client_name,
								client_email: clientData[0]?.client_id?.client_email,
								client_pan: clientData[0]?.client_id?.pan_number,
								url: env.CURRENT_URL + 'admin/content/client/' + clientData[0]?.client_id?.id,
								approved: managementAccepted[0]?.first_name,
								url_link: env.CURRENT_URL,
							},
							subject_data: {
								data: data,
								client: clientData[0],
								approver: managementAccepted[0]?.first_name,
							},

							item: clientData[0]?.client_id?.id,
						};

						axios
							.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newClientReq}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								error;
							});
						axios
							.post(`${env.CURRENT_URL}email/notifications/${notificationId.clientAppr}`, baseData)
							.then((response) => {
								response;
							})
							.catch((error) => {
								error;
							});
					}
					const baseData = {
						to: [clientData[0].user_created.email],
						users: [clientData[0].user_created.id],
						body_data: {
							client_name: clientData[0]?.client_id?.client_name,
							client_email: clientData[0]?.client_id?.client_email,
							client_pan: clientData[0]?.client_id?.pan_number,
							product_type: clientData[0]?.product,
							url: env.CURRENT_URL + 'admin/content/client/' + clientData[0]?.client_id.id,
							approved: managementAccepted[0]?.first_name,
							url_link: env.CURRENT_URL,
						},
						subject_data: {
							data: data,
							client: clientData[0],
							approver: managementAccepted[0]?.first_name,
						},

						item: clientData[0]?.id,
					};
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newProdReq}`, baseData)
						.then((response) => {
							response;
						})
						.catch((error) => {
							error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.prodAppr}`, baseData)
						.then((response) => {
							response;
						})
						.catch((error) => {
							error;
						});
				} else if (data?.approval_status == constant.DECLINED && clientData[0]?.changes == constant.NEW) {
					if (clientData[0].client_id.status == constant.INACTIVE) {
						const baseData = {
							to: [clientData[0].user_created.email],
							users: [clientData[0]?.user_created.id],
							body_data: {
								client_name: clientData[0]?.client_id?.client_name,
								client_email: clientData[0]?.client_id?.client_email,
								client_pan: clientData[0]?.client_id?.pan_number,
								url: env.CURRENT_URL + 'admin/content/client/' + clientData[0]?.client_id?.id,
								declined: managementAccepted[0]?.first_name,
								url_link: env.CURRENT_URL,
							},
							subject_data: {
								data: data,
								decline: managementAccepted[0]?.first_name,
								client: clientData[0],
							},
							item: clientData[0]?.client_id?.id,
						};
						axios
							.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.decNewClient}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
						axios
							.post(`${env.CURRENT_URL}email/notifications/${notificationId.clientDec}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
					}
					const baseData = {
						to: [clientData[0].user_created.email],
						users: [clientData[0]?.user_created.id],
						body_data: {
							client_name: clientData[0]?.client_id?.client_name,
							client_email: clientData[0]?.client_id?.client_email,
							client_pan: clientData[0]?.client_id?.pan_number,
							product_type: clientData[0]?.product,
							url: env.CURRENT_URL + 'admin/content/client/' + clientData[0]?.client_id?.id,
							declined: managementAccepted[0]?.first_name,
							comments: data?.comment,
							url_link: env.CURRENT_URL,
						},
						subject_data: {
							data: data,
							decline: management[0]?.first_name,
							client: clientData[0],
						},

						item: clientData[0]?.id,
					};

					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.decNewProd}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.prodDec}`, baseData)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				} else if (data?.approval_status == constant.PENDING && clientData[0]?.changes == constant.NEW) {
					if (clientData[0]?.payment_terms == constant.ADVANCE) {
						const baseData = {
							to: management.map((email: any) => email.email),
							users: management.map((email: any) => email.id),
							body_data: {
								client_name: clientData[0].client_id.client_name,
								client_email: clientData[0].client_id.client_email,
								client_pan: clientData[0].client_id.pan_number,
								commercials: clientData[0].commerical,
								product_type: clientData[0].product,
								payment_terms: clientData[0].payment_terms,
								discount: clientData[0].discount,
								url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
								url_link: env.CURRENT_URL,
								new_commericals: data.commerical,
								new_discount: data.discount,
							},
							subject_data: {
								data: data,
								client_name: clientData[0].client_id.client_name,
								client_email: clientData[0].client_id.client_email,
								client_pan: clientData[0].client_id.pan_number,
								commercials: clientData[0].commerical,
								product_type: clientData[0].product,
								payment_terms: clientData[0].payment_terms,
								discount: clientData[0].discount,
								url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
								url_link: env.CURRENT_URL,
							},

							item: data?.client_id,
						};
						axios
							.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newClientOnboard}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
						axios
							.post(`${env.CURRENT_URL}email/notifications/${notificationId.newCLient}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
					} else {
						const baseData = {
							to: management.map((email: any) => email.email),
							users: management.map((email: any) => email.id),
							body_data: {
								client_name: clientData[0].client_id.client_name,
								client_email: clientData[0].client_id.client_email,
								client_pan: clientData[0].client_id.pan_number,
								commercials: clientData[0].commerical,
								product_type: clientData[0].product,
								payment_terms: clientData[0].payment_terms,
								discount: clientData[0].discount,
								url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
								url_link: env.CURRENT_URL,
								credit_day: data?.credit_days,
								credit_limit: data?.credit_limt,
								new_commericals: data.commerical,
								new_discount: data.discount,
							},
							subject_data: {
								data: data,
								client_name: clientData[0].client_id.client_name,
								client_email: clientData[0].client_id.client_email,
								client_pan: clientData[0].client_id.pan_number,
								commercials: clientData[0].commerical,
								product_type: clientData[0].product,
								payment_terms: clientData[0].payment_terms,
								discount: clientData[0].discount,
								url: env.CURRENT_URL + 'admin/content/client/' + data?.key,
								url_link: env.CURRENT_URL,
								credit_day: data?.credit_days,
								credit_limit: data?.credit_limt,
							},

							item: data?.client_id,
						};
						axios
							.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.newClientOnboard}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
						axios
							.post(`${env.CURRENT_URL}email/notifications/${notificationId.newCLient}`, baseData)
							.then((response) => {
								return response;
							})
							.catch((error) => {
								return error;
							});
					}
				}
			} catch (error) {}
		}
	);
	filter('client_product_mapping.items.delete', async (data: any, keys: any) => {
		const filter = {
			id: {
				_in: data,
			},
		};

		const fields = constant.FIELDSDATA.CLIENT_DELETE;
		const client = await getDataFromCollection(services, filter, fields, schema, 'client_product_mapping');
		const clientId = getClientIdsForProductMapping(data, client);
		updateMany({ status: constant.INACTIVE }, 'client', services, clientId, schema, null);
	});

	filter('performing_invoice.items.create', async (data: any) => {
		const serviceAmount = parseFloat(data?.service_amount && data?.service_fee ? data.service_amount : 0);
		const discount = parseFloat(data.discount ? data.discount : 0);
		const orderLevelDiscount = parseFloat(data?.order_level_discount ? data.order_level_discount : 0);

		try {
			const gpr = data?.filtering_with_product_type === constant.GPR;
			const giftCard = data?.filtering_with_product_type == constant.GIFT_CARD;
			const vouchers = data?.filtering_with_product_type == constant.VOUCHERS;
			const links = data?.filtering_with_product_type == constant.LINKS;
			const points = data?.filtering_with_product_type == constant.SHAKEPEPOINT;
			const codes = data?.filtering_with_product_type == constant.SHAKEPECODE;
			const commerical = data.commerical;
			switch (true) {
				case gpr || points:
					const loadAmount = parseFloat(data?.load_amount ? data.load_amount : 0);
					const totalValue = loadAmount - (loadAmount * discount) / 100 + serviceAmount;
					if (orderLevelDiscount != discount && data?.add_or_reduce_discount) {
						const orderLevelValue = loadAmount - (loadAmount * orderLevelDiscount) / 100 + serviceAmount;

						return {
							...data,
							total_value: commerical == constant.UPFRONT && data.add_or_reduce_discount ? orderLevelValue : null,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback: commerical != constant.UPFRONT ? (loadAmount * orderLevelDiscount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? loadAmount + serviceAmount : null,
							previous_cashback: commerical != constant.UPFRONT ? (loadAmount * discount) / 100 : null,
							total_order_value: commerical == constant.UPFRONT ? loadAmount : null,
						};
					} else {
						return {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback: commerical != constant.UPFRONT ? (loadAmount * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? loadAmount + serviceAmount : null,
							total_order_value: commerical == constant.UPFRONT ? loadAmount : null,
						};
					}
				case giftCard:
					let totalReturnGift = 0;
					let orderLevelValueGift = 0;
					let subTotal = 0;
					data.brand_sku_mapping?.create.forEach((brand: any) => {
						const { add_or_reduce, denomination, quantity, actual_discoubt, order_level_discount } =
							brand.gift_card_order_details_id;
						const totalValueGift = denomination - (denomination * actual_discoubt) / 100;
						const returnValue = totalValueGift * quantity;
						subTotal += denomination * quantity;
						totalReturnGift += returnValue;
						if ((actual_discoubt < order_level_discount || actual_discoubt > order_level_discount) && add_or_reduce) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discoubt) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						}
					});
					const totalAfterDiscount = totalReturnGift + serviceAmount;

					return {
						...data,
						total_value:
							commerical == constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? orderLevelValueGift + serviceAmount
								: null,
						original_value: commerical == constant.UPFRONT ? totalAfterDiscount : null,
						cashback:
							commerical != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - orderLevelValueGift
								: commerical != constant.UPFRONT
								? subTotal - totalReturnGift
								: null,
						previous_cashback:
							commerical != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - totalReturnGift
								: null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotal + serviceAmount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotal : null,
					};
				case vouchers:
					let totalReturnVoucher = 0;
					let orderLevelValueVoucher = 0;
					let subTotalVoucher = 0;

					data?.brand_sku_mapping_voucher?.create &&
						data?.brand_sku_mapping_voucher?.create.forEach((brand: any) => {
							const { add_or_reduce_discount, denomination, quantity, actual_discount, order_level_discount } = brand;

							const totalValuediscount = denomination - (denomination * actual_discount) / 100;
							const returnValue = totalValuediscount * quantity;
							subTotalVoucher += denomination * quantity;
							totalReturnVoucher += returnValue;

							if (
								(actual_discount < order_level_discount || actual_discount > order_level_discount) &&
								add_or_reduce_discount
							) {
								const totalValue = denomination - (denomination * order_level_discount) / 100;
								const returnValue = totalValue * quantity;
								orderLevelValueVoucher += returnValue;
							} else {
								const totalValue = denomination - (denomination * actual_discount) / 100;
								const returnValue = totalValue * quantity;
								orderLevelValueVoucher += returnValue;
							}
						});
					const totalVoucher = totalReturnVoucher + serviceAmount;
					return {
						...data,
						total_value:
							commerical == constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? orderLevelValueVoucher + serviceAmount
								: null,
						original_value: commerical == constant.UPFRONT ? totalVoucher : null,
						cashback:
							commerical != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - orderLevelValueVoucher
								: commerical != constant.UPFRONT
								? subTotalVoucher - totalReturnVoucher
								: null,

						previous_cashback:
							commerical != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - totalReturnVoucher
								: null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotalVoucher + serviceAmount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotalVoucher : null,
					};
				case links:
					if (data?.generic_links_details?.create) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						data?.generic_links_details?.create.map((e: any) => {
							const { denomination, quantity } = e;

							subTotal += denomination * quantity;
							itemDiscount += denomination * quantity * (discount / 100);
							itemOrderDiscount += data.add_or_reduce_discount
								? denomination * quantity * (data.order_level_discount / 100)
								: denomination * quantity * (discount / 100);
						});

						return {
							...data,
							total_value:
								commerical == constant.UPFRONT && data.add_or_reduce_discount
									? subTotal - itemOrderDiscount + serviceAmount
									: null,
							original_value: commerical == constant.UPFRONT ? subTotal - itemDiscount + serviceAmount : null,
							cashback:
								commerical != constant.UPFRONT && data.add_or_reduce_discount
									? itemOrderDiscount
									: commerical != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commerical != constant.UPFRONT ? subTotal + serviceAmount : null,
							total_order_value: commerical == constant.UPFRONT ? subTotal : null,
						};
					} else if (data?.catalog_links_orders?.create) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						data?.catalog_links_orders?.create.map((e) => {
							const { denomination, total_no_links } = e;
							subTotal += denomination * total_no_links;
							itemDiscount += denomination * total_no_links * (data.discount / 100);
							itemOrderDiscount +=
								data.order_level_discount && data?.add_or_reduce_discount
									? denomination * total_no_links * (data.order_level_discount / 100)
									: denomination * total_no_links * (data.discount / 100);
						});
						return {
							...data,
							total_value:
								commerical == constant.UPFRONT && data.add_or_reduce_discount
									? subTotal - itemOrderDiscount + serviceAmount
									: null,
							original_value: commerical == constant.UPFRONT ? subTotal - itemDiscount + serviceAmount : null,
							cashback:
								commerical != constant.UPFRONT && data.add_or_reduce_discount
									? itemOrderDiscount
									: commerical != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commerical != constant.UPFRONT ? subTotal + serviceAmount : null,
							total_order_value: commerical == constant.UPFRONT ? subTotal : null,
						};
					}
					break;
				case points:
					const loadAmount_points = parseFloat(data?.loadAmount ? data.loadAmount : 0);
					const totalValuePoints = loadAmount_points - (loadAmount_points * discount) / 100;
					if ((orderLevelDiscount > discount && data?.add_or_reduce_discount) || orderLevelDiscount < discount) {
						const orderLevelValuePoints =
							loadAmount_points - (loadAmount_points * orderLevelDiscount) / 100 + serviceAmount;

						return {
							...data,
							total_value: commerical == constant.UPFRONT && data.add_or_reduce_discount ? orderLevelValuePoints : null,
							original_value: commerical == constant.UPFRONT ? totalValuePoints + serviceAmount : null,
							cashback: commerical != constant.UPFRONT ? (loadAmount_points * orderLevelDiscount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? loadAmount_points + serviceAmount : null,
							previous_cashback: commerical != constant.UPFRONT ? (loadAmount_points * discount) / 100 : null,
							total_order_value: commerical == constant.UPFRONT ? loadAmount_points : null,
						};
					} else {
						return {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValuePoints + serviceAmount : null,
							cashback: commerical != constant.UPFRONT ? (loadAmount_points * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? loadAmount_points + serviceAmount : null,
							total_order_value: commerical == constant.UPFRONT ? loadAmount_points : null,
						};
					}
				case codes:
					let subTotalCode = 0;
					let itemDiscountCode = 0;
					let itemOrderDiscountCode = 0;

					data.shakepe_codes_orders.create.map((e) => {
						const { value_of_code, total_no_of_codes } = e;
						subTotalCode += value_of_code * total_no_of_codes;
						itemDiscountCode += value_of_code * total_no_of_codes * (discount / 100);
						itemOrderDiscountCode +=
							orderLevelDiscount && data?.add_or_reduce_discount
								? value_of_code * total_no_of_codes * (orderLevelDiscount / 100)
								: value_of_code * total_no_of_codes * (discount / 100);
					});
					return {
						...data,
						total_value:
							commerical == constant.UPFRONT && data.add_or_reduce_discount
								? subTotalCode - itemOrderDiscountCode + serviceAmount
								: null,
						original_value: commerical == constant.UPFRONT ? subTotalCode - itemDiscountCode + serviceAmount : null,
						cashback:
							commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemOrderDiscountCode : itemDiscountCode,
						previous_cashback: commerical != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscountCode : null,
						total_value_cashback: commerical != constant.UPFRONT ? subTotalCode + serviceAmount : null,
						total_order_value: commerical == constant.UPFRONT ? subTotalCode : null,
					};
				default:
					break;
			}
		} catch (error) {
			logError(error, 'performing_invoice');
		}
	});
	filter('performing_invoice.items.create', (data: any) => {
		return {
			...data,
			status: constant.PENDING,
			changes: null,
		};
	});
	filter('performing_invoice.items.create', (data: any) => {
		if (data?.filtering_with_product_type == constant.shakepe_orders.shakepe_codes) {
			if (!data?.form_factor || data?.form_factor == constant.shakepe_orders.virtual) {
				const codeValidty = data?.validity_of_code;

				const totalNumberOfCodes = data.shakepe_codes_orders.create.reduce(
					(acc: any, current: any) => acc + current.total_no_of_codes,
					0
				);
				if (totalNumberOfCodes > 5000) {
					throw new InvalidPayloadException(constant.error.virual_codes);
				}
				const vaildTill = data.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						validity: addingValidDate(code.activation ? code.activation : data?.activation_date, codeValidty),
					};
				});
				data.shakepe_codes_orders.create = vaildTill;

				return data;
			}
			if (
				data.form_factor != constant.shakepe_orders.virtual &&
				data?.checkbox.length > 0 &&
				data?.checkbox[0] == 'TRUE'
			) {
				const codeValidty = data?.validity_of_code;
				const vaildTill = data.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						activation: data.activation_date,

						validity: addingValidDate(data.activation_date, codeValidty),
					};
				});
				data.shakepe_codes_orders.create = vaildTill;
				return data;
			}
			if (data?.checkbox == 0 && data.form_factor != constant.shakepe_orders.virtual) {
				const codeValidty = data?.validity_of_code;
				const vaildTill = data.shakepe_codes_orders.create.map((code: any) => {
					return {
						...code,
						validity: addingValidDate(code?.activation, codeValidty),
					};
				});
				data.shakepe_codes_orders.create = vaildTill;
				return data;
			}
		}
	});
	filter('performing_invoice.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};

		const performing_invoice = await getDataFromCollection(
			services,
			filter,
			constant.FIELDSDATA.PROFOMA_INVOICE,
			schema,
			'performing_invoice'
		);
		let mergeObject: any = {};

		if (
			!data.status &&
			!data.approval_status &&
			!data.payment_status &&
			!data.send_to_client &&
			!data?.po_number &&
			!data?.others_documents
		) {
			switch (performing_invoice[0].filtering_with_product_type) {
				case constant.GPR:
					mergeObject = { ...performing_invoice[0], ...data };
					const service_amount = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const discount = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscount = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					let commerical = mergeObject?.commerical;
					const load_amount = parseFloat(
						mergeObject?.load_amount ? mergeObject.load_amount : data?.load_amount ? data?.load_amount : 0
					);
					const totalValue = load_amount - (load_amount * discount) / 100 + service_amount;
					if (orderLevelDiscount != discount && mergeObject.add_or_reduce_discount) {
						const orderLevelValue = load_amount - (load_amount * orderLevelDiscount) / 100 + service_amount;
						const modify_discount_is = mergeObject.add_or_reduce_discount
							? true
							: data?.add_or_reduce_discount
							? true
							: false;
						return {
							...data,
							total_value: commerical == constant.UPFRONT && modify_discount_is ? orderLevelValue : null,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback:
								commerical != constant.UPFRONT && mergeObject?.order_level_discount
									? (load_amount * orderLevelDiscount) / 100
									: (load_amount * discount) / 100,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							previous_cashback:
								commerical != constant.UPFRONT && mergeObject?.order_level_discount
									? (load_amount * discount) / 100
									: null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};
					} else {
						return {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							total_value: null,
							cashback: commerical != constant.UPFRONT ? (load_amount * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};
					}
				case constant.GIFT_CARD:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountGift = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let totalReturnGift = 0;
					let orderLevelValueGift = 0;
					let subTotal = 0;
					const commericalsGift = mergeObject?.commerical;
					const final = performing_invoice[0]?.brand_sku_mapping.map((update: any) => {
						const updateItem = data?.brand_sku_mapping?.update?.find((updateItem: any) => updateItem.id === update.id);
						const deleteItem = data?.brand_sku_mapping?.delete?.find((updateItem: any) => updateItem === update.id);
						if (deleteItem) {
							return null;
						} else if (updateItem) {
							return {
								...update,
								gift_card_order_details_id: {
									...update.gift_card_order_details_id,
									...updateItem.gift_card_order_details_id,
								},
							};
						} else {
							return update;
						}
					});
					data?.brand_sku_mapping?.create?.length > 0
						? data['brand_sku_mapping']['create'].forEach((createItem: any) => {
								final.push(createItem);
						  })
						: '';

					final.forEach((brand: any) => {
						const { add_or_reduce, denomination, quantity, actual_discoubt, order_level_discount } =
							brand.gift_card_order_details_id;
						const totalValueGift = denomination - (denomination * actual_discoubt) / 100;
						const returnValue = totalValueGift * quantity;
						subTotal += denomination * quantity;
						totalReturnGift += returnValue;
						if ((actual_discoubt < order_level_discount || actual_discoubt > order_level_discount) && add_or_reduce) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discoubt) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						}
					});
					const totalAfterDiscount = totalReturnGift + serviceAmountGift;
					return {
						...data,
						total_value:
							commericalsGift == constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? orderLevelValueGift + serviceAmountGift
								: null,
						original_value: commericalsGift == constant.UPFRONT ? totalAfterDiscount : null,
						cashback:
							commericalsGift != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - orderLevelValueGift
								: commericalsGift != constant.UPFRONT
								? subTotal - totalReturnGift
								: null,
						previous_cashback:
							commericalsGift != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - totalReturnGift
								: null,
						total_value_cashback: commericalsGift != constant.UPFRONT ? subTotal + serviceAmountGift : null,
						total_order_value: commericalsGift == constant.UPFRONT ? subTotal : null,
					};
				case constant.VOUCHERS:
					mergeObject = { ...performing_invoice[0], ...data };
					let totalReturnVoucher = 0;
					let orderLevelValueVoucher = 0;
					let subTotalVoucher = 0;
					const serviceAmountVoucher = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const commericalsVouchers = mergeObject?.commerical;
					const finalVouchers = performing_invoice[0]?.brand_sku_mapping_voucher.map((item: any) => {
						const updateItem =
							data?.brand_sku_mapping_voucher?.update.length > 0
								? data['brand_sku_mapping_voucher']['update'].find((updateItem: any) => updateItem.id === item.id)
								: null;
						const deleteItem =
							data?.brand_sku_mapping_voucher?.delete.length > 0
								? data['brand_sku_mapping_voucher']['delete'].find((updateItem: any) => updateItem === item.id)
								: null;
						return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
					});
					data?.brand_sku_mapping_voucher?.create?.length > 0
						? data['brand_sku_mapping_voucher']['create'].forEach((createItem: any) => {
								finalVouchers.push(createItem);
						  })
						: '';

					const createItems = finalVouchers.filter((product: any) => product != null);
					createItems.forEach((brand: any) => {
						const { add_or_reduce_discount, denomination, quantity, actual_discount, order_level_discount } = brand;

						const totalValuediscount = denomination - (denomination * actual_discount) / 100;
						const returnValue = totalValuediscount * quantity;
						subTotalVoucher += denomination * quantity;
						totalReturnVoucher += returnValue;

						if (
							(actual_discount < order_level_discount || actual_discount > order_level_discount) &&
							add_or_reduce_discount
						) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueVoucher += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueVoucher += returnValue;
						}
					});
					const totalVoucher = totalReturnVoucher + serviceAmountVoucher;
					return {
						...data,
						total_value:
							commericalsVouchers == constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? orderLevelValueVoucher + serviceAmountVoucher
								: null,
						original_value: commericalsVouchers == constant.UPFRONT ? totalVoucher : null,
						cashback:
							commericalsVouchers != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - orderLevelValueVoucher
								: commericalsVouchers != constant.UPFRONT
								? subTotalVoucher - totalReturnVoucher
								: null,

						previous_cashback:
							commericalsVouchers != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - totalReturnVoucher
								: null,
						total_value_cashback:
							commericalsVouchers != constant.UPFRONT ? subTotalVoucher + serviceAmountVoucher : null,
						total_order_value: commericalsVouchers == constant.UPFRONT ? subTotalVoucher : null,
					};
				case constant.SHAKEPECODE:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountCode = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let subTotalCode = 0;
					let itemDiscountCode = 0;
					let itemOrderDiscountCode = 0;
					const commercialsCodes = mergeObject?.commerical;
					const discountCodes = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountCodes = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					const finalCodes = performing_invoice[0]?.shakepe_codes_orders.map((item: any) => {
						const updateItem =
							data?.shakepe_codes_orders?.update?.length > 0
								? data.shakepe_codes_orders.update.find((updateItem: any) => updateItem.id === item.id)
								: null;
						const deleteItem =
							data?.shakepe_codes_orders?.delete?.length > 0
								? data.shakepe_codes_orders.delete.find((updateItem: any) => updateItem === item.id)
								: null;
						return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
					});
					data?.shakepe_codes_orders?.create?.length > 0
						? data['shakepe_codes_orders']['create'].forEach((createItem: any) => {
								finalCodes.push(createItem);
						  })
						: '';
					finalCodes?.map((code: any) => {
						const { value_of_code, total_no_of_codes } = code;
						subTotalCode += value_of_code * total_no_of_codes;
						itemDiscountCode += value_of_code * total_no_of_codes * (discountCodes / 100);
						itemOrderDiscountCode +=
							(orderLevelDiscountCodes || orderLevelDiscountCodes == 0) && mergeObject.add_or_reduce_discount
								? value_of_code * total_no_of_codes * (orderLevelDiscountCodes / 100)
								: value_of_code * total_no_of_codes * (discountCodes / 100);
					});
					return {
						...data,
						total_value:
							commercialsCodes == constant.UPFRONT && mergeObject.add_or_reduce_discount
								? subTotalCode - itemOrderDiscountCode + serviceAmountCode
								: null,
						original_value:
							commercialsCodes == constant.UPFRONT ? subTotalCode - itemDiscountCode + serviceAmountCode : null,
						cashback:
							commercialsCodes != constant.UPFRONT && !mergeObject.add_or_reduce_discount
								? itemDiscountCode
								: itemOrderDiscountCode,
						previous_cashback:
							commercialsCodes != constant.UPFRONT && mergeObject.add_or_reduce_discount ? itemDiscountCode : null,
						total_value_cashback: commercialsCodes != constant.UPFRONT ? subTotalCode + serviceAmountCode : null,
						total_order_value: commercialsCodes == constant.UPFRONT ? subTotalCode : null,
					};
				case constant.LINKS:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountLink = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let subTotalLink = 0;
					let itemDiscountLink = 0;
					let itemOrderDiscountLink = 0;
					const commercialsLinks = mergeObject?.commerical;
					const discountLinks = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountLinks = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					if (mergeObject?.link_type == constant.GENERIC) {
						const final = performing_invoice[0]?.generic_links_details.map((item: any) => {
							const updateItem =
								data?.generic_links_details?.update?.length > 0
									? data.generic_links_details.update.find((updateItem: any) => updateItem.id === item.id)
									: null;
							const deleteItem =
								data?.generic_links_details?.delete?.length > 0
									? data.generic_links_details.delete.find((updateItem: any) => updateItem === item.id)
									: null;
							return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
						});
						data?.generic_links_details?.create?.length > 0
							? data['generic_links_details']['create'].forEach((createItem: any) => {
									final.push(createItem);
							  })
							: '';
						const createDataLinks = final.filter((product: any) => product != null);
						createDataLinks.map((e: any) => {
							const { denomination, quantity } = e;

							subTotalLink += denomination * quantity;
							itemDiscountLink += denomination * quantity * (discountLinks / 100);
							itemOrderDiscountLink += mergeObject.add_or_reduce_discount
								? denomination * quantity * (orderLevelDiscountLinks / 100)
								: denomination * quantity * (discountLinks / 100);
						});

						return {
							...data,
							total_value:
								commercialsLinks == constant.UPFRONT && mergeObject.add_or_reduce_discount
									? subTotalLink - itemOrderDiscountLink + serviceAmountLink
									: null,
							original_value:
								commercialsLinks == constant.UPFRONT ? subTotalLink - itemDiscountLink + serviceAmountLink : null,
							cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? itemOrderDiscountLink
									: commercialsLinks != constant.UPFRONT
									? itemDiscountLink
									: null,
							previous_cashback:
								commercialsLinks != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscountLink : null,
							total_value_cashback: commercialsLinks != constant.UPFRONT ? subTotalLink + serviceAmountLink : null,
							total_order_value: commercialsLinks == constant.UPFRONT ? subTotalLink : null,
						};
					} else if (mergeObject?.link_type == constant.CATALOGUE) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						const finalCat = performing_invoice[0]?.catalog_links_orders.map((item: any) => {
							const updateItem =
								data?.catalog_links_orders?.update?.length > 0
									? data.catalog_links_orders.update.find((updateItem: any) => updateItem.id === item.id)
									: null;
							const deleteItem =
								data?.catalog_links_orders?.delete?.length > 0
									? data.catalog_links_orders.delete.find((updateItem: any) => updateItem === item.id)
									: null;
							return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
						});

						data?.catalog_links_orders?.create?.length > 0
							? data['catalog_links_orders']['create'].forEach((createItem: any) => {
									finalCat.push(createItem);
							  })
							: '';
						const createDataLinks = finalCat.filter((product: any) => product != null);
						createDataLinks.map((links: any) => {
							const { denomination, total_no_links } = links;
							subTotal += denomination * total_no_links;
							itemDiscount += denomination * total_no_links * (mergeObject.discount / 100);
							itemOrderDiscount +=
								(mergeObject.order_level_discount || mergeObject.order_level_discount == 0) &&
								mergeObject?.add_or_reduce_discount
									? denomination * total_no_links * (mergeObject.order_level_discount / 100)
									: denomination * total_no_links * (mergeObject.discount / 100);
						});
						return {
							...data,
							total_value:
								commercialsLinks == constant.UPFRONT && mergeObject.add_or_reduce_discount
									? subTotal - itemOrderDiscount + serviceAmountLink
									: null,
							original_value: commercialsLinks == constant.UPFRONT ? subTotal - itemDiscount + serviceAmountLink : null,
							cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? itemOrderDiscount
									: commercialsLinks != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commercialsLinks != constant.UPFRONT ? subTotal + serviceAmountLink : null,
							total_order_value: commercialsLinks == constant.UPFRONT ? subTotal : null,
						};
					} else {
						return data;
					}
				case constant.SHAKEPEPOINT:
					mergeObject = { ...performing_invoice[0], ...data };
					const service_amount_points = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const discount_points = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountPoints = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					const commerical_points = mergeObject?.commerical;
					const load_amount_points = parseFloat(
						mergeObject?.load_amount ? mergeObject.load_amount : data?.load_amount ? data?.load_amount : 0
					);
					const totalValuePoints =
						load_amount_points - (load_amount_points * discount_points) / 100 + service_amount_points;
					if (orderLevelDiscountPoints != discount_points && mergeObject.add_or_reduce_discount) {
						const orderLevelValue =
							load_amount_points - (load_amount_points * orderLevelDiscountPoints) / 100 + service_amount_points;
						const modify_discount_is = mergeObject.add_or_reduce_discount
							? true
							: data?.add_or_reduce_discount
							? true
							: false;
						return {
							...data,
							total_value: commerical_points == constant.UPFRONT && modify_discount_is ? orderLevelValue : null,
							original_value: commerical_points == constant.UPFRONT ? totalValuePoints : null,
							cashback:
								commerical_points != constant.UPFRONT && mergeObject.add_or_reduce_discoun
									? (load_amount_points * orderLevelDiscountPoints) / 100
									: (load_amount_points * discount_points) / 100,
							total_value_cashback:
								commerical_points != constant.UPFRONT ? load_amount_points + service_amount_points : null,
							previous_cashback:
								commerical_points != constant.UPFRONT && mergeObject.add_or_reduce_discoun
									? (load_amount_points * discount_points) / 100
									: null,
							total_order_value: commercialsLinks == constant.UPFRONT ? load_amount_points : null,
						};
					} else {
						return {
							...data,
							original_value: commerical_points == constant.UPFRONT ? totalValuePoints : null,
							total_value: null,
							cashback: commerical_points != constant.UPFRONT ? (load_amount_points * discount_points) / 100 : null,
							total_value_cashback:
								commerical_points != constant.UPFRONT ? load_amount_points + service_amount_points : null,
							total_order_value: commercialsLinks == constant.UPFRONT ? load_amount_points : null,
						};
					}

				default:
					break;
			}
		}
	});
	filter('performing_invoice.items.update', async (data: any, keys: any, context: any) => {
		if (data?.status == 'Convert to Order') {
			return data;
		} else if (
			!data.status &&
			!data.approval_status &&
			!data.payment_status &&
			!data.send_to_client &&
			!data?.po_number &&
			!data?.others_documents
		) {
			return {
				...data,
				status: constant.PENDING,
				changes: null,
				approval_status: null,
			};
		}
	});

	filter('performing_invoice.items.update', async (data: any, keys: any, context: any) => {
		if (data?.status == 'Convert to Order') {
			const filter = {
				id: {
					_eq: keys?.keys[0],
				},
			};

			const performing_invoice = await getDataFromCollection(
				services,
				filter,
				constant.FIELDSDATA.PROFOMA_INVOICE_ORDER_CREATION,
				schema,
				'performing_invoice'
			);
			const pi_order = performing_invoice[0];
			const order = {
				service_fee: pi_order?.service_fee,
				add_or_reduce_discount: pi_order?.add_or_reduce_discount,
				modified_credit_days: pi_order?.modified_credit_days,
				credit_days: pi_order?.credit_days,
				actual_credit_days: pi_order?.actual_credit_days,
				product_type: pi_order?.product_type,
				shipping_address: pi_order?.shipping_address,
				select_address: pi_order?.select_address,
				validity_of_code: pi_order?.validity_of_code,
				client: pi_order?.client,
				printer: pi_order?.printer,
				pi_id: keys?.keys[0],
				per_card_cost_client: pi_order?.per_card_cost_client,
				load_amount: pi_order?.load_amount,
				previous_cashback: pi_order?.previous_cashback,
				cashback: pi_order?.cashback,
				total_value_cashback: pi_order?.total_value_cashback,
				total_value: pi_order?.total_value,
				original_value: pi_order?.original_value,
				order_level_discount: pi_order?.order_level_discount ?? 0,
				service_amount: pi_order?.service_amount,
				discount: pi_order?.discount,
				file_upload_data: pi_order?.file_upload_data,
				per_card_cost_for_printer: pi_order?.per_card_cost_for_printer,
				form_factor: pi_order?.form_factor ?? 'Virtual',
				po_number: pi_order?.po_number,
				link_type: pi_order?.link_type,
				total_order_value: pi_order?.total_order_value,
				action: 'flow',
				filtering_with_product_type: pi_order?.filtering_with_product_type,
				calculation: pi_order?.calculation,
				payment: 'Payment Received',
				fullfillment: pi_order?.fullfillment,
				commerical: pi_order?.commerical,
				UTR_Number: pi_order?.utr_number,
				payment_terms: pi_order?.payment_terms,
				code_type: pi_order?.code_type,
				form_factor_copy: pi_order?.form_factor_copy,
				card_type: pi_order?.card_type,
				checkbox: pi_order?.checkbox,
				activation_date: pi_order?.activation_date,
				credit_period: pi_order?.credit_period,
				load_date: pi_order?.load_date,
				upload_codes: pi_order?.upload_codes,
				poc: pi_order?.poc,
				billing_address: pi_order?.billing_address,
				shipping_address_1: pi_order?.shipping_address_1,
				generic_links_details: {
					create: pi_order?.generic_links_details?.map((generic_links: any) => {
						return {
							brand: generic_links?.brand,
							denomination: generic_links?.denomination,
							quantity: generic_links?.quantity,
							brand_name: generic_links?.brand_name,
						};
					}),
					update: [],
					delete: [],
				},
				brand_sku_mapping_voucher: {
					create: pi_order?.brand_sku_mapping_voucher?.map((brand: any) => {
						return {
							brand: brand?.brand,
							sku_code: brand?.sku_code,
							denomination: brand?.denomination,
							actual_discount: parseFloat(brand?.actual_discount),
							quantity: brand?.quantity,
							add_or_reduce_discount: brand?.add_or_reduce_discount,
							order_level_discount: brand?.order_level_discount ? parseFloat(brand?.order_level_discount) : null,
							brand_name: brand?.brand_name,
						};
					}),
					update: [],
					delete: [],
				},
				catalog_links_orders: {
					create: pi_order?.catalog_links_orders?.map((links: any) => {
						return {
							denomination: links?.denomination,
							total_no_links: links?.total_no_links,
							brands: links?.brands,
						};
					}),
					update: [],
					delete: [],
				},
				brand_sku_mapping: {
					create: pi_order?.brand_sku_mapping?.map((brand: any) => {
						return {
							shakepe_orders_id: '+',
							gift_card_order_details_id: {
								denomination: brand?.gift_card_order_details_id?.denomination,
								quantity: brand?.gift_card_order_details_id?.quantity,
								actual_discoubt: parseFloat(brand?.gift_card_order_details_id?.actual_discoubt),
								add_or_reduce: brand?.gift_card_order_details_id?.add_or_reduce,
								order_level_discount: brand?.gift_card_order_details_id?.order_level_discount
									? parseFloat(brand?.gift_card_order_details_id?.order_level_discount)
									: null,
								vendor_product_mapping: brand?.gift_card_order_details_id?.vendor_product_mapping,
								brand_name: brand?.gift_card_order_details_id?.brand_name,
								brand: brand?.gift_card_order_details_id?.brand,
							},
						};
					}),
					update: [],
					delete: [],
				},

				shakepe_codes_orders: {
					create: pi_order?.shakepe_codes_orders?.map((codes: any) => {
						return {
							total_no_of_codes: codes?.total_no_of_codes,
							value_of_code: codes?.value_of_code,
							validity: codes?.validity,
							activation: codes?.activation,
						};
					}),
					update: [],
					delete: [],
				},
				buyer_ref_number: pi_order?.buyer_ref_number,
			};

			await addJobToClientQueue(pi_order?.client, {
				collection: 'performing_invoice',
				item: 'update',
				schema: schema,
				services: services,
				id: keys?.keys[0],
			});
			const orderId = await createOne(services, 'shakepe_orders', order, schema, {
				admin: true,
				user: pi_order.user_created,
			});

			data.shakepe_order = orderId;
			return data;
		}
	});

	filter('shakepe_orders.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};

		const orders = await getDataFromCollection(services, filter, ['client'], schema, 'shakepe_orders');
		if (data.payment == 'Payment Received') {
			const job_codes = await addJobToClientQueue(orders?.client, {
				collection: 'shakepe_orders',
				item: 'update',
				schema: schema,
				services: services,
				data: data,
				id: keys?.keys[0],
			});
		}
	});

	action(
		'performing_invoice.items.update',
		async ({ payload, keys, collection }, { database, schema, accountability }) => {
			try {
				const mailService = new MailService({ schema, knex: database });
				const filterPI = {
					id: {
						_eq: keys[0],
					},
				};
				if (
					!payload?.approval_status &&
					!payload?.approval_status &&
					!payload?.payment_status &&
					!payload?.send_to_client &&
					payload?.status != 'Convert to Order' &&
					!payload?.po_number &&
					!payload?.others_documents
				) {
					emailSendingPro(filterPI, services, schema, mailService, accountability);
				}
			} catch (error) {
				logError(error, 'performing_invoice');
			}
		}
	);

	filter('performing_invoice.items.create', async (payload: any, meta: any, context: any) => {
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

	filter('shakepe_orders.items.update', async (data: any, keys: any, context: any) => {
		const performing_invoice = await getDataFromCollection(
			services,
			{
				status: {
					_eq: 'draft',
				},
				id: {
					_eq: keys?.keys[0],
				},
			},
			constant.FIELDSDATA.SHAKEPE_ORDERS,
			schema,
			'shakepe_orders'
		);
		let mergeObject: any = {};

		if (performing_invoice.length > 0 && performing_invoice[0].status == 'draft') {
			switch (performing_invoice[0].filtering_with_product_type) {
				case constant.GPR:
					mergeObject = { ...performing_invoice[0], ...data };
					const service_amount = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const discount = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscount = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					let commerical = mergeObject?.commerical;
					const load_amount = parseFloat(
						mergeObject?.load_amount ? mergeObject.load_amount : data?.load_amount ? data?.load_amount : 0
					);
					const totalValue = load_amount - (load_amount * discount) / 100 + service_amount;

					if (orderLevelDiscount != discount && mergeObject.add_or_reduce_discount) {
						const orderLevelValue = load_amount - (load_amount * orderLevelDiscount) / 100 + service_amount;
						const modify_discount_is = mergeObject.add_or_reduce_discount
							? true
							: data?.add_or_reduce_discount
							? true
							: false;

						const final = {
							...data,
							total_value: commerical == constant.UPFRONT && modify_discount_is ? orderLevelValue : null,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							cashback: commerical != constant.UPFRONT ? (load_amount * orderLevelDiscount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							previous_cashback: commerical != constant.UPFRONT ? (load_amount * discount) / 100 : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};

						const job = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'update',
							schema: schema,
							services: services,
							data: final,
							id: keys?.keys[0],
						});
						if (job?.error) {
							throw new InvalidPayloadException(job?.error);
						}

						return {
							...final,
							...job,
						};
					} else {
						const final = {
							...data,
							original_value: commerical == constant.UPFRONT ? totalValue : null,
							total_value: null,
							cashback: commerical != constant.UPFRONT ? (load_amount * discount) / 100 : null,
							total_value_cashback: commerical != constant.UPFRONT ? load_amount + service_amount : null,
							total_order_value: commerical == constant.UPFRONT ? load_amount : null,
						};

						const job = await addJobToClientQueue(final?.client, {
							collection: 'shakepe_orders',
							item: 'update',
							schema: schema,
							services: services,
							data: final,
							id: keys?.keys[0],
						});
						if (job?.error) {
							throw new InvalidPayloadException(job?.error);
						}

						return {
							...final,
							...job,
						};
					}
				case constant.GIFT_CARD:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountGift = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let totalReturnGift = 0;
					let orderLevelValueGift = 0;
					let subTotal = 0;
					const commericalsGift = mergeObject?.commerical;
					const final = performing_invoice[0]?.brand_sku_mapping.map((update: any) => {
						const updateItem = data?.brand_sku_mapping?.update?.find((updateItem: any) => updateItem.id === update.id);
						const deleteItem = data?.brand_sku_mapping?.delete?.find((updateItem: any) => updateItem === update.id);
						if (deleteItem) {
							return null;
						} else if (updateItem) {
							return {
								...update,
								gift_card_order_details_id: {
									...update.gift_card_order_details_id,
									...updateItem.gift_card_order_details_id,
								},
							};
						} else {
							return update;
						}
					});
					data?.brand_sku_mapping?.create?.length > 0
						? data['brand_sku_mapping']['create'].forEach((createItem: any) => {
								final.push(createItem);
						  })
						: '';

					final.forEach((brand: any) => {
						const { add_or_reduce, denomination, quantity, actual_discoubt, order_level_discount } =
							brand.gift_card_order_details_id;
						const totalValueGift = denomination - (denomination * actual_discoubt) / 100;
						const returnValue = totalValueGift * quantity;
						subTotal += denomination * quantity;
						totalReturnGift += returnValue;
						if ((actual_discoubt < order_level_discount || actual_discoubt > order_level_discount) && add_or_reduce) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discoubt) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueGift += returnValue;
						}
					});
					const totalAfterDiscount = totalReturnGift + serviceAmountGift;

					const final_gift = {
						...data,
						total_value:
							commericalsGift == constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? orderLevelValueGift + serviceAmountGift
								: null,
						original_value: commericalsGift == constant.UPFRONT ? totalAfterDiscount : null,
						cashback:
							commericalsGift != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - orderLevelValueGift
								: commericalsGift != constant.UPFRONT
								? subTotal - totalReturnGift
								: null,
						previous_cashback:
							commericalsGift != constant.UPFRONT && totalReturnGift != orderLevelValueGift
								? subTotal - totalReturnGift
								: null,
						total_value_cashback: commericalsGift != constant.UPFRONT ? subTotal + serviceAmountGift : null,
						total_order_value: commericalsGift == constant.UPFRONT ? subTotal : null,
					};
					const job_gift = await addJobToClientQueue(final_gift?.client, {
						collection: 'shakepe_orders',
						item: 'update',
						schema: schema,
						services: services,
						id: keys?.keys[0],
						data: final_gift,
					});
					if (job_gift?.error) {
						throw new InvalidPayloadException(job_gift?.error);
					}

					return {
						...final_gift,
						...job_gift,
					};
				case constant.VOUCHERS:
					mergeObject = { ...performing_invoice[0], ...data };
					let totalReturnVoucher = 0;
					let orderLevelValueVoucher = 0;
					let subTotalVoucher = 0;
					const serviceAmountVoucher = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const commericalsVouchers = mergeObject?.commerical;
					const finalVouchers = performing_invoice[0]?.brand_sku_mapping_voucher.map((item: any) => {
						const updateItem =
							data?.brand_sku_mapping_voucher?.update.length > 0
								? data['brand_sku_mapping_voucher']['update'].find((updateItem: any) => updateItem.id === item.id)
								: null;
						const deleteItem =
							data?.brand_sku_mapping_voucher?.delete.length > 0
								? data['brand_sku_mapping_voucher']['delete'].find((updateItem: any) => updateItem === item.id)
								: null;
						return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
					});
					data?.brand_sku_mapping_voucher?.create?.length > 0
						? data['brand_sku_mapping_voucher']['create'].forEach((createItem: any) => {
								finalVouchers.push(createItem);
						  })
						: '';

					const createItems = finalVouchers.filter((product: any) => product != null);
					createItems.forEach((brand: any) => {
						const { add_or_reduce_discount, denomination, quantity, actual_discount, order_level_discount } = brand;

						const totalValuediscount = denomination - (denomination * actual_discount) / 100;
						const returnValue = totalValuediscount * quantity;
						subTotalVoucher += denomination * quantity;
						totalReturnVoucher += returnValue;

						if (
							(actual_discount < order_level_discount || actual_discount > order_level_discount) &&
							add_or_reduce_discount
						) {
							const totalValue = denomination - (denomination * order_level_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueVoucher += returnValue;
						} else {
							const totalValue = denomination - (denomination * actual_discount) / 100;
							const returnValue = totalValue * quantity;
							orderLevelValueVoucher += returnValue;
						}
					});
					const totalVoucher = totalReturnVoucher + serviceAmountVoucher;

					const final_voucher = {
						...data,
						total_value:
							commericalsVouchers == constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? orderLevelValueVoucher + serviceAmountVoucher
								: null,
						original_value: commericalsVouchers == constant.UPFRONT ? totalVoucher : null,
						cashback:
							commericalsVouchers != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - orderLevelValueVoucher
								: commericalsVouchers != constant.UPFRONT
								? subTotalVoucher - totalReturnVoucher
								: null,

						previous_cashback:
							commericalsVouchers != constant.UPFRONT && totalReturnVoucher != orderLevelValueVoucher
								? subTotalVoucher - totalReturnVoucher
								: null,
						total_value_cashback:
							commericalsVouchers != constant.UPFRONT ? subTotalVoucher + serviceAmountVoucher : null,
						total_order_value: commericalsVouchers == constant.UPFRONT ? subTotalVoucher : null,
					};
					const job_vouchers = await addJobToClientQueue(final_voucher?.client, {
						collection: 'shakepe_orders',
						item: 'update',
						schema: schema,
						services: services,
						data: final_voucher,
						id: keys?.keys[0],
					});
					if (job_vouchers?.error) {
						throw new InvalidPayloadException(job_vouchers?.error);
					}

					return {
						...final_voucher,
						...job_vouchers,
					};
				case constant.SHAKEPECODE:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountCode = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let subTotalCode = 0;
					let itemDiscountCode = 0;
					let itemOrderDiscountCode = 0;
					const commercialsCodes = mergeObject?.commerical;
					const discountCodes = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountCodes = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					const finalCodes = performing_invoice[0]?.shakepe_codes_orders.map((item: any) => {
						const updateItem =
							data?.shakepe_codes_orders?.update?.length > 0
								? data.shakepe_codes_orders.update.find((updateItem: any) => updateItem.id === item.id)
								: null;
						const deleteItem =
							data?.shakepe_codes_orders?.delete?.length > 0
								? data.shakepe_codes_orders.delete.find((updateItem: any) => updateItem === item.id)
								: null;
						return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
					});
					data?.shakepe_codes_orders?.create?.length > 0
						? data['shakepe_codes_orders']['create'].forEach((createItem: any) => {
								finalCodes.push(createItem);
						  })
						: '';
					finalCodes?.map((code: any) => {
						const { value_of_code, total_no_of_codes } = code;
						subTotalCode += value_of_code * total_no_of_codes;
						itemDiscountCode += value_of_code * total_no_of_codes * (discountCodes / 100);
						itemOrderDiscountCode +=
							(orderLevelDiscountCodes || orderLevelDiscountCodes == 0) && mergeObject.add_or_reduce_discount
								? value_of_code * total_no_of_codes * (orderLevelDiscountCodes / 100)
								: value_of_code * total_no_of_codes * (discountCodes / 100);
					});
					const final_codes = {
						...data,
						total_value:
							commercialsCodes == constant.UPFRONT && mergeObject.add_or_reduce_discount
								? subTotalCode - itemOrderDiscountCode + serviceAmountCode
								: null,
						original_value:
							commercialsCodes == constant.UPFRONT ? subTotalCode - itemDiscountCode + serviceAmountCode : null,
						cashback:
							commercialsCodes != constant.UPFRONT && mergeObject.add_or_reduce_discount
								? itemOrderDiscountCode
								: itemDiscountCode,
						previous_cashback:
							commercialsCodes != constant.UPFRONT && mergeObject.add_or_reduce_discount ? itemDiscountCode : null,
						total_value_cashback: commercialsCodes != constant.UPFRONT ? subTotalCode + serviceAmountCode : null,
						total_order_value: commercialsCodes == constant.UPFRONT ? subTotalCode : null,

						payment: 'Payment Received',
					};
					const job_codes = await addJobToClientQueue(final_codes?.client, {
						collection: 'shakepe_orders',
						item: 'update',
						schema: schema,
						services: services,
						data: final_codes,
					});
					if (job_codes?.error) {
						throw new InvalidPayloadException(job_codes?.error);
					}

					return {
						...final_codes,
						...job_codes,
					};
				case constant.LINKS:
					mergeObject = { ...performing_invoice[0], ...data };
					const serviceAmountLink = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					let subTotalLink = 0;
					let itemDiscountLink = 0;
					let itemOrderDiscountLink = 0;
					const commercialsLinks = mergeObject?.commerical;
					const discountLinks = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountLinks = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					if (mergeObject?.link_type == constant.GENERIC) {
						const final = performing_invoice[0]?.generic_links_details.map((item: any) => {
							const updateItem =
								data?.generic_links_details?.update?.length > 0
									? data.generic_links_details.update.find((updateItem: any) => updateItem.id === item.id)
									: null;
							const deleteItem =
								data?.generic_links_details?.delete?.length > 0
									? data.generic_links_details.delete.find((updateItem: any) => updateItem === item.id)
									: null;
							return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
						});
						data?.generic_links_details?.create?.length > 0
							? data['generic_links_details']['create'].forEach((createItem: any) => {
									final.push(createItem);
							  })
							: '';
						const createDataLinks = final.filter((product: any) => product != null);
						createDataLinks.map((e: any) => {
							const { denomination, quantity } = e;

							subTotalLink += denomination * quantity;
							itemDiscountLink += denomination * quantity * (discountLinks / 100);
							itemOrderDiscountLink += mergeObject.add_or_reduce_discount
								? denomination * quantity * (orderLevelDiscountLinks / 100)
								: denomination * quantity * (discountLinks / 100);
						});

						const final_generic_links = {
							...data,
							total_value:
								commercialsLinks == constant.UPFRONT && mergeObject.add_or_reduce_discount
									? subTotalLink - itemOrderDiscountLink + serviceAmountLink
									: null,
							original_value:
								commercialsLinks == constant.UPFRONT ? subTotalLink - itemDiscountLink + serviceAmountLink : null,
							cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? itemOrderDiscountLink
									: commercialsLinks != constant.UPFRONT
									? itemDiscountLink
									: null,
							previous_cashback:
								commercialsLinks != constant.UPFRONT && data.add_or_reduce_discount ? itemDiscountLink : null,
							total_value_cashback: commercialsLinks != constant.UPFRONT ? subTotalLink + serviceAmountLink : null,
							total_order_value: commercialsLinks == constant.UPFRONT ? subTotalLink : null,

							payment: 'Payment Received',
						};
						const job_generic = await addJobToClientQueue(final_generic_links?.client, {
							collection: 'shakepe_orders',
							item: 'update',
							schema: schema,
							services: services,
							data: final_generic_links,
							id: keys?.keys[0],
						});
						if (job_generic?.error) {
							throw new InvalidPayloadException(job_generic?.error);
						}
						return {
							...final_generic_links,
							...job_generic,
						};
					} else if (mergeObject?.link_type == constant.CATALOGUE) {
						let subTotal = 0;
						let itemDiscount = 0;
						let itemOrderDiscount = 0;
						const finalCat = performing_invoice[0]?.catalog_links_orders.map((item: any) => {
							const updateItem =
								data?.catalog_links_orders?.update?.length > 0
									? data.catalog_links_orders.update.find((updateItem: any) => updateItem.id === item.id)
									: null;
							const deleteItem =
								data?.catalog_links_orders?.delete?.length > 0
									? data.catalog_links_orders.delete.find((updateItem: any) => updateItem === item.id)
									: null;
							return updateItem ? { ...item, ...updateItem } : deleteItem ? null : item;
						});

						data?.catalog_links_orders?.create?.length > 0
							? data['catalog_links_orders']['create'].forEach((createItem: any) => {
									finalCat.push(createItem);
							  })
							: '';
						const createDataLinks = finalCat.filter((product: any) => product != null);
						createDataLinks.map((links: any) => {
							const { denomination, total_no_links } = links;
							subTotal += denomination * total_no_links;
							itemDiscount += denomination * total_no_links * (mergeObject.discount / 100);
							itemOrderDiscount +=
								(mergeObject.order_level_discount || mergeObject.order_level_discount == 0) &&
								mergeObject?.add_or_reduce_discount
									? denomination * total_no_links * (mergeObject.order_level_discount / 100)
									: denomination * total_no_links * (mergeObject.discount / 100);
						});
						const final_catalogue_links = {
							...data,
							total_value:
								commercialsLinks == constant.UPFRONT && mergeObject.add_or_reduce_discount
									? subTotal - itemOrderDiscount + serviceAmountLink
									: null,
							original_value: commercialsLinks == constant.UPFRONT ? subTotal - itemDiscount + serviceAmountLink : null,
							cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? itemOrderDiscount
									: commercialsLinks != constant.UPFRONT
									? itemDiscount
									: null,
							previous_cashback:
								commercialsLinks != constant.UPFRONT && mergeObject.add_or_reduce_discount ? itemDiscount : null,
							total_value_cashback: commercialsLinks != constant.UPFRONT ? subTotal + serviceAmountLink : null,
							total_order_value: commercialsLinks == constant.UPFRONT ? subTotal : null,
						};
						const job_catalog = await addJobToClientQueue(final_catalogue_links?.client, {
							collection: 'shakepe_orders',
							item: 'update',
							schema: schema,
							services: services,
							data: final_catalogue_links,
							id: keys?.keys[0],
						});
						if (job_catalog?.error) {
							throw new InvalidPayloadException(job_catalog?.error);
						}

						return {
							...final_catalogue_links,
							...job_catalog,
						};
					} else {
						return data;
					}
				case constant.SHAKEPEPOINT:
					mergeObject = { ...performing_invoice[0], ...data };
					const service_amount_points = parseFloat(
						mergeObject?.service_amount && mergeObject?.service_fee ? mergeObject.service_amount : 0
					);
					const discount_points = parseFloat(mergeObject?.discount ? mergeObject.discount : 0);
					const orderLevelDiscountPoints = parseFloat(
						mergeObject?.order_level_discount ? mergeObject?.order_level_discount : 0
					);
					const commerical_points = mergeObject?.commerical;

					const load_amount_points = parseFloat(
						mergeObject?.load_amount ? mergeObject.load_amount : data?.load_amount ? data?.load_amount : 0
					);
					const totalValuePoints =
						load_amount_points - (load_amount_points * discount_points) / 100 + service_amount_points;
					if (orderLevelDiscountPoints != discount_points && mergeObject.add_or_reduce_discount) {
						const orderLevelValue =
							load_amount_points - (load_amount_points * orderLevelDiscountPoints) / 100 + service_amount_points;
						const modify_discount_is = mergeObject.add_or_reduce_discount
							? true
							: data?.add_or_reduce_discount
							? true
							: false;

						const shakepe_points = {
							...data,
							total_value: commerical_points == constant.UPFRONT && modify_discount_is ? orderLevelValue : null,
							original_value: commerical_points == constant.UPFRONT ? totalValuePoints : null,
							cashback:
								commerical_points != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? (load_amount_points * orderLevelDiscountPoints) / 100
									: (load_amount_points * discount_points) / 100,
							total_value_cashback:
								commerical_points != constant.UPFRONT ? load_amount_points + service_amount_points : null,
							previous_cashback:
								commerical_points != constant.UPFRONT && mergeObject.add_or_reduce_discount
									? (load_amount_points * discount_points) / 100
									: null,
							total_order_value: commerical_points == constant.UPFRONT ? load_amount_points : null,

							payment: 'Payment Received',
						};
						const job_points = await addJobToClientQueue(shakepe_points?.client, {
							id: keys?.keys[0],

							collection: 'shakepe_orders',
							item: 'update',
							schema: schema,
							services: services,
							data: shakepe_points,
						});

						if (job_points?.error) {
							throw new InvalidPayloadException(job_points?.error);
						}

						return {
							...shakepe_points,
							...job_points,
						};
					} else {
						const shakepe_points = {
							...data,
							original_value: commerical_points == constant.UPFRONT ? totalValuePoints : null,
							total_value: null,
							cashback: commerical_points != constant.UPFRONT ? (load_amount_points * discount_points) / 100 : null,
							total_value_cashback:
								commerical_points != constant.UPFRONT ? load_amount_points + service_amount_points : null,
							total_order_value: commerical_points == constant.UPFRONT ? load_amount_points : null,
						};

						const job_points = await addJobToClientQueue(shakepe_points?.client, {
							collection: 'shakepe_orders',
							id: keys?.keys[0],
							item: 'update',
							schema: schema,
							services: services,
							data: shakepe_points,
						});
						if (job_points?.error) {
							throw new InvalidPayloadException(job_points?.error);
						}
						return {
							...shakepe_points,
							...job_points,
						};
					}

				default:
					break;
			}
		}

		const orders_data = await getDataFromCollection(
			services,
			{
				id: {
					_eq: keys?.keys[0],
				},
			},
			constant.FIELDSDATA.SHAKEPE_ORDERS,
			schema,
			'shakepe_orders'
		);

		if (data.status == 'Order Processed') {
			const job = await addJobToClientQueue(orders_data[0]?.client, {
				collection: 'shakepe_orders',
				item: 'update',
				schema: schema,
				services: services,
				data: {
					status: data.status,
				},
				id: keys?.keys[0],
			});
		}
	});
	filter('payment_verify.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};

		const orders = await getDataFromCollection(
			services,
			filter,
			['corporate_load.client_name'],
			schema,
			'payment_verify'
		);
		if (data?.status == 'verified') {
			const job_codes = await addJobToClientQueue(orders[0]?.corporate_load?.client_name, {
				collection: 'payment_verify',
				item: 'update',
				schema: schema,
				services: services,
				data: data,
				id: keys?.keys[0],
			});
		}
	});

	filter('corporate_load.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};
		const orders = await getDataFromCollection(services, filter, ['client_name'], schema, 'corporate_load');
		if (data.status == 'approved') {
			const job_codes = await addJobToClientQueue(orders[0]?.client_name, {
				collection: 'corporate_load',
				item: 'update',
				schema: schema,
				services: services,
				data: data,
				id: keys?.keys[0],
			});
		} else if (data.status == 'cancelled') {
			const job_codes = await addJobToClientQueue(orders[0]?.client_name, {
				collection: 'corporate_load',
				item: 'update',
				schema: schema,
				services: services,
				data: data,
				id: keys?.keys[0],
			});
		}
	});
	filter('corporate_load.items.create', async (data: any, keys: any, context: any) => {
		if (data.payment_terms == 'credit') {
			const job_codes = await addJobToClientQueue(data?.client_name, {
				collection: 'corporate_load',
				item: 'create',
				schema: schema,
				services: services,
				data: data,
			});
			return {
				...data,
				...job_codes,
			};
		} else if (data.payment_mode == 'payment_gateway') {
			const job_codes = await addJobToClientQueue(data?.client_name, {
				collection: 'corporate_load',
				item: 'create',
				schema: schema,
				services: services,
				data: data,
			});

			return {
				...data,
				...job_codes,
			};
		} else {
			return data;
		}
	});
	action('shakepe_orders.items.create', async (payload: any, meta: any, context) => {
		const data = await getDataFromCollection(
			services,
			{
				id: {
					_eq: payload.key,
				},
			},
			['transaction_create'],
			schema,
			'shakepe_orders'
		);
		if (data?.length > 0 && data[0]?.transaction_create?.length > 0) {
			data[0].transaction_create.map(async (ids: any) => {
				await updateOneNoEmit(
					{
						order_id: payload.key,
						order: payload.key,
					},
					'cpp_ledger',
					services,
					ids,
					schema,
					meta?.accountability
				);
			});
		}
	});
	action('corporate_load.items.create', async (payload: any, meta: any, context) => {
		const data = await getDataFromCollection(
			services,
			{
				id: {
					_eq: payload.key,
				},
			},
			['transaction_create'],
			schema,
			'corporate_load'
		);
		if (data?.length > 0 && data[0]?.transaction_create?.length > 0) {
			data[0].transaction_create.map(async (ids: any) => {
				await updateOneNoEmit(
					{
						load_id: payload.key,
					},
					'cpp_ledger',
					services,
					ids,
					schema,
					meta?.accountability
				);
			});
		}
	});
	filter('shakepe_orders.items.update', async (data: any, keys: any, context: any) => {
		const filter = {
			id: {
				_eq: keys?.keys[0],
			},
		};

		const orders = await getDataFromCollection(services, filter, ['client'], schema, 'shakepe_orders');
		if (data?.status == 'Order Cancelled') {
			const job_codes = await addJobToClientQueue(orders[0]?.client, {
				collection: 'shakepe_orders',
				item: 'update',
				schema: schema,
				services: services,
				data: data,
				id: keys?.keys[0],
			});
		}
	});
	filter('poc_wallet_transfer.items.create', async (payload: any) => {
		const job_codes = await addJobToClientQueue(payload?.client, {
			collection: 'poc_wallet_transfer',
			item: 'create',
			schema: schema,
			services: services,
			data: payload,
		});
		if (job_codes?.error) {
			throw new InvalidPayloadException(job_codes.error);
		}
		payload.amount_utilized = job_codes?.amount_utilized;
		payload.cpp_ledger = job_codes?.cpp_ledger;
		return payload;
	});
});

const getClientIdsForProductMapping = (payload: any, data: any) => {
	const productMappingIds = payload.map((id: any) => id?.toString());

	const clientIds = data
		.filter((item: any) =>
			item?.client_id?.product_type_mapping.every((mapping: any) => productMappingIds.includes(mapping?.id.toString()))
		)
		.map((item: any) => item?.client_id?.id);

	return clientIds;
};

const emailSendingPro = async (keys: any, services: any, schema: any, mailService: any, accountability: any) => {
	const performingInvoice = await getDataFromCollection(
		services,
		keys,
		constant.FIELDSDATA.PROFOMA_INVOICE_EMAIL,
		schema,
		'performing_invoice'
	);
	const filterManagement = {
		id: {
			_eq: env.MANAGAMENT_ROLE,
		},
	};
	const filterAccounts = {
		id: {
			_eq: env.ACCOUNT_ROLE,
		},
	};
	const filter = {
		id: {
			_eq: accountability?.user,
		},
	};
	const poc_filter = {
		id: {
			_eq: performingInvoice[0].poc,
		},
	};
	const saleAgent = await getDataFromCollection(services, filter, ['first_name'], schema, 'directus_users');
	const poc = await getDataFromCollection(services, poc_filter, ['name', 'wallet'], schema, 'client_point_of_contact');
	const idmanagement = await getDataFromCollection(
		services,
		filterManagement,
		['users.email', 'users.id'],
		schema,
		'directus_roles'
	);
	const idaccounts = await getDataFromCollection(
		services,
		filterAccounts,
		['users.email', 'users.id'],
		schema,
		'directus_roles'
	);

	const management = idmanagement[0]?.users.map((user: any) => {
		return user.email;
	});

	const managementIds = idmanagement[0]?.users.map((user: any) => {
		return user.id;
	});

	const accounts = idaccounts[0]?.users.map((user: any) => {
		return user.email;
	});

	const emailTemplate = {
		to: management,
		users: managementIds,
		cc: accounts,
		subject_data: {
			poc: poc[0],
			id: performingInvoice[0]?.id,
			sales: saleAgent[0].first_name,
			company: performingInvoice[0]?.client?.client_name,
			product_type: performingInvoice[0]?.filtering_with_product_type,
			pi_id: performingInvoice[0]?.id,
			previous_order_value: performingInvoice[0]?.original_value,
			new_order_value: performingInvoice[0]?.total_value,
			order_value: performingInvoice[0]?.total_value_cashback,
			previous_cashback: performingInvoice[0]?.previous_cashback,
			cashback: performingInvoice[0]?.cashback,
			commerical: performingInvoice[0]?.commerical,
			link: env.CURRENT_URL + 'admin/content/performing_invoice' + performingInvoice[0]?.id,
		},
		body_data: {
			poc: poc[0],
			sales: saleAgent[0].first_name,
			company: performingInvoice[0]?.client?.client_name,
			product_type: performingInvoice[0]?.filtering_with_product_type,
			pi_id: performingInvoice[0]?.id,
			previous_order_value: performingInvoice[0]?.original_value,
			new_order_value: performingInvoice[0]?.total_value,
			order_value: performingInvoice[0]?.total_value_cashback,
			previous_cashback: performingInvoice[0]?.previous_cashback,
			cashback: performingInvoice[0]?.cashback,
			commerical: performingInvoice[0]?.commerical,
			link: env.CURRENT_URL + 'admin/content/performing_invoice' + performingInvoice[0]?.id,
			previous_discount: performingInvoice[0]?.discount,
			new_discount: performingInvoice[0]?.order_level_discount,
		},
		item: performingInvoice[0]?.id,
	};
	if (performingInvoice?.length > 0 && performingInvoice[0]?.changes) {
		switch (performingInvoice[0].changes) {
			case constant.PIINCREASEDISCOUNT:
				// eslint-disable-next-line no-case-declarations
				const product = constant.PRODUCTS.find(
					(product: any) => product == performingInvoice[0]?.filtering_with_product_type
				);
				if (performingInvoice[0].commerical == constant.CASHBACK) {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.reqApprOrderInDiscount}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piDiscount}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				} else {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.reqApprOrderInDiscount}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piDiscount}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				}
				break;
			default:
				break;
		}
	}
};

const emailSendingApproved = async (
	keys: any,
	services: any,
	schema: any,
	mailService: any,
	context: any,
	payload: any,
	data: any
) => {
	const filter = {
		id: {
			_eq: context?.accountability?.user,
		},
	};

	const filterPI = {
		id: {
			_eq: keys?.keys[0],
		},
	};
	const performingInvoice = await getDataFromCollection(
		services,
		filterPI,
		constant.FIELDSDATA.PROFOMA_INVOICE_EMAIL,
		schema,
		'performing_invoice'
	);

	const approver = await getDataFromCollection(services, filter, ['first_name'], schema, 'directus_users');

	const emailTemplate = {
		to: [performingInvoice[0]?.user_created?.email],
		users: [performingInvoice[0]?.user_created?.id],
		subject_data: {
			id: performingInvoice[0]?.id,
			approver: approver[0].first_name,
			company: performingInvoice[0]?.client?.client_name,
			product_type: performingInvoice[0]?.filtering_with_product_type,
			pi_id: performingInvoice[0]?.id,
			previous_order_value: performingInvoice[0]?.original_value,
			new_order_value: performingInvoice[0]?.total_value,
			order_value: performingInvoice[0]?.total_value_cashback,
			previous_cashback: performingInvoice[0]?.previous_cashback,
			cashback: performingInvoice[0]?.cashback,
			commerical: performingInvoice[0]?.commerical,
			link: env.CURRENT_URL + 'admin/content/performing_invoice' + performingInvoice[0]?.id,
			comment: payload?.comment ? payload?.comment : data?.comment,
		},
		body_data: {
			approver: approver[0].first_name,
			company: performingInvoice[0]?.client?.client_name,
			product_type: performingInvoice[0]?.filtering_with_product_type,
			pi_id: performingInvoice[0]?.id,
			previous_order_value: performingInvoice[0]?.original_value,
			new_order_value: performingInvoice[0]?.total_value,
			order_value: performingInvoice[0]?.total_value_cashback,
			previous_cashback: performingInvoice[0]?.previous_cashback,
			cashback: performingInvoice[0]?.cashback,
			commerical: performingInvoice[0]?.commerical,
			link: env.CURRENT_URL + 'admin/content/performing_invoice' + performingInvoice[0]?.id,
			comment: payload?.comment ? payload?.comment : data?.comment,
		},
		item: performingInvoice[0]?.id,
	};

	if (payload?.approval_status == constant.APPROVED) {
		switch (performingInvoice[0]?.changes) {
			case constant.PIINCREASEDISCOUNT:
				const product = constant.PRODUCTS.find(
					(product: any) => product == performingInvoice[0]?.filtering_with_product_type
				);
				if (performingInvoice[0].commerical == constant.CASHBACK) {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.appPiReq}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piAppr}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				} else {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.appPiReq}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piAppr}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				}
				break;
		}
	} else if (payload?.approval_status == constant.DECLINED) {
		switch (performingInvoice[0]?.changes) {
			case constant.PIINCREASEDISCOUNT:
				const product = constant.PRODUCTS.find(
					(product: any) => product == performingInvoice[0]?.filtering_with_product_type
				);

				if (performingInvoice[0].commerical == constant.CASHBACK) {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.decPiReq}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piDec}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				} else {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/${emailEndpointIds.decPiReq}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
					const notiData = {
						subject_data: {
							approver: approver[0].first_name,
							company: performingInvoice[0]?.client?.client_name,
							product_type: performingInvoice[0]?.filtering_with_product_type,
							pi_id: performingInvoice[0]?.id,
							previous_order_value: performingInvoice[0]?.original_value,
							new_order_value: performingInvoice[0]?.total_value,
							order_value: performingInvoice[0]?.total_value_cashback,
							previous_cashback: performingInvoice[0]?.previous_cashback,
							cashback: performingInvoice[0]?.cashback,
							commerical: performingInvoice[0]?.commerical,
							link: env.CURRENT_URL + 'admin/content/performing_invoice' + performingInvoice[0]?.id,
							comment: payload?.comment ? payload?.comment : data?.comment,
						},

						item: performingInvoice[0]?.id,
					};

					axios
						.post(`${env.CURRENT_URL}email/notifications/${notificationId.piDec}`, emailTemplate)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				}
				break;
			default:
				break;
		}
	}
};

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

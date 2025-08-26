import { symlink } from "fs";
import { CONFIG } from "../config";
import LogSys from "../helpers/logger";
import axios from 'axios';

/**
 * Getters Class
 * */
export default class Getters {
	ItemsService;

	brandDetails = null;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	getBrandFromSKU = async (sku, amt, cur) => {
		try {
			const brandDetailsService = new this.ItemsService(CONFIG.collection.BRAND_DETAILS, this.accountabilitySchema);
			const brandDetailsResponse = await brandDetailsService.readByQuery({
				fields: ["*.*"],
				filter: {
					"_and": [
						{
							"status": {
								"_eq": "active"
							}
						},
						{
							"sku": {
								"sku": {
									"_eq": sku
								}
							}
						},
						{
							"sku": {
								"amount": {
									"_eq": amt
								}
							}
						},
						{
							"sku": {
								"currency": {
									"_eq": cur
								}
							}
						}
					]
				}
			});

			return brandDetailsResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getBrandFromSKU Error"
			}, null, null);
		}

	}

	checkBrandStatus = async (sku, amt, cur, reference_id, vendor_code) => {
		try {
			const brandDetails = await this.getBrandFromSKU(sku, amt, cur);
			this.brandDetails = brandDetails;
			return !!brandDetails;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "checkBrandStatus Error"
			},
				reference_id,
				vendor_code);
		}
	}

	checkSkuAmountMapping = async (reqSKU, reqAmt) => {
		try {
			const skuArray = this.brandDetails.sku;
			for (let i = 0; i < skuArray.length; i++) {
				const { sku, amount } = skuArray[i];
				if (reqSKU == sku && reqAmt == amount) {
					return true;
				}
			}
			return false;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "checkSkuAmountMapping Error"
			}, null, null);
		}
	}

	bestVendor = async (sku, amount, cur, reference_id, vendor_code) => {
		try {
			const brandVendorMappingService = new this.ItemsService(CONFIG.collection.BRAND_VENDOR_MAPPING, this.accountabilitySchema);
			const brandVendorMappingResponse = await brandVendorMappingService.readByQuery({
				fields: ["*", "choose_a_brand.*", "choose_a_vendor.*", "choose_a_brand.sku.*"],
				sort: ["-discount_percentage", "processing_fee"],
				filter: {
					"_and": [
						{
							"choose_a_brand": {
								"sku": {
									"sku": {
										"_eq": sku
									}
								}
							}
						},
						{
							"choose_a_vendor": {
								"vendor_sku": {
									"sd_brand_sku": {
										"sku": {
											"_eq": sku
										}
									}
								}
							}
						},
						{
							"choose_a_brand": {
								"sku": {
									"amount": {
										"_eq": amount
									}
								}
							}
						},
						{
							"choose_a_brand": {
								"status": {
									"_eq": "active"
								}
							}
						},
						{
							"choose_a_vendor": {
								"vendor_status": {
									"_eq": "active"
								}
							}
						},
						{
							"choose_a_vendor": {
								"is_api_integrated": {
									"_eq": true
								}
							}
						},
						/* if (denomination is fixed, then fixed should be eq to the amount)
						*  or if (denomination is range, then from <= amount and to>=amount)
						*  */
						{
							"_or": [
								{
									"_and": [
										{
											"denomination": {
												"_eq": "fixed"
											}
										},
										{
											"fixed": {
												"_eq": amount
											}
										}
									]
								},
								{
									"_and": [
										{
											"denomination": {
												"_eq": "range"
											}
										}, {
											"from": {
												"_lte": amount
											}
										}, {
											"to": {
												"_gte": amount
											}
										}
									]
								}
							]
						},
						/* Checking for mappings with matching currency */
						{
							currency: {
								_eq: cur
							}
						}
					]
				}
			});

			let selectedVendor = null;

			/* First: Loop and Check for Commercial Type = upfront_discount  */
			for (let i = 0; i < brandVendorMappingResponse.length; i++) {
				const bvMapping = brandVendorMappingResponse[i];
				const { commercial_type } = bvMapping;
				if (commercial_type == "upfront_discount") {
					selectedVendor = bvMapping;
					i = brandVendorMappingResponse.length;
				}
			}

			/* Second: Loop and Check for Commercial Type = cashback  */
			if (!selectedVendor) for (let i = 0; i < brandVendorMappingResponse.length; i++) {
				const bvMapping = brandVendorMappingResponse[i];
				const { commercial_type } = bvMapping;
				if (commercial_type == "cashback") {
					selectedVendor = bvMapping;
					i = brandVendorMappingResponse.length;
				}

			}

			/* Third: Loop and Check for Commercial Type = processing_fee  */
			if (!selectedVendor) {
				for (let i = 0; i < brandVendorMappingResponse.length; i++) {
					const bvMapping = brandVendorMappingResponse[i];
					const { commercial_type, processing_fee } = bvMapping;
					if (commercial_type == "processing_fee") {
						if (!selectedVendor) selectedVendor = bvMapping;
						if (selectedVendor && processing_fee * 1 < selectedVendor.processing_fee * 1) {
							selectedVendor = bvMapping;
						}
					}
				}
			}

			return selectedVendor;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "bestVendor Error"
			},
				reference_id,
				vendor_code);
		}
	}

	mappedVendorSKU = async (sku) => {
		try {
			const vendorSkuMappingService = new this.ItemsService(CONFIG.collection.VENDOR_SKU_MAPPING, this.accountabilitySchema);
			const vendorSkuMappingResponse = await vendorSkuMappingService.readByQuery({
				fields: ["*.*"],
				limit: 1,
				filter: {
					"sd_brand_sku": {
						"sku": {
							"_eq": sku
						}
					}
				}
			});

			return vendorSkuMappingResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "mappedVendorSKU Error"
			}, null, null);
		}
	}

	checkBrandVendorMapping = async (sku, amount, cur, vendorIntId, reference_id: any, vendor_code: any) => {
		try {
			const brandVendorMappingService = new this.ItemsService(CONFIG.collection.BRAND_VENDOR_MAPPING, this.accountabilitySchema);
			const brandVendorMappingResponse = await brandVendorMappingService.readByQuery({
				fields: ["*", "choose_a_brand.*", "choose_a_vendor.*", "choose_a_brand.sku.*"],
				sort: ["-discount_percentage", "processing_fee"],
				filter: {
					"_and": [
						{
							"choose_a_brand": {
								"sku": {
									"sku": {
										"_eq": sku
									}
								}
							}
						},
						{
							"choose_a_brand": {
								"sku": {
									"amount": {
										"_eq": amount
									}
								}
							}
						},
						{
							"choose_a_brand": {
								"status": {
									"_eq": "active"
								}
							}
						},
						{
							"choose_a_vendor": {
								"vendor_status": {
									"_eq": "active"
								}
							}
						},
						{
							"choose_a_vendor": {
								"api_integration_id": {
									"_eq": vendorIntId
								}
							}
						},
						/* if (denomination is fixed, then fixed should be eq to the amount)
						*  or if (denomination is range, then from <= amount and to>=amount)
						*  */
						{
							"_or": [
								{
									"_and": [
										{
											"denomination": {
												"_eq": "fixed"
											}
										},
										{
											"fixed": {
												"_eq": amount
											}
										}
									]
								},
								{
									"_and": [
										{
											"denomination": {
												"_eq": "range"
											}
										}, {
											"from": {
												"_lte": amount
											}
										}, {
											"to": {
												"_gte": amount
											}
										}
									]
								}
							]
						},
						/* Checking for mappings with matching currency */
						{
							currency: {
								_eq: cur
							}
						}
					]
				}
			});

			let selectedVendor = null;

			/* First: Loop and Check for Commercial Type = upfront_discount  */
			for (let i = 0; i < brandVendorMappingResponse.length; i++) {
				const bvMapping = brandVendorMappingResponse[i];
				const { commercial_type } = bvMapping;
				if (commercial_type == "upfront_discount") {
					selectedVendor = bvMapping;
					i = brandVendorMappingResponse.length;
				}
			}

			/* Second: Loop and Check for Commercial Type = cashback  */
			if (!selectedVendor) for (let i = 0; i < brandVendorMappingResponse.length; i++) {
				const bvMapping = brandVendorMappingResponse[i];
				const { commercial_type } = bvMapping;
				if (commercial_type == "cashback") {
					selectedVendor = bvMapping;
					i = brandVendorMappingResponse.length;
				}

			}

			/* Third: Loop and Check for Commercial Type = processing_fee  */
			if (!selectedVendor) {
				for (let i = 0; i < brandVendorMappingResponse.length; i++) {
					const bvMapping = brandVendorMappingResponse[i];
					const { commercial_type, processing_fee } = bvMapping;
					if (commercial_type == "processing_fee") {
						if (!selectedVendor) selectedVendor = bvMapping;
						if (selectedVendor && processing_fee * 1 < selectedVendor.processing_fee * 1) {
							selectedVendor = bvMapping;
						}
					}
				}
			}

			return selectedVendor;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "bestVendor Error"
			}, reference_id, vendor_code);
		}
	}

	mappedVendorActiveBrandSKU = async (sku: any, vendor_code: any, reference_id: any) => {
		try {
			const vendorSkuMappingService = new this.ItemsService(CONFIG.collection.VENDOR_SKU_MAPPING, this.accountabilitySchema);
			const vendorSkuMappingResponse = await vendorSkuMappingService.readByQuery({
				fields: ["*.*"],
				limit: 1,
				filter: {
					"_and": [
						{
							"sd_brand_sku": {
								"sku": {
									"_eq": sku
								}
							}
						},
						{
							"sd_brand_sku": {
								"brand": {
									"status": {
										"_eq": "active"
									}
								}
							}
						},
						{
							"vendor_name": {
								"api_integration_id": {
									"_eq": vendor_code
								}
							}
						}

					]
				}
			});
			return vendorSkuMappingResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "mappedVendorSKU Error",
			},
				reference_id,
				vendor_code);
		}
	}

	async voucherKeysFromInventory(vouchersToSave: any[]) {
		try {
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const response = await giftInventoryService.readByQuery({
				fields: ["id"],
				filter: {
					"code": {
						"_in": vouchersToSave
					}
				}
			});
			return response ? response.map(obj => { return obj.id }) : null;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "voucherKeysFromInventory Error"
			}, null, null);
			return null;
		}
	}

	async getBrandSkuMapping(sku: any, reference_id: any, vendor_code: any) {
		try {
			const getBrandSkuMappingService = new this.ItemsService(CONFIG.collection.BRAND_SKU_MAPPING, this.accountabilitySchema);
			const response = await getBrandSkuMappingService.readByQuery({
				fields: ["*", "brand.*"],
				filter: {
					"sku": {
						"_eq": sku
					}
				}
			});

			return response[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getBrandSkuMapping Error"
			}, reference_id, vendor_code);
			return null;
		}
	}

	async getVendorFromVendorCode(api_integration_id: any, reference_id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorDetailsService = new this.ItemsService(CONFIG.collection.VENDOR_DETAILS, accountability);
			const response = await vendorDetailsService.readByQuery({
				fields: ["*"],
				filter: {
					"api_integration_id": {
						"_eq": api_integration_id
					}
				}
			});

			return response[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getVendorFromVendorCode Error",
			},
				reference_id,
				api_integration_id
			);
			return null;
		}
	}

	async getVendorOrderFromRef(reference_id: any, vendor_id: any, vendor_code: any) {
		try {
			const vendorOrdersService = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrdersService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"reference_id": {
								"_eq": reference_id
							}
						},
						{
							"vendor": {
								"_eq": vendor_id
							}
						},
					]
				}
			});
			return response[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getVendorOrderFromRef Error",
			},
				reference_id,
				vendor_code);
			return null;
		}
	}
	async getVendorTrasanctionDetails(transactionId: any) {
		try {
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const response = await giftInventoryService.readByQuery({
				filter: { vendor_order_id: { _eq: transactionId } },
				fields: ['*'],
				limit: -1,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "get Trasanction Details Error"
			}, null, null);
			return null;
		}
	}

	async getVendorOrderByReferenceId(reference_id: any, vendor_code: any) {
		try {
			const vendorOrdersService = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrdersService.readByQuery({
				fields: ["*", "vendor.*"],
				filter: {
					"reference_id": {
						"_eq": reference_id
					}
				}


			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getVendorOrderByReferenceId Error",
			},
				reference_id,
				vendor_code);
			return null;
		}
	}

	async getLinkVoucherDetails(sku: any, amount: any) {
		try {

			await new LogSys().log('get Link VoucherDetails:', false, null, null);
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"link_reference_id": {
								"_neq": null
							}
						},
						{
							"price": {
								"_eq": amount
							}
						},
						{
							"product_code": {
								"_eq": sku
							}
						},
						{
							"gift_card": {
								"_eq": false
							}
						},
					]
				},
				limit: 1

			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "get Link Voucher Details Query Error"
			}, null, null);
			return null;
		}
	}



	async getLinkVoucherDetailsbyorderid(soft_link_order_id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			await new LogSys().log(`get Link order Details:OrderId:${soft_link_order_id}`, false, null, null);

			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"order_id": {
						"_eq": soft_link_order_id
					}
				}
			});

			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "get Link Voucher Details by orderid query Error"
			}, null, null);
			return null;
		}
	}


	async inventoryOtpVerification(link_reference_id: any, reference_code_otp: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"link_reference_id": {
								"_eq": link_reference_id
							}
						},
						{
							"reference_code_otp": {
								"_eq": reference_code_otp
							}
						}
					]
				}

			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "inventory Otp Verification Error"
			}, null, null);

			return null;
		}
	}

	async getInventoryByreferance(link_reference_id: any, reference_code_otp: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"link_reference_id": {
								"_eq": link_reference_id
							}
						}
					]
				}

			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "inventory Otp Verification Error"
			}, null, null);

			return null;
		}
	}
	async getInventoryByorderid(order_id: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}

			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"order_id": {
								"_eq": order_id
							}
						}
					]
				}

			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "inventory Otp Verification Error"
			}, null, null);

			return null;
		}
	}

	async getInventoryByid(id: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"id": {
								"_eq": id
							}
						}
					]
				}

			});
			await new LogSys().log('getInventoryByid:', false, null, null);

			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "inventory Otp Verification Error"
			}, null, null);

			return null;
		}
	}
	async getBrandSkuMappingbySku(sku: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const getBrandSkuMappingService = new this.ItemsService(CONFIG.collection.BRAND_SKU_MAPPING, accountability);
			const response = await getBrandSkuMappingService.readByQuery({
				fields: ["*", "brand.*"],
				filter: {
					"sku": {
						"_eq": sku
					}
				}
			});
			return response[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getBrandSkuMapping Error"
			}, null, null);
			return null;
		}
	}

	async getVoucherFromInventory(link_reference_id: any) {
		try {
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const response = await giftInventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"link_reference_id": {
						"_eq": link_reference_id
					}
				}
			});
			return response
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "voucherKeysFromInventory Error"
			}, null, null);
			return null;
		}
	}
	async getVoucherFromInventorybykeys(keys: any) {
		try {
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const response = await giftInventoryService.readByQuery({
				fields: ["id", "link_reference_id", "reference_code_otp"],
				filter: {
					"link_reference_id": {
						"_in": keys
					}
				}
			});
			return response
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "voucherKeysFromInventory Error"
			}, null, null);
			return null;
		}
	}

	async getVoucherBySoftLinkId(id: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const inventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await inventoryService.readByQuery({
				fields: ["*"],
				filter: {
					"_and": [
						{
							"order_id": {
								"_eq": id
							}
						}

					]
				}

			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "get VoucherBy Soft LinkId"
			}, null, null);

			return null;
		}
	}

	//this code is only for soft link (sp_reward_redemptions) update actual redemption id
	async getCampaignRedemptions(link_reference_id: any, env: any) {
		try {
			let res = await axios.post(
				`${env.CAMPAIGN_BASE_URL}reward-links/webhook/getoneredeem`, {
				link_reference_id: link_reference_id,
			}, {
				headers: {
					Authorization: env.CAMPAIGN_AUTH
				}
			}
			);

			await new LogSys().log(`getCampaignRedemptions link_reference_id:${link_reference_id}`, false, null, null);

			return res;
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e }, null, null);
		}
	}


	async inventoryRedeemList(start_date: any, end_date: any, limit: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await giftInventoryService.readByQuery({
				fields: ['*'],
				filter: {
					_and: [
						{
							order_id: {
								_nnull: true,
							},
						},
						{
							gift_card: {
								_eq: true,
							},
						},
						{
							validity: {
								_between: [start_date, end_date],
							},
						},
						{
							bulk_qty_status: {
								_eq: true,
							},
						},
						{
							card_balance_status: {
								_eq: false,
							},
						}

					],
				},
				limit: limit,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'inventoryRedeemList Error',
				},
				null,
				null
			);
			return null;
		}
	}


	async inventoryRedeemListRevlidate(start_date: any, end_date: any) {
		try {
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const voucherCodeResponse = await giftInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							created_on: {
								_gte: start_date,
							},
						},
						{
							created_on: {
								_lte: end_date,
							},
						},
						{
							gift_card: {
								_eq: true,
							},
						},
					],
				},
			});
			return voucherCodeResponse;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'inventoryRedeemListRevlidate Error',
			}, null, null);
		}
	}



	async getLinkDetailsFromId(linkId: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};

			const linkDetailsService = new this.ItemsService(
				CONFIG.collection.REWARD_LINKS_TABLE,
				accountability
			);
			const linkDetails = await linkDetailsService.readByQuery({
				fields: [
					'*.*',
					'reward_campaign.*',
					'reward_campaign.catalog_sort',
					'reward_campaign.brands.*',
					'reward_campaign.brands.brand_id.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_name',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_image',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.darkmode_card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_purchase_url',
					'redemptions_list.brand_sku.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.logo_bg_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.terms_and_condition',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.dark_logo_bg_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.redemption_process',
					'reward_campaign.company_logo',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.*',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.*',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.is_active_brand',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.is_active_brand',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.status',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.status',
					'reward_campaign.brand_limitation.*',
					'reward_campaign.brand_limitation.brand.*',
					'reward_campaign.base_region.id',
					'reward_campaign.base_region.name',
					'reward_campaign.base_region.currency',
					'reward_campaign.base_region.code',
					'reward_campaign.regions.country_id.id',
					'reward_campaign.regions.country_id.name',
					'reward_campaign.regions.country_id.code',
				],
				filter: {
					_and: [
						{
							id: {
								_eq: linkId,
							},
						},
						{
							reward_campaign: {
								campaign_type: {
									_neq: 'pdf',
								},
							},
						},
					],
				},
			});

			return linkDetails;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getLinkDetailsFromId Error',
			}, null, null);

			return null;
		}
	}

	async getSkuBrandMapping(sku: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const voucherSkuDetailsService = new this.ItemsService(
				CONFIG.collection.SKU_BRAND_MAPPING,
				accountability
			);
			const voucherSkuDetailsResponse = await voucherSkuDetailsService.readByQuery({
				fields: [
					'*',
					'brand.brand_image',
					'brand.brand_name',
					'brand.card_color',
					'brand.darkmode_card_color',
					'brand.brand_purchase_url',
					'brand.logo_bg_color',
					'brand.terms_and_condition',
					'brand.dark_logo_bg_color',
					'brand.redemption_process',
					'brand.statuus',
					'brand.region.name',
					'brand.region.code',
					'brand.region.currency',
					'brand.region.id'
				],
				filter: { _and: [{ sku: { _eq: sku } }] },
			});

			return voucherSkuDetailsResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getSkuBrandMapping Error',
			}, null, null);

			return null;
		}
	}

	async voucherDetails(sku: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};

			const voucherSkuDetailsService = new this.ItemsService(
				CONFIG.collection.SKU_BRAND_MAPPING,
				accountability
			);
			const voucherSkuDetailsResponse = await voucherSkuDetailsService.readByQuery({
				fields: [
					'*',
					'brand.brand_image',
					'brand.brand_name',
					'brand.card_color',
					'brand.darkmode_card_color',
					'brand.brand_purchase_url',
					'brand.logo_bg_color',
					'brand.terms_and_condition',
					'brand.dark_logo_bg_color',
					'brand.redemption_process',
					'brand.status',
					'brand.region.id',
					'brand.region.name',
					'brand.region.code',
					'brand.region.currency'
				],
				filter: { _and: [{ sku: { _eq: sku } }] },
			});

			return voucherSkuDetailsResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'voucherDetails Error',
			}, null, null);
			return null;

		}
	}

	async voucherCode(sku: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const validityDate = new Date().toISOString();

			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							product_code: {
								_eq: sku,
							},
						},
						{
							gift_card: {
								_eq: false,
							},
						},
						{
							validity: {
								_gte: validityDate,
							},
						},

					],
				},
				sort: ['date_created'],
				limit: 1,
			});

			if (Array.isArray(voucherCodeResponse) && voucherCodeResponse.length !== 0) {
				return voucherCodeResponse[0];
			} else {

				return null;
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'voucherCode Error',
			}, null, null);

			return null;

		}
	}

	async checkRandomChars(randomChars: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				CONFIG.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ link_reference_id: { _eq: randomChars } }] },
			});

			return redemptionResponse;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: 'redemptionsFromIdsError Error',
			}, null, null);

			return null

		}
	}

	voucherCodeList = async (sku: any) => {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};

			const validityDate = new Date().toISOString();

			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: ["*"],
				filter: {
					_and: [
						{
							product_code: {
								_eq: sku,
							},
						},
						{
							gift_card: {
								_eq: false,
							},
						},
						{
							validity: {
								_gte: validityDate,
							},
						},
					],
				},
			});

			return voucherCodeResponse;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "voucherCodeResponse Error"
			}, null, null);

			return null
		}

	}

	async voucherCodeFromVpp(
		sku: any,
		amt: any,
		orderId: any,
		referenceId: any,
		campaignName: any,
		randomChars: any,
		reference_code_otp: any,
		giftcard_status: any,
		soft_link_order_id: any
	) {
		try {
			const voucherCodeFromVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/get-vouchers`,
				{
					required_vouchers: [
						{
							sku: sku,
							qty: 1,
							amt: amt,
						},
					],
					options: {
						redeemed: giftcard_status,
						retrieveIfRedeemed: true,
						syncOnly: true /* Sync Only will be useful for QC Amazon */,
						reference_id: referenceId,
						order_id: orderId,
						extra: {
							client: campaignName,
						},
						link_reference_id: randomChars,
						reference_code_otp: reference_code_otp,
						soft_link_order_id: soft_link_order_id,
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "voucherCodeFromVppError Error"
			}, null, null);

			return null
		}
	}

	async placeNewOrderVpp(
		referenceId: any,
		orderId: any,
		campaignName: any,
		vendor_code: any,
		brandSku: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_order_id: any
	) {
		try {
			let redeemed = true;
			if (link_reference_id) {
				orderId = '';
				redeemed = false;
				link_reference_id = '';
			}
			const placeNewOrderVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/place-new-order`,
				{
					vendor_code: vendor_code,
					reference_id: referenceId,
					brand_sku: brandSku,
					quantity: 1,
					options: {
						redeemed: redeemed,
						retrieveIfRedeemed: true,
						syncOnly: true /* Sync Only will be useful for QC Amazon */,
						order_id: orderId,
						reference_id: referenceId,
						extra: {
							client: campaignName,
						},
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
						soft_link_order_id: soft_link_order_id,
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "placeNewOrderVppError Error"
			}, null, null);

			return null
		}
	}

	async generateMultipleVoucherCodeFromVpp(
		sku: string,
		amt: any,
		orderId: any,
		referenceId: any,
		campaignName: any,
		qty: any
	) {
		try {
			const voucherCodeFromVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/get-vouchers`,
				{
					required_vouchers: [
						{
							sku: sku,
							qty: qty,
							amt: amt,
						},
					],
					options: {
						redeemed: false,
						retrieveIfRedeemed: true,
						syncOnly: true /* Sync Only will be useful for QC Amazon */,
						reference_id: referenceId,
						order_id: orderId,
						extra: {
							client: campaignName,
						},
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data[0];
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "voucherCodeFromVppError Error"
			}, null, null);

			return null;
		}
	}

	async placeMultipleVoucherNewOrderVpp(
		sku: string,
		orderId: any,
		referenceId: any,
		campaignName: any,
		qty: any,
		vendor_code: string
	) {
		try {
			const placeNewOrderVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/place-new-order`,
				{
					vendor_code: vendor_code,
					reference_id: referenceId,
					brand_sku: sku,
					quantity: qty,
					options: {
						redeemed: false,
						retrieveIfRedeemed: true,
						syncOnly: true /* Sync Only will be useful for QC Amazon */,
						order_id: orderId,
						reference_id: referenceId,
						extra: {
							client: campaignName,
						},
						link_reference_id: '',
						reference_code_otp: '',
						soft_link_order_id: '',
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "placeNewOrderVppError Error"
			}, null, null);

			return null
		}
	}

	async getUserBrandWiseRedemptions(campaign: any, email: any, phone: any, brandName: any) {
		const logSys = new LogSys();
		try {
			if (!email) {
				email = null
			}

			if (!phone) {
				phone = null
			}

			const userBrandWiseRedemptionsService = new this.ItemsService(
				CONFIG.collection.USER_BRAND_WISE_REDEMPTIONS,
				this.accountabilitySchema
			);
			const getBrandLimitationDetailsResponse = await userBrandWiseRedemptionsService.readByQuery({
				filter: {
					_and: [
						{ campaign: { _eq: campaign } },
						{ brand_name: { _eq: brandName } },
						{
							_or: [
								{ phone: { _eq: phone } },
								{ email: { _eq: email } },
							],
						},
					],
				},
				limit: 1
			});

			return getBrandLimitationDetailsResponse;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getBrandLimitationDetailsResponse Error"
			}, null, null)
			return null;

		}
	}

	async softLinkOtpVerification(link_reference_id: any, reference_code_otp: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const inventoryService = new this.ItemsService(CONFIG.collection.LINK_REWARD_REDEMPTIONS_TABLE, accountability);
			const response = await inventoryService.readByQuery({
				fields: [
					'*',
					'brand_sku.*',
					'brand_sku.brand.terms_and_condition',
					'brand_sku.brand.redemption_process',
					'brand_sku.brand.brand_image',
					'brand_sku.brand.brand_name',
				],
				filter: {
					_and: [
						{
							link_reference_id: {
								_eq: link_reference_id,
							},
						},
						{
							reference_code_otp: {
								_eq: reference_code_otp,
							},
						},
					],
				},
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "softlinkotpverification Error"
			}, null, null);
			return null;
		}
	}

	async getZeusVoucherCode(id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							id: {
								_eq: id,
							},
							gift_card: {
								_eq: true,
							}


						},
					],
				}
			});
			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse[0]

			} else {
				return false
			}

		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getZeusVoucherCode Error"
			}, null, null);

			return null;
		}
	}

	async getLinkLedger(link_reference_id: any, reference_code_otp: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const linksLedgerService = new this.ItemsService(CONFIG.collection.LINK_LEDGER, accountability);
			const linksLedgerResponse = await linksLedgerService.readByQuery({
				fields: [
					'*',
					'reward_link.id',
					'reward_link.reward_campaign.name',
					'reward_link.reward_campaign.voucher_vendor',
				],
				filter: {
					_and: [
						{
							link_reference_id: {
								_eq: link_reference_id,
							},
						},
						{
							reference_code_otp: {
								_eq: reference_code_otp,
							},
						},
					],
				},
			});
			return linksLedgerResponse;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getLinkLedger Error"
			}, null, null);

			return null;
		}
	}


	async getLinkredemptionsFromLedgerId(link_ledger: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const redemptionDetailsService = new this.ItemsService(
				CONFIG.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				accountability
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ link_ledger: { _eq: link_ledger } }] },
			});
			return redemptionDetailsResponse.length !== 0 ? redemptionDetailsResponse[0] : undefined;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "redemptionsFromIdsError Error"
			}, null, null);
			return null;
		}
	}


	async getZeusVoucherCodeByLedgerReferenceId(id: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							order_id: {
								_eq: id,
							}
						},
					],
				}
			});

			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse[0]

			} else {
				return false
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getZeusVoucherCodeByLedgerReferenceId Error"
			}, null, null);

			return null;
		}
	}

	async getLinkredemptionsFromId(id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const redemptionDetailsService = new this.ItemsService(
				CONFIG.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				accountability
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ redemption_id: { _eq: id } }] },
			});

			return redemptionDetailsResponse[0];
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getLinkredemptionsFromId Error"
			}, null, null);

			return null;
		}
	}

	async getVoucherCodeById(id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							id: {
								_eq: id,
							}


						},
					],
				}
			});


			return voucherCodeResponse;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "getVoucherCodeById Error"
			}, null, null);

			return null;
		}
	}

	async placeNewVoucheForSoftLik(
		referenceId: any,
		orderId: any,
		campaignName: any,
		vendor_code: any,
		brandSku: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_order_id: any
	) {
		try {
			let redeemed = false;

			const placeNewOrderVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/place-new-order`,
				{
					vendor_code: vendor_code,
					reference_id: referenceId,
					brand_sku: brandSku,
					quantity: 1,
					options: {
						redeemed: redeemed,
						retrieveIfRedeemed: true,
						syncOnly: true /* Sync Only will be useful for QC Amazon */,
						order_id: orderId,
						reference_id: referenceId,
						extra: {
							client: campaignName,
						},
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
						soft_link_order_id: soft_link_order_id,
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "placeNewVoucheForSoftLik Error"
			}, null, null);
			return null;

		}
	}

	async getAllFailedLinkLedger() {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const linksLedgerService = new this.ItemsService(CONFIG.collection.LINK_LEDGER, accountability);
			const linksLedgerResponse = await linksLedgerService.readByQuery({
				fields: [
					'*',
					'reward_link.reward_campaign',
					'reward_link.id',
					'reward_link.reward_campaign.name',
					'reward_link.reward_campaign.delivery_mode',
				],
				filter: {
					_and: [
						{
							order_status: {
								_eq: 'failed',
							},
							attempts: {
								_lt: CONFIG.defaults.max_retry_attempts,
							},
						},
					],
				},
			});

			return linksLedgerResponse;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "getAllFailedLinkLedger Error"
			}, null, null);
			return null;
		}
	}

	async getFailedLinkLedgerForLink(linkId: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const linksLedgerService = new this.ItemsService(CONFIG.collection.LINK_LEDGER, accountability);
			const linksLedgerResponse = await linksLedgerService.readByQuery({
				fields: [
					'*',
					'reward_link.reward_campaign',
					'reward_link.id',
					'reward_link.reward_campaign.name',
					'reward_link.reward_campaign.delivery_mode',
				],
				filter: {
					_and: [
						{
							order_status: {
								_eq: 'failed',
							},
							reward_link: {
								_eq: linkId,
							},
						},
					],
				},
			});

			return linksLedgerResponse;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "getFailedLinkLedgerForLink Error"
			}, null, null);
			return null;
		}
	}

	async orderHistoryfromVpp(
		referenceId: any,
		orderId: any,
		campaignName: any,
		vendor_code: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_order_id: any,
		voucherSku: any
	) {
		try {
			let redeemed = true;
			if (link_reference_id) {
				redeemed = false;
				orderId = '';
			}

			const orderHistoryfromVppResponse = await axios.post(
				`${CONFIG.zeus.base_url}/vpp/get-old-vouchers`,
				{
					vendor_code: vendor_code,
					reference_id: referenceId,
					options: {
						store_to_inventory: true,
						redeemed: redeemed,
						reference_id: referenceId,
						order_id: orderId,
						extra: {
							client: campaignName,
						},
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
						soft_link_order_id: soft_link_order_id,
						voucherSku: voucherSku,
					},
				},
				{
					headers: {
						Authorization: CONFIG.zeus.auth,
					},
				}
			);

			return orderHistoryfromVppResponse.data;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "orderHistoryfromVpp Error"
			}, null, null);
			return null;
		}
	}

	async voucherCodeByOrerId(sku: any, order_id: any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const validityDate = new Date().toISOString()

			const giftcardInventoryService = new this.ItemsService(CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY, accountability);
			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							gift_card: {
								_eq: false,
							},
							product_code: {
								_eq: sku,
							},
							order_id: {
								_eq: order_id,
							},
							link_reference_id: {
								_empty: true,
							},
							soft_link_order_id: {
								_empty: true,
							},
							validity: {
								_gt: validityDate
							}

						},
					],
				},
				limit: 1
			});
			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse[0];
			} else {
				return false
			}

		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "voucherCodeByOrerId Error"
			}, null, null);
			return false;
		}
	}
	async getConversionRate(symbol: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const conversionService = new this.ItemsService(CONFIG.collection.CONVERSION_RATES, accountability);
			const conversionResponse = await conversionService.readByQuery({
				fields: [
					"rate"
				],
				filter: {
					unique_symbol: {
						_eq: symbol
					}
				}
			});
			console.log(conversionResponse, 'conversionResponse')
			return conversionResponse;
		} catch (e) {
			console.log(e, symbol)
			await new LogSys().error({ getConversionRate: e });
		}

	}
}

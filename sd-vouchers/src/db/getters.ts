import { symlink } from "fs";
import config from "../config.json";
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
			const brandDetailsService = new this.ItemsService(config.collection.BRAND_DETAILS, this.accountabilitySchema);
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
			},null,null);
		}

	}

	checkBrandStatus = async (sku, amt, cur,reference_id,vendor_code) => {
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
			},null,null);
		}
	}

	bestVendor = async (sku, amount, cur,reference_id,vendor_code) => {
		try {
			const brandVendorMappingService = new this.ItemsService(config.collection.BRAND_VENDOR_MAPPING, this.accountabilitySchema);
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
			const vendorSkuMappingService = new this.ItemsService(config.collection.VENDOR_SKU_MAPPING, this.accountabilitySchema);
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
			},null,null);
		}
	}

	checkBrandVendorMapping = async (sku, amount, cur, vendorIntId,reference_id:any,vendor_code:any) => {
		try {
			const brandVendorMappingService = new this.ItemsService(config.collection.BRAND_VENDOR_MAPPING, this.accountabilitySchema);
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
			},reference_id,vendor_code);
		}
	}

	mappedVendorActiveBrandSKU = async (sku: any, vendor_code: any, reference_id:any) => {
		try {
			const vendorSkuMappingService = new this.ItemsService(config.collection.VENDOR_SKU_MAPPING, this.accountabilitySchema);
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
			const giftInventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			},null,null);
			return null;
		}
	}

	async getBrandSkuMapping(sku:any,reference_id:any,vendor_code:any) {
		try {
			const getBrandSkuMappingService = new this.ItemsService(config.collection.BRAND_SKU_MAPPING, this.accountabilitySchema);
			const response = await getBrandSkuMappingService.readByQuery({
				fields: ["*"],
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
			},reference_id,vendor_code);
			return null;
		}
	}

	async getVendorFromVendorCode(api_integration_id:any,reference_id:any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorDetailsService = new this.ItemsService(config.collection.VENDOR_DETAILS, accountability);
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

	async getVendorOrderFromRef(reference_id: any, vendor_id: any, vendor_code:any) {
		try {
			const vendorOrdersService = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
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
			const giftInventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			},null,null);
			return null;
		}
	}

	async getVendorOrderByReferenceId(reference_id: any,vendor_code:any) {
		try {
			const vendorOrdersService = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
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

			await new LogSys().log('get Link VoucherDetails:', false,null,null);
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);
			return null;
		}
	}



	async getLinkVoucherDetailsbyorderid(soft_link_order_id:any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			await new LogSys().log(`get Link order Details:OrderId:${soft_link_order_id}`, false,null,null);
			
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);
			return null;
		}
	}


	async inventoryOtpVerification(link_reference_id:any,reference_code_otp:any) {
		try {
		
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);

			return null;
		}
	}

	async getInventoryByreferance(link_reference_id:any,reference_code_otp:any) {
		try {
		
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);

			return null;
		}
	}
	async getInventoryByorderid(order_id:any) {
		try {
		
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}

			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);

			return null;
		}
	}

	async getInventoryByid(id:any) {
		try {
		
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			await new LogSys().log('getInventoryByid:', false,null,null);

			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "inventory Otp Verification Error"
			},null,null);

			return null;
		}
	}
	async getBrandSkuMappingbySku(sku:any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const getBrandSkuMappingService = new this.ItemsService(config.collection.BRAND_SKU_MAPPING, accountability);
			const response = await getBrandSkuMappingService.readByQuery({
				fields: ["*","brand.*"],
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
			},null,null);
			return null;
		}
	}

	async getVoucherFromInventory(link_reference_id:any) {
		try {
			const giftInventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			},null,null);
			return null;
		}
	}
	async getVoucherFromInventorybykeys(keys:any) {
		try {
			const giftInventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, this.accountabilitySchema);
			const response = await giftInventoryService.readByQuery({
				fields: ["id","link_reference_id","reference_code_otp"],
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
			},null,null);
			return null;
		}
	}

	async getVoucherBySoftLinkId(id:any) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const inventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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
			},null,null);

			return null;
		}
	}

	//this code is only for soft link (sp_reward_redemptions) update actual redemption id
	async getCampaignRedemptions(link_reference_id:any,env:any) {
        try {
            let res =await axios.post(
                `${env.CAMPAIGN_BASE_URL}reward-links/webhook/getoneredeem`, {
                link_reference_id: link_reference_id,
            }, {
                headers: {
                    Authorization: env.CAMPAIGN_AUTH
                }	
            }
            );

			await new LogSys().log(`getCampaignRedemptions link_reference_id:${link_reference_id}`, false,null,null);

            return res;
        } catch (e) {
            await new LogSys().error({ voucherCodeFromVppError: e },null,null);
        }
    }


	async inventoryRedeemList(start_date:any, end_date:any,limit:any) {
		try {
			
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftInventoryService = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
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


	async inventoryRedeemListRevlidate(start_date:any, end_date:any) {
		try {
			
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true,
				},
			};
			const giftInventoryService = new this.ItemsService(config.collection.INVENTORY_BALANCE_REPORT, accountability);
			const response = await giftInventoryService.readByQuery({
				fields: ['*','giftcard_inventory_id.*'],
				filter: {
					_and: [
						
						{
							validity: {
								_between: [start_date, end_date],
							},
						},
						{
							revalidate_status: {
								_eq: false,
							},
						}
						
					],
				},
				limit: -1,
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
}

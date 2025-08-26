import { error } from 'console';
import config from '../config.json';
import LogSys from '../helpers/logger';
import axios from 'axios';

/**
 * Setters Class
 * */
export default class Setters {
	ItemsService;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	vouchersToInventory = async (vouchers:any) => {
		try {		
			const giftInventoryService = new this.ItemsService(
				config.collection.GIFT_CARD_INVENTORY,
				this.accountabilitySchema
			);
			const response = await giftInventoryService.createMany(vouchers);
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'vouchersToInventory Error',
			},null,null);
			return null;
		}
	};
	vouchersToSingleInventory = async (vouchers:any) => {
		try {		
			const giftInventoryService = new this.ItemsService(
				config.collection.GIFT_CARD_INVENTORY,
				this.accountabilitySchema
			);
			const response = await giftInventoryService.createOne(vouchers);
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'vouchersToInventory Error',
			},null,null);
			return null;
		}
	};
	addLog = async (collection_name:any, error:any, reference_id:any, vendor_code:any) => {
		try {

			const logService = new this.ItemsService(config.collection.LOG_TABLE, this.accountabilitySchema);
			const response = await logService.createMany([
				{
					collection_name,
					error,
					reference_id,
					vendor_code
				},
			]);
			return response;
		} catch (e) {
			return null;
		}
	};

	async addVendorOrder(reference_id: any, vendorId: any, vendor_code:any) {
		try {
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.createOne({
				reference_id: reference_id,
				vendor: vendorId,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'addVendorOrder Error',
			},
			reference_id,
			vendor_code
			);
			return null;
		}
	}

	async updateVendorOrderStatus(reference_id: any, orderId: any, status: any,vendor_code:any) {
		try {
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(reference_id, {
				order_status: status,
				vendor_order_id: orderId,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderStatus Error',
			},reference_id,vendor_code
			);
			return null;
		}
	}

	async updateVendorOrderReferenceAppend(reference_id: any, reference_append: any,vendor_code:any) {
		try {
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(reference_id, {
				reference_append: reference_append,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderReferenceAppend Error',
			},reference_id,vendor_code);
			return null;
		}
	}

	async updateVendorOrderByKeys(id: any, transactionId: any, status: any) {
		try {
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(id, {
				order_status: status,
				vendor_order_id: transactionId,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderStatus Error',
			},null,null);
			return null;
		}
	}

	async updateVendorWalletBalance(vendorId: any, walletBalance: any) {
		try {
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_DETAILS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(vendorId, {
				wallet_balance: walletBalance + '',
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorWalletBalance Error',
			},null,null);
			return null;
		}
	}

	//update the gift_card status is redeemed when fething from gift card inventory 
	async updateLinkVoucherStatus(id: any,link_ledger_reference_id:any) {
		try {

			await new LogSys().log('update Link Voucher Status and order id', false,null,null);

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				gift_card: true,
				order_id:link_ledger_reference_id
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateLinkVoucherStatus Error"
			},null,null);
			return null;
		}
	}

	async updateOtp(id:any,reference_code_otp:any,link_reference_id:any) {
		try {

			await new LogSys().log('update Otp', false,null,null);

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				reference_code_otp:reference_code_otp
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Otp Error"
			},null,null);
			return null;
		}
	}

	//this code is only for soft link (sp_reward_redemptions) update actual redemption id
	async updateSoftLinkRedemptionInCampaigns(link_reference_id:any, soft_link_redemption_id:any,env:any) {
        try {
            let res =await axios.post(
                `${env.CAMPAIGN_BASE_URL}reward-links/webhook/updateredemption`, {
                link_reference_id: link_reference_id,
                soft_link_redemption_id: soft_link_redemption_id,
            }, {
                headers: {
                    Authorization: env.CAMPAIGN_AUTH
                }	
            }
            );


			await new LogSys().log('update Soft Link Redemption Campaigns:', false,null,null);
			await new LogSys().log(`updateSoftLinkRedemptionInCampaigns step 10:${link_reference_id}-${soft_link_redemption_id}`, false,null,null);

            return res;
        } catch (e) {
            await new LogSys().error({ voucherCodeFromVppError: e },null,null);
        }
    }

	async referenceupdate(id:any) {
		try {

			await new LogSys().log('referenceupdate', false,null,null);

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				reference_code_otp:'',
				link_reference_id:'',
				soft_link_order_id:''
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "reference update Error"
			},null,null);
			return null;
		}
	}

		//update the gift_card status is redeemed when fething from gift card inventory 
    async  softLinkOtpVerificationUpdate(id: any) {
			try {
	
				await new LogSys().log('softLinkOtpVerification'+id, false,null,null);
				await new LogSys().log(`softLinkOtpVerificationUpdate:${id}`, false,null,null);

				const accountability = {
					...this.accountabilitySchema,
					accountability : {
						admin : true
					}
	
				}
				const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
				const response = await vendorOrders.updateOne(id, {
					soft_link_redeemed_status:true
				});
				return response;
			} catch (e) {
				await new LogSys().jsonError({
					exception: e,
					error: "updateLinkVoucherStatus Error"
				},null,null);
				return null;
			}
	}



	async updateInventoryPin(id: any,pin:any) {
		
		try {
		const accountability = {
			...this.accountabilitySchema,
			accountability : {
				admin : true
			}

		}
		const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
		const response = await vendorOrders.updateOne(id, {
			pin:pin
		});
		return response;
	} catch (e) {
		await new LogSys().jsonError({
			exception: e,
			error: "update Inventory Pin Error"
		},null,null);
		return null;
	}
	}

	async updateVendorCategoryId(id: any, categoryid: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.VENDOR_DETAILS, accountability);
			const response = await vendorOrders.updateOne(id, {
				categoryid: categoryid,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorCategoryId Error',
			},null,null);
			return null;
		}
	}

	async updateCheckBalaceStatus(id:any) {
		try {

			await new LogSys().log(`updateCheckBalaceStatus ${id}`, false,null,null);

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				card_balance_status:true
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Check Balace Status"
			},null,null);
			return null;
		}
	}

	async updateBulkQuantityStatus(id: any,status:any) {
		
		try {
		const accountability = {
			...this.accountabilitySchema,
			accountability : {
				admin : true
			}

		}
		const vendorOrders = new this.ItemsService(config.collection.GIFT_CARD_INVENTORY, accountability);
		const response = await vendorOrders.updateOne(id, {
			bulk_qty_status:status
		});
		return response;
	} catch (e) {
		await new LogSys().jsonError({
			exception: e,
			error: "update Inventory bulk_qty_status Error"
		},null,null);
		return null;
	}
	}

	sd_giftcard_inventory_balance_report = async (vouchers:any) => {
		try {	

			await new LogSys().log(`vouchers ${vouchers}`, false,null,null);
			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}
	
			}	
			const giftInventoryService = new this.ItemsService(
				config.collection.INVENTORY_BALANCE_REPORT,
				accountability
			);
			const response = await giftInventoryService.createOne(vouchers);
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: 'sd giftcard inventory balance report Error',
			},null,null);
			return null;
		}
	};


	async revalidateCheckBalaceStatus(id:any,validity:any) {
		try {

			await new LogSys().log(`revalidateCheckBalaceStatus ${id}`, false,null,null);

			const accountability = {
				...this.accountabilitySchema,
				accountability : {
					admin : true
				}

			}
			const vendorOrders = new this.ItemsService(config.collection.INVENTORY_BALANCE_REPORT, accountability);
			const response = await vendorOrders.updateOne(id, {
				revalidate_status:true,
				revalidate_date:validity
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Check Balace Status"
			},null,null);
			return null;
		}
	}
}

import { error } from 'console';
import { CONFIG } from '../config';
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

	vouchersToInventory = async (vouchers: any) => {
		try {
			const giftInventoryService = new this.ItemsService(
				CONFIG.collection.GIFT_CARD_INVENTORY,
				this.accountabilitySchema
			);
			const response = await giftInventoryService.createMany(vouchers);
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'vouchersToInventory Error',
			}, null, null);
			return null;
		}
	};
	vouchersToSingleInventory = async (vouchers: any) => {
		try {
			const giftInventoryService = new this.ItemsService(
				CONFIG.collection.GIFT_CARD_INVENTORY,
				this.accountabilitySchema
			);
			const response = await giftInventoryService.createOne(vouchers);
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'vouchersToInventory Error',
			}, null, null);
			return null;
		}
	};
	addLog = async (collection_name: any, error: any, reference_id: any, vendor_code: any) => {
		try {

			const logService = new this.ItemsService(CONFIG.collection.LOG_TABLE, this.accountabilitySchema);
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
			console.log("addLog", e);
			return null;
		}
	};

	async addVendorOrder(reference_id: any, vendorId: any, vendor_code: any) {
		try {
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
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

	async updateVendorOrderStatus(reference_id: any, orderId: any, status: any, vendor_code: any) {
		try {
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(reference_id, {
				order_status: status,
				vendor_order_id: orderId,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderStatus Error',
			}, reference_id, vendor_code
			);
			return null;
		}
	}

	async updateVendorOrderReferenceAppend(reference_id: any, reference_append: any, vendor_code: any) {
		try {
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(reference_id, {
				reference_append: reference_append,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderReferenceAppend Error',
			}, reference_id, vendor_code);
			return null;
		}
	}

	async updateVendorOrderByKeys(id: any, transactionId: any, status: any) {
		try {
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_ORDERS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(id, {
				order_status: status,
				vendor_order_id: transactionId,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorOrderStatus Error',
			}, null, null);
			return null;
		}
	}

	async updateVendorWalletBalance(vendorId: any, walletBalance: any) {
		try {
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_DETAILS, this.accountabilitySchema);
			const response = await vendorOrders.updateOne(vendorId, {
				wallet_balance: walletBalance + '',
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorWalletBalance Error',
			}, null, null);
			return null;
		}
	}

	//update the gift_card status is redeemed when fething from gift card inventory 
	async updateLinkVoucherStatus(id: any, link_ledger_reference_id: any) {
		try {

			await new LogSys().log('update Link Voucher Status and order id', false, null, null);

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				gift_card: true,
				order_id: link_ledger_reference_id
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateLinkVoucherStatus Error"
			}, null, null);
			return null;
		}
	}

	async updateOtp(id: any, reference_code_otp: any, link_reference_id: any) {
		try {

			await new LogSys().log('update Otp', false, null, null);

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				reference_code_otp: reference_code_otp
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Otp Error"
			}, null, null);
			return null;
		}
	}

	//this code is only for soft link (sp_reward_redemptions) update actual redemption id
	async updateSoftLinkRedemptionInCampaigns(link_reference_id: any, soft_link_redemption_id: any, env: any) {
		try {
			let res = await axios.post(
				`${env.CAMPAIGN_BASE_URL}reward-links/webhook/updateredemption`, {
				link_reference_id: link_reference_id,
				soft_link_redemption_id: soft_link_redemption_id,
			}, {
				headers: {
					Authorization: env.CAMPAIGN_AUTH
				}
			}
			);


			await new LogSys().log('update Soft Link Redemption Campaigns:', false, null, null);
			await new LogSys().log(`updateSoftLinkRedemptionInCampaigns step 10:${link_reference_id}-${soft_link_redemption_id}`, false, null, null);

			return res;
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e }, null, null);
			return null;
		}
	}

	async referenceupdate(id: any) {
		try {

			await new LogSys().log('referenceupdate', false, null, null);

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				reference_code_otp: '',
				link_reference_id: '',
				soft_link_order_id: ''
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "reference update Error"
			}, null, null);
			return null;
		}
	}

	//update the gift_card status is redeemed when fething from gift card inventory 
	async softLinkOtpVerificationUpdate(id: any) {
		try {

			await new LogSys().log('softLinkOtpVerification' + id, false, null, null);
			await new LogSys().log(`softLinkOtpVerificationUpdate:${id}`, false, null, null);

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				soft_link_redeemed_status: true
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateLinkVoucherStatus Error"
			}, null, null);
			return null;
		}
	}



	async updateInventoryPin(id: any, pin: any) {

		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				pin: pin
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Inventory Pin Error"
			}, null, null);
			return null;
		}
	}

	async updateVendorCategoryId(id: any, categoryid: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.VENDOR_DETAILS, accountability);
			const response = await vendorOrders.updateOne(id, {
				categoryid: categoryid,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVendorCategoryId Error',
			}, null, null);
			return null;
		}
	}

	async updateCheckBalaceStatus(id: any) {
		try {

			await new LogSys().log(`updateCheckBalaceStatus ${id}`, false, null, null);

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				card_balance_status: true
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Check Balace Status"
			}, null, null);
			return null;
		}
	}

	async updateBulkQuantityStatus(id: any, status: any) {

		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const vendorOrders = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await vendorOrders.updateOne(id, {
				bulk_qty_status: status
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "update Inventory bulk_qty_status Error"
			}, null, null);
			return null;
		}
	}

	sd_giftcard_inventory_balance_report = async (vouchers: any) => {
		try {

			await new LogSys().log(`vouchers ${vouchers}`, false, null, null);
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}

			}
			const giftInventoryService = new this.ItemsService(
				CONFIG.collection.INVENTORY_BALANCE_REPORT,
				accountability
			);
			const response = await giftInventoryService.createOne(vouchers);
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: 'sd giftcard inventory balance report Error',
			}, null, null);
			return null;
		}
	};


	async revalidateCheckBalaceStatus(id: any, validity: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const giftInventoryService = new this.ItemsService(CONFIG.collection.GIFT_CARD_INVENTORY, accountability);
			const response = await giftInventoryService.updateOne(id, {
				revalidate_status: true,
				validity: validity
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'revalidateCheckBalaceStatus Error',
			}, null, null);
			return null;
		}
	}

	// Functions needed for redeemVoucher webhook
	async updateLinkBalance(linkId: string, pendingValue: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}

			const updateLinkBalanceService = new this.ItemsService(
				CONFIG.collection.REWARD_LINKS_TABLE,
				accountability
			);
			console.log(pendingValue)
			const response = await updateLinkBalanceService.updateOne(linkId, {
				pending_value: pendingValue,
				status: 'redeemed',
			});
			return response;
		} catch (e) {
			console.log(e)
			await new LogSys().jsonError({
				exception: e,
				error: 'updateLinkBalance Error',
			}, null, null);
			return null;
		}
	}

	async insertVoucherRedemption(
		linkId: any,
		sku: any,
		voucherCodeId: any,
		randomChars: any,
		reference_code_otp: any,
		redeemed_mode?: any,
		addToLedgerId?: any,
		soft_link_token?: any
	) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const createRedemptions = new this.ItemsService(
				CONFIG.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				accountability
			);
			const response = await createRedemptions.createOne({
				redemption_id: voucherCodeId,
				brand_sku: sku,
				reward_link: linkId,
				link_reference_id: randomChars,
				reference_code_otp: reference_code_otp,
				redeemed_mode: redeemed_mode,
				link_ledger: addToLedgerId,
				soft_link_token: soft_link_token,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'insertVoucherRedemption Error',
			}, null, null);
			return null;
		}
	}

	async addTransactionToLedger(
		reward_link: any,
		amount: any,
		type: any,
		reference_id: any,
		order_status: any,
		vendor_code: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_token: any
	) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const addTransactionToLedgerService = new this.ItemsService(
				CONFIG.collection.LINK_LEDGER,
				accountability
			);
			const response = await addTransactionToLedgerService.createOne({
				reward_link,
				amount: amount * 1,
				type,
				reference_id,
				order_status,
				vendor_code,
				link_reference_id,
				reference_code_otp,
				soft_link_token,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'addTransactionToLedger Error',
			}, null, null);
			return null;
		}
	}

	async updateLedgerTransactionOrderStatus(ledgerId: any, order_status: any, vendorCode: any, voucherMessage: any) {
		try {
			const updateObj: any = {
				order_status,
			};

			if (vendorCode) {
				updateObj['vendor_code'] = vendorCode;
			}
			if (voucherMessage) {
				updateObj['message'] = voucherMessage;
			}

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const updateLedgerTransactionOrderStatusService = new this.ItemsService(
				CONFIG.collection.LINK_LEDGER,
				accountability
			);
			const response = await updateLedgerTransactionOrderStatusService.updateOne(ledgerId, updateObj);
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateLedgerTransactionOrderStatus Error"
			}, null, null);
			return null;
		}
	}


	async updateVoucherRedeemed(
		voucherId: any,
		linkId: any,
		campaignName: any,
		randomChars: any,
		reference_code_otp: any,
		giftcard_status: any,
		soft_link_order_id: any,
		link_ledger_reference_id?: any
	) {
		try {


			const updateStatusService = new this.ItemsService(
				CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY,
				this.accountabilitySchema
			);
			const updateVoucherResponse = await updateStatusService.updateOne(voucherId, {
				order_id: linkId,
				gift_card: giftcard_status,
				client: campaignName,
				link_reference_id: randomChars,
				reference_code_otp: reference_code_otp,
				soft_link_order_id: soft_link_order_id,
				link_ledger_reference_id: link_ledger_reference_id
			});
			return updateVoucherResponse.data;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'updateVoucherRedeemed Error',
			}, null, null);
			return null;
		}
	}

	async updateBrandLimitationDetails(id: any, monthly_limit_utilized: any, overall_limit_utilized: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const userBrandWiseRedemptionsService = new this.ItemsService(
				CONFIG.collection.USER_BRAND_WISE_REDEMPTIONS,
				accountability
			);
			const response = await userBrandWiseRedemptionsService.updateOne(id, {
				monthly_limit_utilized: monthly_limit_utilized,
				overall_limit_utilized: overall_limit_utilized,
			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "updateBrandLimitationDetailsError Error"
			}, null, null);
			return null;
		}
	}

	async insertBrandLimitationDetails(campaign: any, email: any, phone: any, brand_name: any, monthly_limit_utilized: any, overall_limit_utilized: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const userBrandWiseRedemptionsService = new this.ItemsService(
				CONFIG.collection.USER_BRAND_WISE_REDEMPTIONS,
				accountability
			);
			const response = await userBrandWiseRedemptionsService.createOne({
				campaign: campaign,
				email: email,
				phone: phone,
				brand_name: brand_name,
				monthly_limit_utilized: monthly_limit_utilized,
				overall_limit_utilized: overall_limit_utilized,
			});
			return response;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "insertBrandLimitationDetailsError Error"
			}, null, null);
			return null;
		}
	}

	async updateSoftlinkVoucherRedeemedStatus(
		voucherId: any,
		linkId: any,
		campaignName: any,
		randomChars: any,
		reference_code_otp: any,
		giftcard_status: any,
		soft_link_order_id: any,
		link_ledger_reference_id?: any,
		soft_link_redeemed_status?: any
	) {
		try {

			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const updateStatusService = new this.ItemsService(
				CONFIG.collection.ZEUS_GIFT_CARD_INVENTORY,
				accountability
			);
			const updateVoucherResponse = await updateStatusService.updateOne(voucherId, {
				order_id: linkId,
				gift_card: giftcard_status,
				client: campaignName,
				link_reference_id: randomChars,
				reference_code_otp: reference_code_otp,
				soft_link_order_id: soft_link_order_id,
				link_ledger_reference_id: link_ledger_reference_id,
				soft_link_redeemed_status: soft_link_redeemed_status
			});
			return updateVoucherResponse.data;
		} catch (e) {

			await new LogSys().jsonError({
				exception: e,
				error: "updateVoucherRedeemedError Error"
			}, null, null);
			return null;
		}
	}

	async updateSoftReferenceId(id: any, reference_id: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const updateLinkRedemptionStatusService = new this.ItemsService(
				CONFIG.collection.LINK_LEDGER,
				accountability
			);
			const response = await updateLinkRedemptionStatusService.updateOne(id, {
				reference_id: reference_id,
			});

			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateSoftReferenceId Error"
			}, null, null);
			return null;
		}
	}

	async updateLedgerAttempts(ledgerId: any, attempts: any) {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const updateLedgerAttemptsService = new this.ItemsService(
				CONFIG.collection.LINK_LEDGER,
				accountability
			);
			const response = await updateLedgerAttemptsService.updateOne(ledgerId, {
				attempts,
			});
			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: "updateLedgerAttemptsError Error"
			}, null, null);
			return false;
		}
	}


	vendorCatalogue = async (catalog: any) => {
		try {
			const accountability = {
				...this.accountabilitySchema,
				accountability: {
					admin: true
				}
			}
			const giftInventoryService = new this.ItemsService(
				CONFIG.collection.VENDOR_CATALOGUE,
				accountability
			);
			const response = await giftInventoryService.createMany(catalog);
			return response;
		} catch (e) {
			console.log("e", e);
			await new LogSys().jsonError({
				exception: e,
				error: 'vouchersToInventory Error',
			}, null, null);
			return null;
		}
	};
}

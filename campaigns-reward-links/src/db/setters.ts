import config from '../config.js';
import LogSys from '../helpers/logger.js';
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

	addLog = async (json) => {
		try {
			const logService = new this.ItemsService(config.collection.LOG_TABLE, this.accountabilitySchema);
			const response = await logService.createMany([{ log: json }]);
			return response;
		} catch (e) {
			return null;
		}
	};

	async updateLinkToken(linkId: string, token: string, tokenLastUpdated: string, verificationStatus: boolean) {
		try {
			const updateLinkTokenService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkTokenService.updateOne(linkId, {
				token: token,
				token_last_updated: tokenLastUpdated,
				verified: verificationStatus,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkTokenError: e });
			return null;
		}
	}

	async inValidateLinkToken(linkId: string, token: string, tokenLastUpdated: string) {
		try {
			const updateLinkTokenService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkTokenService.updateOne(linkId, {
				token: token,
				token_last_updated: tokenLastUpdated,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkTokenError: e });
			return null;
		}
	}

	async updateLinkBalance(linkId: string, pendingValue: any) {
		try {
			const updateLinkBalanceService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkBalanceService.updateOne(linkId, {
				pending_value: pendingValue,
				status: 'redeemed',
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkBalanceError: e });
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
			const createRedemptions = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
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
			await new LogSys().error({ insertVoucherRedemptionError: e });
			return { insertVoucherRedemptionError: e };
		}
	}

	async updateMobileNumber(linkId: any, phone: any , region_id  : any) {
		try {
			const updateLinkPhoneService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkPhoneService.updateOne(linkId, {
				phone,
				country : region_id ?? null
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateMobileNumberError: e });
			return null;
		}
	}
	

	async updateEmail(linkId: any, email: any) {
		try {
			const updateLinkPhoneService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkPhoneService.updateOne(linkId, {
				email,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateMobileNumberError: e });
			return null;
		}
	}
	async updateLinkOtp(linkId: any, otp: any) {
		try {
			const updateLinkOtpService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkOtpService.updateOne(linkId, {
				otp: otp,
				otp_last_updated: new Date().toISOString(),
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkOtpError: e });
			return null;
		}
	}

	async addTransactionToLedger(
		reward_link,
		amount,
		type,
		reference_id,
		order_status,
		vendor_code,
		link_reference_id,
		reference_code_otp,
		soft_link_token
	) {
		try {
			const addTransactionToLedgerService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
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
			await new LogSys().error({ addTransactionToLedgerError: e });
			return { addTransactionToLedgerError: e };
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

			const updateLedgerTransactionOrderStatusService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
			);
			const response = await updateLedgerTransactionOrderStatusService.updateOne(ledgerId, updateObj);
			return response;
		} catch (e) {
			await new LogSys().error({ updateLedgerTransactionOrderStatusError: e });
			return { updateLedgerTransactionOrderStatusError: e };
		}
	}
	async updateLedgerAttempts(ledgerId, attempts) {
		try {
			const updateLedgerAttemptsService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
			);
			const response = await updateLedgerAttemptsService.updateOne(ledgerId, {
				attempts,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLedgerAttemptsError: e });
			return { updateLedgerAttemptsError: e };
		}
	}
	/** -----------------------------------------------------------------------------------------------------------------------
	 * ZEUS OPERATIONS / VPP API
	 * All functions/operations defined below connect to Zeus/ZeusQA
	 * */
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
			const updateVoucherResponse = await axios.patch(
				`${config.zeus.base_url}/items/sd_gift_card_inventory/${voucherId}`,
				{
					order_id: linkId,
					gift_card: giftcard_status,
					client: campaignName,
					link_reference_id: randomChars,
					reference_code_otp: reference_code_otp,
					soft_link_order_id: soft_link_order_id,
					link_ledger_reference_id: link_ledger_reference_id,
				},
				{
					headers: {
						Authorization: config.zeus.auth,
					},
				}
			);
			return updateVoucherResponse.data;
		} catch (e) {
			await new LogSys().error({ updateVoucherRedeemedError: e });
		}
	}

	async updateLinkRedemptionStatus(linkId: any, status: any) {
		try {
			const updateLinkRedemptionStatusService = new this.ItemsService(
				config.collection.REWARD_LINKS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateLinkRedemptionStatusService.updateOne(linkId, {
				status: status,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkRedemptionStatusError: e });
			return null;
		}
	}

	async updateReferenceLinkandCode(
		randomLink: any,
		reference_code_otp: any,
		redemption_id: any,
		link_resend_count: any,
		soft_link_token?: any
	) {
		try {
			const updateRedemptions = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const response = await updateRedemptions.updateOne(redemption_id, {
				link_resend_count: link_resend_count,
				soft_link_token: soft_link_token,
			});

			new LogSys().log({ msg: 'reference code and Otp Stored', time: new Date().toISOString() });

			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkOtpError: e });
			return null;
		}
	}

	async updateRedemption(redemption_id: any) {
		try {
			const updateLinkOtpService = new this.ItemsService(
				config.collection.REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);

			const response = await updateLinkOtpService.updateOne(redemption_id, {
				reward_link: null,
				link_reference_id: null,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkOtpError: e });
			return null;
		}
	}

	async updateRedemptionCreationStatus(id: any) {
		try {
			const updateTempZeusService = new this.ItemsService(
				config.collection.TEMP_ZEUS_CODE_DETAILS,
				this.accountabilitySchema
			);

			const response = await updateTempZeusService.updateOne(id, {
				redemption_creation_status: true,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkOtpError: e });
			return null;
		}
	}

	async insertSoftLinkVoucherRedemption(
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
			const createRedemptions = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);

			const response = await createRedemptions.createOne({
				redemption_id: voucherCodeId,
				brand_sku: sku,
				reward_link: linkId,
				link_reference_id: randomChars,
				reference_code_otp: reference_code_otp,
				soft_link_token: soft_link_token,
				redeemed_mode: redeemed_mode,
				link_ledger: addToLedgerId,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ insertVoucherRedemptionError: e });
			return { insertVoucherRedemptionError: e };
		}
	}

	async updateSoftLinkOtp(id: any, otp: any, soft_link_token: any, link_resend_count: any) {
		try {
			const updateLinkRedemptionStatusService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
			);
			const response = await updateLinkRedemptionStatusService.updateOne(id, {
				soft_link_token: soft_link_token,
				link_resend_count: link_resend_count,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkRedemptionStatusError: e });
			return null;
		}
	}

	async updateLedgerIdInRedemption(redemption_id: any, link_ledger: any) {
		try {
			const updateLinkOtpService = new this.ItemsService(
				config.collection.REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);

			const response = await updateLinkOtpService.updateOne(redemption_id, {
				link_ledger: link_ledger,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateLedgerIdInRedemption: e });
			return null;
		}
	}

	async updateSoftLinkReferanceId(id: any, link_reference_id: any) {
		try {
			const updateLinkRedemptionStatusService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
			);
			const response = await updateLinkRedemptionStatusService.updateOne(id, {
				link_reference_id: link_reference_id,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateLinkRedemptionStatusError: e });
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


			const updateStatusService = new this.ItemsService(
				config.collection.ZEUS_GIFT_CARD_INVENTORY,
				this.accountabilitySchema
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
			await new LogSys().error({ updateVoucherRedeemedError: e });
		}
	}

	async updateSoftReferenceId(id: any, reference_id: any) {
		try {
			const updateLinkRedemptionStatusService = new this.ItemsService(
				config.collection.LINK_LEDGER,
				this.accountabilitySchema
			);
			const response = await updateLinkRedemptionStatusService.updateOne(id, {
				reference_id: reference_id,
			});

			return response;
		} catch (e) {
			await new LogSys().error({ updateSoftReferenceId: e });
			return null;
		}
	}

	async updateBrandLimitationDetails(id: any, monthly_limit_utilized: any, overall_limit_utilized: any) {
		try {
			const userBrandWiseRedemptionsService = new this.ItemsService(
				config.collection.USER_BRAND_WISE_REDEMPTIONS,
				this.accountabilitySchema
			);
			const response = await userBrandWiseRedemptionsService.updateOne(id, {
				monthly_limit_utilized: monthly_limit_utilized,
				overall_limit_utilized: overall_limit_utilized,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateBrandLimitationDetailsError: e });
			return null;
		}
	}

	async insertBrandLimitationDetails(campaign: any, email: any, phone: any, brand_name: any, monthly_limit_utilized: any, overall_limit_utilized: any) {
		try {
			console.log("campaign--->", campaign)
			const userBrandWiseRedemptionsService = new this.ItemsService(
				config.collection.USER_BRAND_WISE_REDEMPTIONS,
				this.accountabilitySchema
			);
			const response = await userBrandWiseRedemptionsService.createOne({
				campaign: campaign,
				email:email,
				phone:phone,
				brand_name:brand_name,
				monthly_limit_utilized: monthly_limit_utilized,
				overall_limit_utilized: overall_limit_utilized,
			});
			return response;
		}catch(e){
			console.log("e--->", e)
			await new LogSys().error({ insertBrandLimitationDetailsError: e });
			return null;
		}
	}


	async updateVoucherRedeemedStatus(
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


			const updateStatusService = new this.ItemsService(
				config.collection.ZEUS_GIFT_CARD_INVENTORY,
				this.accountabilitySchema
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
			await new LogSys().error({ updateVoucherRedeemedError: e });
		}
	}
}

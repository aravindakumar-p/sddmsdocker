import config from '../config.js';
import LogSys from '../helpers/logger.js';
import axios from 'axios';

/**
 * Getters Class
 * */
export default class Getters {
	ItemsService: any;
	accountabilitySchema: any;

	constructor(ItemsService: any, accountabilitySchema: any) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	async getLinkDetailsFromId(linkId: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: [
					'*.*',
					'reward_campaign.*',
					'reward_campaign.base_region.name',
					'reward_campaign.base_region.id',
					'reward_campaign.base_region.code',
					'reward_campaign.base_region.currency',
					'reward_campaign.base_region.currency_symbol',
					'reward_campaign.base_region.flag_image',
					'reward_campaign.base_region.phone_code',
					'reward_campaign.regions.countries_id.id',
					'reward_campaign.regions.countries_id.name',
					'reward_campaign.regions.countries_id.code',
					'reward_campaign.regions.countries_id.currency',
					'reward_campaign.regions.countries_id.currency_symbol',
					'reward_campaign.regions.countries_id.flag_image',
					'reward_campaign.regions.countries_id.phone_code',
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
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.status',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.status',
					'reward_campaign.brand_limitation.*',
					'reward_campaign.brand_limitation.brand.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.region.name',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.region.name',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.region.code',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.region.code',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.region.currency',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.region.currency',
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
			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getLinkDetailsError: e });
		}
	}

	async getRegions() {
		try {
			const regionService = new this.ItemsService(config.collection.REGIONS, this.accountabilitySchema);
			const regionResponse = await regionService.readByQuery({
				fields: [
					'name',
					'code',
					'currency',
					'currency_symbol',
					'flag_image',
					'phone_code'
				],
				limit: -1
			});
			return regionResponse;
		} catch (e) {
			await new LogSys().error({ getRegions: e });
		}
	}

	async getRefeanceLinkDetailsFromId(id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: [
					'*.*',
					'reward_campaign.*',
					'reward_campaign.brands.*',
					'reward_campaign.brands.brand_id.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_image',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_name',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.darkmode_card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.logo_bg_light_mode',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.logo_bg_dark_mode',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_purchase_url',
					'redemptions.sku.*',
					'reward_campaign.campaign_configuration.*',
					'reward_campaign.campaign_configuration.sp_brand_campaign_mapping_id.*',
					'reward_campaign.campaign_configuration*',
				],
				filter: {
					_and: [
						{
							id: {
								_eq: id,
							},
						},
					],
				},
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getLinkDetailsError: e });
		}
	}
	async getLinkDetailsFromIdAndOtp(linkId: any, otp: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					_and: [
						{ id: { _eq: linkId } },
						{ otp: { _eq: otp } },
						{
							_or: [
								{ otp_last_updated: { _gt: new Date(new Date().getTime() - 5 * 60 * 1000).toISOString() + '' } },
								{ reward_campaign: { campaign_type: { _eq: 'generic' } } },
							],
						},
					],
				},
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getLinkDetailsFromIdAndOtpError: e });
		}
	}

	async getLinkVerifyOtp(linkId: any, otp: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					_and: [{ link_reference_id: { _eq: linkId } }, { reference_code_otp: { _eq: otp } }],
				},
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getLinkDetailsFromIdAndOtpError: e });
		}
	}
	async voucherDetails(sku: any) {
		try {
			const voucherSkuDetailsService = new this.ItemsService(
				config.collection.SKU_BRAND_MAPPING,
				this.accountabilitySchema
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
				],
				filter: { _and: [{ sku: { _eq: sku } }] },
			});

			return voucherSkuDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ voucherDetailsError: e });
		}
	}

	async getAllRewardSKUs(neededSkus: any) {
		try {
			const voucherDetailsService = new this.ItemsService(
				config.collection.SKU_BRAND_MAPPING,
				this.accountabilitySchema
			);
			const voucherDetailsResponse = await voucherDetailsService.readByQuery({
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
					'brand.region.id',
					'brand.region.name',
					'brand.region.currency',
					'brand.region.currency_symbol',
					'brand.region.flag_image',
					'brand.region.phone_code',
					'brand.region.code',
				],
				filter: { _and: [{ sku: { _in: neededSkus } }] },
				limit: -1,
			});

			return voucherDetailsResponse;
		} catch (e) {
			await new LogSys().error({ getAllRewardSKUsError: e });
		}
	}


	async voucherCode(sku: any) {
		try {
			const validityDate = new Date().toISOString()

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
				return {}
			}
		} catch (e) {

			await new LogSys().error({ voucherCodeError: e });
			return {}
		}
	}


	async getMultipleVoucherCode(sku: any, qty: any) {
		try {
			let limit = parseInt(qty) ? parseInt(qty) : 1;
			const validityDate = new Date().toISOString()
			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);

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
							validity: {
								_gt: validityDate
							}

						},
					],
				},
				limit: limit
			});


			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse
			} else {
				return []
			}
		} catch (e) {
			await new LogSys().error({ voucherCodeError: e });
		}
	}

	async getMultipleVoucherCodeFromVpp(sku: any, amt: any, orderId: any, referenceId: any, campaignName: any, qty: any) {
		try {
			const voucherCodeFromVppResponse = await axios.post(
				`${config.zeus.base_url}/vpp/get-vouchers`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data[0];
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e });
		}
	}

	async voucherCodeFromVpp(sku: any, amt: any, orderId: any, referenceId: any, campaignName: any, randomChars: any, reference_code_otp: any, giftcard_status: any, soft_link_order_id: any) {
		try {
			const voucherCodeFromVppResponse = await axios.post(
				`${config.zeus.base_url}/vpp/get-vouchers`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data[0];
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e });
		}
	}

	async vouchersFromIds(linkId: any, linkRedemptionsArr: any) {
		try {
			let redemptionIds: any = [-1];
			linkRedemptionsArr.map(({ redemption_id }: { redemption_id: any }) => {
				redemptionIds.push(redemption_id + '');
			});

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);

			const voucherCodeResponse = await giftcardInventoryService.readByQuery({
				fields: [
					'*',
				],
				filter: {
					_and: [
						{
							id: {
								_in: redemptionIds,
							}
						},
					],
				}
			});
			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse
			} else {
				return []
			}
		} catch (e) {
			await new LogSys().error({ vouchersFromIds: e });
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
				`${config.zeus.base_url}/vpp/get-old-vouchers`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return orderHistoryfromVppResponse.data;
		} catch (e) {
			await new LogSys().error({ orderHistoryfromVppError: e });
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
				`${config.zeus.base_url}/vpp/place-new-order`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {
			await new LogSys().error({ placeNewOrderVppError: e });
		}
	}

	/** ZEUS APIS --- END */

	async redemptionsFromIds(linkRedemptionsArr: any) {
		try {
			let redemptionIds: any = [];
			linkRedemptionsArr.map(({ redemption_id }: { redemption_id: any }) => {
				redemptionIds.push(redemption_id + '');
			});

			const redemptionDetailsService = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ redemption_id: { _in: redemptionIds } }] },
				limit: -1,
			});
			return redemptionDetailsResponse;
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}

	async getAllFailedLinkLedger() {
		try {
			const linksLedgerService = new this.ItemsService(config.collection.LINK_LEDGER, this.accountabilitySchema);
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
								_lt: config.defaults.max_retry_attempts,
							},
						},
					],
				},
			});

			return linksLedgerResponse;
		} catch (e) {
			await new LogSys().error({ getAllFailedLinkLedgerError: e });
		}
	}

	async getFailedLinkLedgerForLink(linkId: any) {
		try {
			const linksLedgerService = new this.ItemsService(config.collection.LINK_LEDGER, this.accountabilitySchema);
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
			await new LogSys().error({ getFailedLinkLedgerForLinkError: e });
		}
	}

	/* Get Link Details for PDF @Parthiban N */
	async getLinkDetailsForPDF(linkId: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: [
					'*.*',
					'reward_campaign.*',
					'reward_campaign.brands.*',
					'reward_campaign.brands.brand_id.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.*',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.*',
					'reward_campaign.other_catalogue_new.sd_brand_sku_mapping_id.brand.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_image',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_name',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.darkmode_card_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.brand_purchase_url',
					'redemptions.sku.*',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.logo_bg_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.terms_and_condition',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.dark_logo_bg_color',
					'reward_campaign.new_catalogue.sd_brand_sku_mapping_id.brand.redemption_process',
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
									_eq: 'pdf',
								},
							},
						},
					],
				},
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getLinkDetailsError: e });
		}
	}
	/* End */

	async updateOtpInZeus(link_reference_id: any, reference_code_otp: any, old_reference_code_otp: any) {
		try {
			const voucherCodeFromVppResponse = await axios.post(
				`${config.zeus.base_url}/vpp/otpupdate`,
				{
					link_reference_id: link_reference_id,
					reference_code_otp: reference_code_otp,
					old_reference_code_otp: old_reference_code_otp,
				},
				{
					headers: {
						Authorization: config.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data;
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e });
		}
	}

	async getAllReawardsLinkIds() {
		try {
			const voucherDetailsService = new this.ItemsService(
				config.collection.REWARD_SKU_TABLE,
				this.accountabilitySchema
			);

			const rewardLinkReferanceList = await voucherDetailsService.readByQuery({
				fields: ['link_reference_number'],
				limit: -1,
			});

			return rewardLinkReferanceList;
		} catch (e) {
			await new LogSys().error({ error: e });
		}
	}

	async getredemptionsFromId(id: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ redemption_id: { _eq: id } }] },
			});

			return redemptionDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}


	async checkRandomChars(randomChars: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ link_reference_id: { _eq: randomChars } }] },
			});

			return redemptionResponse;
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}

	async getVoucherCodeById(id: any) {
		try {

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			await new LogSys().error({ voucherCodeError: e });
		}
	}

	async getVoucherCodeByRedemptionId(id: any) {
		try {
			// const voucherCodeResponse = await axios.get(
			// 	`${config.zeus.base_url}/items/${config.collection.ZEUS_GIFT_CARD_INVENTORY}?` +
			// 	`filter={"_and": [{"id": {"_eq":${id}}}]}` +
			// 	`&limit=1`,
			// 	{
			// 		headers: {
			// 			Authorization: config.zeus.auth,
			// 		},
			// 	}
			// );

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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


			if (voucherCodeResponse.length !== 0) {
				return voucherCodeResponse[0]
			} else {
				return false
			}
		} catch (e) {
			await new LogSys().error({ voucherCodeError: e });
		}
	}



	async tempZeusCode(id: any) {
		try {
			const redemptionTempZeusService = new this.ItemsService(
				config.collection.TEMP_ZEUS_CODE_DETAILS,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionTempZeusService.readByQuery({
				filter: { _and: [{ id: { _eq: id } }] },
				fields: ['*'],
				limit: -1,
			});
			return redemptionDetailsResponse;
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}

	async getLinkDetailsFromemail(email?: any, campaignId?: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['*'],
				filter: {
					_and: [
						{
							email: {
								_eq: email,
							},
						},
						{
							reward_campaign: {
								_eq: campaignId,
							},
						},
					],
				},
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getLinkDetailsError: e });
		}
	}

	async getLinkDetailsFromphone(phone?: any, campaignId?: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS_TABLE, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['*'],
				filter: {
					_and: [
						{
							phone: {
								_eq: phone,
							},
						},
						{
							reward_campaign: {
								_eq: campaignId,
							},
						},
					],
				},
			});
			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getLinkDetailsError: e });
		}
	}

	async voucherCodeByOrerId(sku: any, order_id: any) {
		try {

			const validityDate = new Date().toISOString()

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			await new LogSys().error({ voucherCodeError: e });
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
			const inventoryService = new this.ItemsService(config.collection.LINK_REWARD_REDEMPTIONS_TABLE, accountability);
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
			await new LogSys().error({ softlinkotpverification: e });

			return null;
		}
	}


	async getZeusVoucherCode(id: any) {
		try {

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			await new LogSys().error({ voucherCodeError: e });
		}
	}

	async getLinkLedger(link_reference_id: any, reference_code_otp: any) {
		try {
			const linksLedgerService = new this.ItemsService(config.collection.LINK_LEDGER, this.accountabilitySchema);
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
			await new LogSys().error({ getAllFailedLinkLedgerError: e });
		}
	}

	async getLinkredemptionsFromId(id: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ redemption_id: { _eq: id } }] },
			});

			return redemptionDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}

	async getredemptionsByReferance(link_reference_id: any, reference_code_otp: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				fields: ['*', 'reward_link.id', 'reward_link.reward_campaign.name'],
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

			return redemptionDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}



	async voucherCodeList(sku: any) {
		try {
			const validityDate = new Date().toISOString()

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
				limit: -1
			});

			return voucherCodeResponse;
		} catch (e) {
			await new LogSys().error({ voucherCodeError: e });
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
				`${config.zeus.base_url}/vpp/get-vouchers`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return voucherCodeFromVppResponse.data[0];
		} catch (e) {
			await new LogSys().error({ voucherCodeFromVppError: e });
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
				`${config.zeus.base_url}/vpp/place-new-order`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {
			await new LogSys().error({ placeNewOrderVppError: e });
		}
	}

	async getSoftLinkUnredeemVoucher(linkId: any, date: any) {
		try {
			const linksLedgerService = new this.ItemsService(config.collection.LINK_LEDGER, this.accountabilitySchema);
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
								_eq: 'successful',
							},
							reward_link: {
								_eq: linkId,
							},
							link_reference_id: {
								_nnull: true,
							},
							date_created: {
								_gt: date,
							},
						},
					],
				},
			});

			return linksLedgerResponse;
		} catch (e) {
			await new LogSys().error({ getFailedLinkLedgerForLinkError: e });
		}
	}

	async getLedgerDetailsById(id: any) {
		try {
			const linksLedgerService = new this.ItemsService(config.collection.LINK_LEDGER, this.accountabilitySchema);
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
							id: {
								_eq: id,
							},
						},
					],
				},
			});

			return linksLedgerResponse[0];
		} catch (e) {
			await new LogSys().error({ getFailedLinkLedgerForLinkError: e });
		}
	}

	async getLinkredemptionsFromLedgerId(link_ledger: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.LINK_REWARD_REDEMPTIONS_TABLE,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ link_ledger: { _eq: link_ledger } }] },
			});
			return redemptionDetailsResponse.length !== 0 ? redemptionDetailsResponse[0] : undefined;
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
			return null
		}
	}



	async getZeusVoucherCodeByLedgerReferenceId(id: any) {
		try {

			const giftcardInventoryService = new this.ItemsService(config.collection.ZEUS_GIFT_CARD_INVENTORY, this.accountabilitySchema);
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
			await new LogSys().error({ voucherCodeError: e });
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
				`${config.zeus.base_url}/vpp/place-new-order`,
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
						Authorization: config.zeus.auth,
					},
				}
			);

			return placeNewOrderVppResponse.data;
		} catch (e) {
			await new LogSys().error({ placeNewOrderVppError: e });
		}
	}

	async getSkuBrandMapping(sku: any) {
		try {
			const redemptionDetailsService = new this.ItemsService(
				config.collection.SKU_BRAND_MAPPING,
				this.accountabilitySchema
			);
			const redemptionDetailsResponse = await redemptionDetailsService.readByQuery({
				filter: { _and: [{ sku: { _eq: sku } }] },
			});

			return redemptionDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ redemptionsFromIdsError: e });
		}
	}

	async getUserBrandWiseRedemptions(campaign: any, email: any, phone: any, brandName: any) {
		const logSys = new LogSys();
		try {
			logSys.log({ fn: 'getUserBrandWiseRedemptions', input: { campaign, email, phone, brandName } });

			if (!email) {
				email = null
			}

			if (!phone) {
				phone = null
			}

			const userBrandWiseRedemptionsService = new this.ItemsService(
				config.collection.USER_BRAND_WISE_REDEMPTIONS,
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

			logSys.log({ fn: 'getUserBrandWiseRedemptions', result: getBrandLimitationDetailsResponse });
			return getBrandLimitationDetailsResponse;
		} catch (e) {
			await new LogSys().error({ fn: 'getBrandLimitationDetailsResponse', error: e });
		}
	}

	async getConversionRate(symbol: any) {
		try {
			const conversionService = new this.ItemsService(config.collection.CONVERSION_RATES, this.accountabilitySchema);
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
			return conversionResponse;
		} catch (e) {
			await new LogSys().error({ getConversionRate: e });
		}

	}

	async getRegionCode(region_id: any) {
		try {
			const regionService = new this.ItemsService(config.collection.REGIONS, this.accountabilitySchema);
			const regionResponse = await regionService.readByQuery({
				fields: [
					"*"
				],
				filter: {
					id: {
						_eq: region_id
					}
				}
			});
			return regionResponse;

		} catch (e) {
			await new LogSys().error({ getRegionCode: e });
		}


	}
}

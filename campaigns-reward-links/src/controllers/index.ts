import Getters from '../db/getters';
import Setters from '../db/setters';
import LogSys from '../helpers/logger';
import config from '../config';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { voucherQueue, voucherQueueEvents, getQueueForClient, queueEvents } from '../queue/voucherQueue';
// import { workerNode } from "../queue/worker";
import { QueueEvents } from 'bullmq';
import { compress } from '@directus/shared/utils';
import { Worker, Job } from 'bullmq';
// import  Redis from 'ioredis';
import { connection } from '../queue/redisConfig';



export default class Controller {
	get = null;
	set = null;
	services = null;
	accountabilitySchema = null;
	itemsService = null;

	constructor(services, accountabilitySchema) {
		this.services = services;
		this.accountabilitySchema = accountabilitySchema;
		const { ItemsService } = services;
		this.itemsService = ItemsService;
	}

	updateAccountabilitySchema = (accountabilitySchema) => {
		this.accountabilitySchema = accountabilitySchema;
	};

	async verifyLink(linkId: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const linkDetailsArr = await get.getLinkDetailsFromId(linkId);
			if (linkDetailsArr && linkDetailsArr.length > 0 && linkDetailsArr[0]['end_date'] > new Date().toISOString()) {

				const affordableCataglogs: any[] = [];
				const otherCataglogs: any[] = [];

				const catalogMode = linkDetailsArr[0]['reward_campaign']['catalog_mode'];
				const otherCatalogMode = linkDetailsArr[0]['reward_campaign']['other_catalog_mode'];

				/* Themes and Custom CSS */
				const theme = linkDetailsArr[0]['reward_campaign']['theme'];
				const customCss = linkDetailsArr[0]['reward_campaign']['custom_css'];
				const baseRegion: any = linkDetailsArr[0]['reward_campaign']['base_region']
				const regions = await Promise.allSettled(linkDetailsArr[0]['reward_campaign']['regions'].map(async (e: any) => {
					const linkValue = linkDetailsArr[0]['value']
					// Ensure numeric fields are limited to 8 decimal places
					const toFixed8 = (val: any) => Number(Number(val).toFixed(8));
					try {
						if (baseRegion.currency == e.countries_id.currency) {
							return {
								...e.countries_id,
								linkValue: toFixed8(linkValue)
							}

						} else {
							const date = new Date()
							date.setDate(date.getDate() - 1);
							const formattedDate = date.toISOString().split('T')[0];
							const conversionQuery = baseRegion.currency + "_" + e.countries_id.currency + "_" + formattedDate
							const conversionRate = await get.getConversionRate(conversionQuery)
							const converted = linkValue * conversionRate[0].rate
							return {
								...e.countries_id,
								linkValue: toFixed8(converted - (converted * config.forexCharges / 100)),
								conversionRate: toFixed8(conversionRate[0].rate),
								forexChargePercent: toFixed8(config.forexCharges),
								conversionRateAfterForex: toFixed8(conversionRate[0].rate - (conversionRate[0].rate * config.forexCharges / 100))
							}

						}
					} catch (error) {

					}


				}) || [])
				const campaignStatus = linkDetailsArr[0]['reward_campaign']['status'];
				const catalogSort = linkDetailsArr[0].reward_campaign.catalogue_brands || [];

				if (campaignStatus != 'active') {
					return {
						success: false,
						message: 'Inactive Link',
						error_tag: 'INVALID_LINK',
					};
				}

				//Format Data for Catalogue
				linkDetailsArr[0]['reward_campaign']['new_catalogue'].forEach((cat: any) => {

					// Check if the brand is active before processing
					if (cat.sd_brand_sku_mapping_id && cat.sd_brand_sku_mapping_id.brand && cat.sd_brand_sku_mapping_id.brand.status === 'active') {
						cat.sd_brand_sku_mapping_id.redemptions = [];
						const { sd_brand_sku_mapping_id } = cat;
						const { amount } = sd_brand_sku_mapping_id;
						if (catalogMode == 'eq') {
							if (amount * 1 == linkDetailsArr[0]['pending_value'] * 1) {
								formatCatalogData(affordableCataglogs, cat.sd_brand_sku_mapping_id);
							}
						} else {
							if (amount * 1 <= linkDetailsArr[0]['pending_value'] * 1) {
								formatCatalogData(affordableCataglogs, cat.sd_brand_sku_mapping_id);
							}
						}
					}
				});

				//Format Data for Other Catalogue
				linkDetailsArr[0]['reward_campaign']['other_catalogue_new'].forEach((cat) => {
					if (cat.sd_brand_sku_mapping_id && cat.sd_brand_sku_mapping_id.brand && cat.sd_brand_sku_mapping_id.brand.status === 'active') {
						cat.sd_brand_sku_mapping_id.redemptions = [];
						const { sd_brand_sku_mapping_id } = cat;
						const { amount } = sd_brand_sku_mapping_id;
						if (otherCatalogMode == 'eq') {
							if (amount * 1 == linkDetailsArr[0]['pending_value'] * 1) {
								formatCatalogData(otherCataglogs, cat.sd_brand_sku_mapping_id);
							}
						} else {
							if (amount * 1 <= linkDetailsArr[0]['pending_value'] * 1) {
								formatCatalogData(otherCataglogs, cat.sd_brand_sku_mapping_id);
							}
						}
					}
				});

				// eslint-disable-next-line no-inner-declarations
				function formatCatalogData(catalog: any[], sku: any) {
					let brandIndex = -1;
					const brandFound = catalog?.some((element, index) => {
						if (element.brandName === sku.brand.brand_name) {
							brandIndex = index;
							return true;
						}
						brandIndex = -1;
						return false;
					});

					if (!brandFound || catalog.length <= 0) {
						const brandDetails = {
							brandName: sku?.brand?.brand_name ?? null,
							image: sku?.brand?.brand_image ?? null,
							card_color: sku?.brand?.card_color ?? null,
							darkmode_card_color: sku?.brand?.darkmode_card_color ?? null,
							brand_purchase_url: sku?.brand?.brand_purchase_url ?? null,
							logo_bg_color: sku?.brand?.logo_bg_color ?? null,
							terms_and_condition: sku?.brand?.terms_and_condition ?? null,
							dark_logo_bg_color: sku?.brand?.dark_logo_bg_color ?? null,
							redemption_process: sku?.brand?.redemption_process ?? null,
							denominations: [
								{
									sku: sku?.sku ?? null,
									value: sku?.amount ?? null,
								},
							],
							brand_visible: true,
							brand_visible_message: "You can redeem this brand again",
							regions: sku?.brand?.region || null,
						};
						catalog.push(brandDetails);
					} else {
						catalog[brandIndex].denominations.push({
							sku: sku.sku,
							value: sku.amount,
						});
					}
				}

				if (affordableCataglogs.length !== 0) {
					// Iterate over the data array
					affordableCataglogs.forEach((item) => {
						// Sort the denominations array in ascending order based on the 'value' property
						item.denominations.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
					});

					if (catalogSort.length > 0) {
						// Create a mapping of brandName to their priority index
						const priorityMap = catalogSort.reduce((map, item, index) => {
							const brandName = item.brand_name.trim(); // Ensure no extra spaces
							map[brandName] = index;
							return map;
						}, {});

						// Sort the catalogue based on the priority order
						affordableCataglogs.sort((a, b) => {
							return priorityMap[a.brandName.trim()] - priorityMap[b.brandName.trim()];
						});
					}
				}

				if (otherCataglogs.length !== 0) {
					// Iterate over the data array
					otherCataglogs.forEach((item) => {
						// Sort the denominations array in ascending order based on the 'value' property
						item.denominations.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
					});
				}
				let custom_fields = [];
				let mobile_custom_fields = [];
				let email_custom_fields = [];
				if (
					linkDetailsArr[0]['reward_campaign']['mobile_custom_field'] &&
					linkDetailsArr[0]['reward_campaign']['mobile_custom_field'].length > 0
				) {
					custom_fields.push(linkDetailsArr[0]['reward_campaign']['mobile_custom_field'][0]);
					mobile_custom_fields = linkDetailsArr[0]['reward_campaign']['mobile_custom_field'];
				}

				if (
					linkDetailsArr[0]['reward_campaign']['email_custom_field'] &&
					linkDetailsArr[0]['reward_campaign']['email_custom_field'].length > 0
				) {
					custom_fields.push(linkDetailsArr[0]['reward_campaign']['email_custom_field'][0]);
					email_custom_fields = linkDetailsArr[0]['reward_campaign']['email_custom_field'];
				}

				//brand limitation
				const brandLimitation = linkDetailsArr[0]['reward_campaign']['brand_limitation'] || [];

				if (brandLimitation.length > 0) {
					const phone = linkDetailsArr[0]['phone'] || '';
					const email = linkDetailsArr[0]['email'] || '';

					if (phone || email) {

						if (affordableCataglogs.length > 0) {


							for (let i = 0; i < affordableCataglogs.length; i++) {
								const getBrandLimitationDetailsResponse = await get.getUserBrandWiseRedemptions(linkDetailsArr[0]['reward_campaign']['id'], email, phone, affordableCataglogs[i].brandName);

								if (getBrandLimitationDetailsResponse && getBrandLimitationDetailsResponse.length > 0) {
									const overall_limit = brandLimitation[0]['overall_limit'] || 0;
									const monthly_limit = brandLimitation[0]['monthly_limit'] || 0;
									///filter by current month
									const currentMonth = new Date().getMonth() + 1;
									const currentYear = new Date().getFullYear();
									const currentMonthData = getBrandLimitationDetailsResponse.filter((item: any) => {
										const date = new Date(item.date_created);
										return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
									});


									const overall_limit_utilized = getBrandLimitationDetailsResponse.reduce((acc: any, curr: any) => {
										const value = Number(curr.overall_limit_utilized) || 0;
										return acc + value;
									}, 0);

									//sum of monthly_limit_utilized by date_created: '2025-06-30T13:34:36.129Z',
									const monthly_limit_utilized = currentMonthData.reduce((acc: any, curr: any) => {
										const value = Number(curr.monthly_limit_utilized) || 0;
										return acc + value;
									}, 0);

									if (overall_limit > 0) {
										if (overall_limit_utilized >= overall_limit) {
											affordableCataglogs[i]['brand_visible'] = false;
											affordableCataglogs[i]['brand_visible_message'] = brandLimitation[0]['overall_error_message'] || "Reached the maximum limit of this brand";
										} else {

											if (monthly_limit > 0) {
												if (monthly_limit_utilized >= monthly_limit) {
													affordableCataglogs[i]['brand_visible'] = false;
													affordableCataglogs[i]['brand_visible_message'] = brandLimitation[0]['monthly_error_message'] || "Reached the maximum limit of this brand for this month";
												} else {
													affordableCataglogs[i]['brand_visible'] = true;
													affordableCataglogs[i]['brand_visible_message'] = "You can redeem this brand again";
												}
											} else {
												affordableCataglogs[i]['brand_visible'] = true;
												affordableCataglogs[i]['brand_visible_message'] = "You can redeem this brand again";
											}
										}
									}
								}
							}
						}

					}
				}





				return {
					success: true,
					message: 'Reward Link fetched!!',
					data: {
						end_date: linkDetailsArr[0]['end_date'],
						value: linkDetailsArr[0]['value'],
						pending_value: linkDetailsArr[0]['pending_value'],
						email: linkDetailsArr[0]['email'],
						phone: linkDetailsArr[0]['phone'],
						phone_region: linkDetailsArr[0]['country'] ? {
							name: linkDetailsArr[0]['country']?.name,
							code: linkDetailsArr[0]['country']?.code,
							currency: linkDetailsArr[0]['country']?.currency,
							currency_symbol: linkDetailsArr[0]['country']?.currency_symbol,
							flag_image: linkDetailsArr[0]['country']?.flag_image,
							phone_code: linkDetailsArr[0]['country']?.phone_code
						} : null,
						otp_mode: linkDetailsArr[0]['reward_campaign']['otp_mode'],
						status: linkDetailsArr[0]['status'],
						sku: linkDetailsArr[0]['sku'],
						verified: linkDetailsArr[0]['verified'],
						mode: linkDetailsArr[0]['reward_campaign']['mode'],
						base_region: baseRegion,
						reward_campaign: {
							campaign_type: linkDetailsArr[0]['reward_campaign']['campaign_type'],
							tnc: linkDetailsArr[0]['reward_campaign']['tnc'],
							bg_image: `${config.defaults.asset_base_url}/${linkDetailsArr[0]['reward_campaign']['bg_image']}`,
							campaign_regions: regions.map((values: any) => values.value),
							catalogue: affordableCataglogs,
							otherCatalogue: otherCataglogs,
							theme: theme,
							custom_css: customCss,
							catalogue_mode: catalogMode,
							company_logo: `${config.defaults.asset_base_url}/${linkDetailsArr[0]['reward_campaign']['company_logo']}`,
							light_mode_primary: linkDetailsArr[0]['reward_campaign']['light_mode_primary'],
							light_mode_secondary: linkDetailsArr[0]['reward_campaign']['light_mode_secondary'],
							dark_mode_primary: linkDetailsArr[0]['reward_campaign']['dark_mode_primary'],
							dark_mode_secondary: linkDetailsArr[0]['reward_campaign']['dark_mode_secondary'],
							light_mode_text_color: linkDetailsArr[0]['reward_campaign']['light_mode_text_color'],
							dark_mode_text_color: linkDetailsArr[0]['reward_campaign']['dark_mode_text_color'],
							delivery_mode: linkDetailsArr[0]['reward_campaign']['delivery_mode'],
							welcome_message: linkDetailsArr[0]['reward_campaign']['welcome_message'],
							congratulation_message: linkDetailsArr[0]['reward_campaign']['congratulation_message'],
							soft_link_delivery_mode: linkDetailsArr[0]['reward_campaign']['soft_link_delivery_mode'],
							mobile_custom_field: mobile_custom_fields,
							email_custom_field: email_custom_fields,
							custom_fields: custom_fields,
						},
						redemptions: linkDetailsArr[0]['redemptions'],
					},
				};
			} else {
				if (linkDetailsArr && linkDetailsArr.length) {
					const isLinkExpired = linkDetailsArr[0]['end_date'] > new Date().toISOString() ? false : true;
					return {
						success: false,
						message: isLinkExpired ? 'Link Expired' : 'Invalid Link',
						error_tag: isLinkExpired ? 'LINK_EXPIRED' : 'INVALID_LINK',
					};
				} else {
					return {
						success: false,
						message: 'Invalid Link',
						error_tag: 'INVALID_LINK',
					};
				}
			}
		} catch (e) {
			console.log("ERROR--->", e)
			await new LogSys().error({ verifyLinkError: e });
			return {
				success: false,
				message: 'Server Error, Please try later',
				err_code: 'VER_LNK_ERR_EXC',
			};
		}
	}

	async logOut(linkId: any) {
		try {
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			/* Update Token */
			const token = '';
			const tokenLastUpdated = new Date(0).toISOString();
			const updatelinkToken = await set.inValidateLinkToken(linkId, token, tokenLastUpdated);

			return {
				success: true,
				message: 'User Logged Out',
				error_tag: null,
			};
		} catch (e) {
			await new LogSys().error({ verifyLinkError: e });
			return {
				success: false,
				message: 'Server Error, Please try later',
				err_code: 'LOGOUT_LNK_ERR_EXC',
			};
		}
	}

	async verifyOtp(linkId: any, otp: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			/* Get Reward Link Details */
			const rewardLink = await get.getLinkDetailsFromIdAndOtp(linkId, otp);

			if (rewardLink) {
				const token = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
				const tokenLastUpdated = new Date().toISOString();
				const verificationStatus = true;

				/* Update Token */
				const updatelinkToken = await set.updateLinkToken(linkId, token, tokenLastUpdated, verificationStatus);

				return {
					success: true,
					message: 'OTP Verified',
					token: token,
					token_last_updated: tokenLastUpdated,
					token_expire_in: config.defaults.auto_logout_time_mins * 1,
				};
			} else {
				return { success: false, message: 'Invalid OTP/Code' };
			}
		} catch (e) {
			await new LogSys().error({ verifyOtpError: e });
			return { success: false, message: 'Server Error, Please try later', err_code: 'VER_OT_ERR_EXC' };
		}
	}

	async linkVerifyOtp(linkId: any, otp: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			/* Get Reward Link Details */
			const rewardLink = await get.getLinkVerifyOtp(linkId, otp);

			if (rewardLink) {
				return {
					success: true,
					message: 'OTP Verified',
					token: '',
					token_last_updated: '',
					token_expire_in: '',
				};
			} else {
				return { success: false, message: 'Invalid OTP/Code' };
			}
		} catch (e) {
			await new LogSys().error({ verifyOtpError: e });
			return { success: false, message: 'linkVerifyOtp Server Error, Please try later', err_code: 'VER_OT_ERR_EXC' };
		}
	}
	async redeemVoucher(linkId: any, sku: any, token: any) {
		try {

			const queue = getQueueForClient('voucher-fetch-queue')
			this.workerNode('voucher-fetch-queue')
			const job = await queue.add('redeem', { linkId, sku, token }, { removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } });
			// const worker = this.workerNode()

			const counts = await queue.getJobCounts();
			// Wait for job to complete
			const finallResult = await job.waitUntilFinished(queueEvents['voucher-fetch-queue']);

			return finallResult;
		} catch (e) {
			console.log("Redeem Voucher Error", e);
			/* Log Error */
			await new LogSys().error({
				redeemVoucherError: e,
			});
			return {
				success: false,
				message: 'Please contact Administrator',
				err_code: 'EXC_ERR',
			};
		}
	}

	async getMyVouchers(linkId: any, token: any) {
		try {
			/* Verify Redemption Details */
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const linkDetailsArr = await get.getLinkDetailsFromId(linkId);
			const linkDetails = linkDetailsArr[0];
			new LogSys().log({ msg: 'getMyVouchers' + JSON.stringify(linkDetails), time: new Date().toISOString() });
			if (linkDetails) {
				const tokenLastUpdated = linkDetails['token_last_updated'];
				const lastToken = linkDetails['token'];

				if (token == lastToken && tokenLastUpdated >= new Date(new Date().getTime() - 5 * 60 * 1000).toISOString()) {

					const linkRedemptionsArr = linkDetails['redemptions_list'];

					/* Get Voucher Details */
					let getVouchersFromZeusResponse: any = [];

					getVouchersFromZeusResponse = await get.vouchersFromIds(linkId, linkRedemptionsArr);
					/* Get Redemption Details */
					const getRedemptionsResponse = await get.redemptionsFromIds(linkRedemptionsArr);
					/* Get Failed Ledgers of the Link */
					const getFailedLedgersResponse = await get.getFailedLinkLedgerForLink(linkId);
					const neededSkus: any = [];
					if (getVouchersFromZeusResponse && getVouchersFromZeusResponse?.length) {
						getVouchersFromZeusResponse.forEach(function (data, index) {
							neededSkus.push(data['product_code']);
						});
					}

					if (getFailedLedgersResponse && getFailedLedgersResponse?.length) {
						getFailedLedgersResponse.forEach((failedOrder) => {
							const { reference_id } = failedOrder;
							const productCode = reference_id.split('-')[0];
							neededSkus.push(productCode);
						});
					}

					/* Get All Available SKUs */
					let allRewardSKUs = await get.getAllRewardSKUs(neededSkus);

					if (allRewardSKUs.length !== 0) {
						allRewardSKUs = allRewardSKUs.map(item => ({
							...item,
							brand: {
								...item.brand,
								image: item.brand.brand_image,
								name: item.brand.brand_name
							}
						})).map(item => {
							return item;
						});
					}
					const responseData: any = [];

					/* Successfully redeemed Voucher Cards */
					if (getVouchersFromZeusResponse && getVouchersFromZeusResponse?.length) {
						getVouchersFromZeusResponse.forEach(function (data, index) {
							let redemption_details: any = [];
							let redeemed_mode = '';
							const rewardSku = allRewardSKUs.find((brand) => brand.sku === data['product_code']);
							const claimed_date =
								linkDetailsArr[0].reward_campaign.delivery_mode !== 'link'
									? getRedemptionsResponse.find((redemption) => redemption.redemption_id == data['id'])['date_created']
									: getRedemptionsResponse[0].date_created;
							redemption_details = getRedemptionsResponse.find((redemption) => redemption.redemption_id == data['id']);
							if (redemption_details.redeemed_mode == 'direct_link') {
								redeemed_mode = 'direct_link';
								if (data['soft_link_order_id'] || data['link_reference_id'] || data['reference_code_otp']) {
									redeemed_mode = 'link';
								}
							} else if (redemption_details.redeemed_mode == 'link') {
								redeemed_mode = 'link';
							}

							responseData[index] = {};
							responseData[index].amount = data['price'];
							responseData[index].voucher =
								redeemed_mode == 'link' ? '' : redeemed_mode == 'direct_link' ? data['code'] : '';
							responseData[index].pin =
								redeemed_mode == 'link' ? '' : redeemed_mode == 'direct_link' ? data['pin'] : '';
							responseData[index].valid_till =
								redeemed_mode == 'link' ? '' : redeemed_mode == 'direct_link' ? data['validity'] : '';
							responseData[index].product_code = data['product_code'];
							responseData[index].claimed_date = claimed_date;
							responseData[index].image = rewardSku ? rewardSku.brand.image : null;
							responseData[index].brand = rewardSku ? rewardSku.brand : null;
							responseData[index].redemption_process = rewardSku ? rewardSku.brand.redemption_process : null;
							responseData[index].redemption_id = data.id;
							responseData[index].redeemed_mode = redeemed_mode || '';
							responseData[index].pending = false;
							responseData[index].link_reference_id = redemption_details['link_reference_id'];
							responseData[index].link_ledger = redemption_details['link_ledger'] || '';
						});
					}


					/* Pending Voucher Cards */
					if (getFailedLedgersResponse && getFailedLedgersResponse?.length) {
						getFailedLedgersResponse.forEach((failedOrder) => {
							const { reference_id, date_created } = failedOrder;
							const productCode = reference_id.split('-')[0];
							const rewardSku = allRewardSKUs.find(item => item.sku === productCode);

							if (rewardSku && rewardSku.brand) {
								rewardSku.brand.name = rewardSku.brand.brand_name;
								rewardSku.brand.image = rewardSku.brand.brand_image;
							}

							responseData.push({
								amount: `${rewardSku ? rewardSku.amount : ''}`,
								voucher: '',
								pin: '',
								valid_till: '',
								claimed_date: new Date(date_created).toISOString(),
								image: rewardSku?.brand?.brand_image || '',
								brand: rewardSku?.brand || {},
								redemption_process: rewardSku?.brand?.redemption_process || null,
								pending: true,
								redemption_id: '',
								redeemed_mode: failedOrder?.reward_link?.reward_campaign?.delivery_mode || 'direct_link',
								link_reference_id: failedOrder.link_reference_id,
								link_ledger: failedOrder.id,
								product_code: productCode,
							});

						});
					}
					let getLedgerIds = [];
					if (responseData.length !== 0) {
						getLedgerIds = responseData.map((item: any) => item.link_ledger);
					}
					const fetchDate = config.fetchDate;
					/*soft Link Unreemdem Vouchers */
					const getunRedeemLedgersResponse = await get.getSoftLinkUnredeemVoucher(linkId, fetchDate);
					if (getunRedeemLedgersResponse.length !== 0) {
						const filteredArray = getunRedeemLedgersResponse.filter((item) => !getLedgerIds.includes(item.id));

						if (filteredArray.length !== 0) {
							for (let i = 0; i < filteredArray.length; i++) {
								const ledgers = filteredArray[i];
								let skuArr = [];
								let skucode = '';
								if (ledgers.reward_link.reward_campaign.delivery_mode === 'link') {
									const { reference_id, date_created } = ledgers;
									let productCode = reference_id.split('-')[0];

									if (productCode === 'inventory') {
										const inventoryId = reference_id.split('-')[1];

										if (inventoryId) {
											const inventoryDetail = await get.getVoucherCodeByRedemptionId(inventoryId);
											if (inventoryDetail.length > 0) {
												skucode = inventoryDetail[0].product_code;
												skuArr.push(skucode);
											}
										}
									} else {
										skuArr.push(productCode);
									}

									// Await call to get all reward SKUs
									const allRewardSKUslist = await get.getAllRewardSKUs(skuArr);
									// const rewardSku = allRewardSKUslist.find((brand) => brand.sku === skuArr[0]);
									const rewardSku = allRewardSKUslist.find(item => item.sku === skuArr[0]);

									if (rewardSku.amount) {
										rewardSku.brand.name = rewardSku.brand.brand_name;
										rewardSku.brand.image = rewardSku.brand.brand_image;

										// Push the processed data to responseData
										responseData.push({
											amount: `${rewardSku ? rewardSku.amount : ''}`,
											voucher: '',
											pin: '',
											valid_till: '',
											claimed_date: new Date(date_created).toISOString(),
											image: rewardSku ? rewardSku.brand.image : null,
											brand: rewardSku ? rewardSku.brand : null,
											redemption_process: rewardSku ? rewardSku.brand.redemption_process : null,
											pending: false,
											redemption_id: '',
											redeemed_mode: ledgers.reward_link.reward_campaign.delivery_mode,
											link_reference_id: ledgers.link_reference_id,
											link_ledger: ledgers.id,
											product_code: productCode,
										});
									}
								}
							}
						}
					}

					return {
						result: responseData,
						success: true,
						message: 'Vouchers Fetched!',
					};
				} else {
					return {
						success: false,
						message: 'Link Expired',
						error_tag: 'LINK_EXPIRED',
						err_code: 'GET_VOU_EXP_LNK',
					};
				}
			} else {
				return {
					success: false,
					message: 'Please Contact Administrator',
					err_code: 'GET_VOU_INV_LNK',
				};
			}
		} catch (e) {
			await new LogSys().error({
				getMyVouchersError: e,
			});
			return {
				success: false,
				message: 'Server Error, Please try later',
				err_code: 'GET_VOU_EXC_ERR',
			};
		}
	}

	async sendOtp(linkId: any, resend: any, mobile: any, email: any, is_send_otp: any, region_id?: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const linkDetailsArr = await get.getLinkDetailsFromId(linkId);
			const getRegionCode = await get.getRegionCode(region_id)
			const linkDetails = linkDetailsArr[0];
			let linkPhoneNumber = linkDetails['phone'];
			let linkEmailId = linkDetails['email'];
			let isLinkVerified = linkDetails['verified'];

			const region = linkDetails['country']?.phone_code ? linkDetails['country']?.phone_code : getRegionCode[0]?.phone_code ? getRegionCode[0]?.phone_code : '91'
			console.log(region, 'getRegionCode')

			const rewardCampaignDetails = linkDetails['reward_campaign'];
			const rcOtpMode = rewardCampaignDetails['otp_mode'];
			const rcFromEmail = rewardCampaignDetails['email_from'];
			const rcEmailRegards = rewardCampaignDetails['email_regards'];
			const isLinkAccess = rewardCampaignDetails['is_link_access'];
			const link_limit = rewardCampaignDetails['link_limit'];
			const link_access_source = rewardCampaignDetails['link_access_source'];
			let limit_status = false;
			if (linkDetails) {
				if (isLinkAccess && !limit_status && !isLinkVerified) {
					if (link_access_source == 'email' && !isLinkVerified) {
						let linkDetailsemailArr = await get.getLinkDetailsFromemail(email, rewardCampaignDetails['id']);
						if (linkDetailsemailArr.length > 0) {
							if (linkDetailsemailArr.length == link_limit) {
								limit_status = true;

								const phoneverified = linkDetailsemailArr.filter((user) => user.id === linkId);

								if (phoneverified.length > 0) {
									limit_status = false;
								}
							} else if (linkDetailsemailArr.length > link_limit) {
								limit_status = true;
							}
						}
					} else if (link_access_source == 'mobile_number' && !isLinkVerified) {
						let linkDetailsphoneArr = await get.getLinkDetailsFromphone(mobile, rewardCampaignDetails['id']);

						if (linkDetailsphoneArr.length > 0) {
							if (linkDetailsphoneArr.length == link_limit) {
								limit_status = true;
								const phoneverified = linkDetailsphoneArr.filter((user) => user.id === linkId);
								if (phoneverified.length > 0) {
									limit_status = false;
								}
							} else if (linkDetailsphoneArr.length > link_limit) {
								limit_status = true;
							} else {
								limit_status = false;
							}
						}
					}
				}

				if (!limit_status) {
					if (mobile) {
						/* Update phone number only if link is not verified */
						if (!isLinkVerified) {
							/* Update the mobile number */
							linkPhoneNumber = mobile;
							const updateMobileResponse = await set.updateMobileNumber(linkId, mobile, region_id);
						}
					}
					if (email) {
						/* Update Email if link is not verified */
						if (!isLinkVerified) {
							/* Update the mobile number */
							linkEmailId = email.trim();
							const updateEmailResponse = await set.updateEmail(linkId, linkEmailId);
						}
					}

					/* Get Reward Link Details */
					let presentDate = new Date();
					let lastDate = new Date(linkDetails['otp_last_updated']);
					let diff = Math.abs(Math.round((new Date() - new Date(linkDetails['otp_last_updated'])) / 1000 / 60)) - 330;
					let generateOtp =
						Math.abs(Math.round((new Date() - new Date(linkDetails['otp_last_updated'])) / 1000 / 60)) > 5 || resend;

					if (generateOtp && is_send_otp == 1) {
						/* Update OTP */
						const otp = ['Reward-Automation'].includes(linkDetails['id'])
							? 1000
							: Math.floor(1000 + Math.random() * 9000);
						const updateLinkOtp = await set.updateLinkOtp(linkId, otp);

						let otpSendingResponse = null;

						new LogSys().log({
							msg: 'Sending OTP Using SD Notifications Workflow',
							otp: otp,
							otp_mode: rcOtpMode,
							time: new Date().toISOString(),
						});
						switch (rcOtpMode) {
							case 'sms':
								otpSendingResponse = await this.sendSMS(linkPhoneNumber, otp, region);
								break;
							case 'email':
								otpSendingResponse = await this.sendEmail(rcFromEmail, linkEmailId, otp, rcEmailRegards, null, null);
								break;
							case 'whatsapp':
								otpSendingResponse = await this.sendWhatsapp(linkPhoneNumber, otp, null, null);
								break;
						}
						new LogSys().log({ msg: 'Response received from SD Notifications Workflow', response: otpSendingResponse });

						if (otpSendingResponse) {
							return {
								success: true,
								message: 'Otp Sent Successfully',
							};
						} else {
							return {
								success: false,
								message: 'Error Occurred in sending Otp',
							};
						}
					} else {
						/* NO Ops On Refresh */
						let message = is_send_otp == 1 ? 'Otp Sent Successfully' : '';
						return {
							success: true,
							message: message,
						};
					}
				} else {
					return {
						success: false,
						message: 'Limit Exceeded! Please Contact To Administrator',
					};
				}
			} else {
				return {
					success: false,
					message: 'Invalid Link',
				};
			}
		} catch (e) {
			await new LogSys().error({
				sendOtpError: e,
			});
			console.log(e)
			return {
				success: false,
				message: 'Error Occurred, Please try later',
			};
		}
	}

	async sendSMS(mobile: any, otp: any, region?: any) {
		try {
			const requestBody = {
				mobile: region ? region + mobile : (mobile + '').length == 10 ? '91' + mobile : mobile,
				otp: otp,
				source: 'reward-links',
				sender_id: 'SHAKPE-Links-OTP',
			};

			const sendSMSResponse = await axios.post(`${config.zeus.base_url}/commons/send-otp`, requestBody, {
				headers: {
					Authorization: config.auth.zeus_send_otp_api,
				},
			});

			return sendSMSResponse.data;
		} catch (e) {
			await new LogSys().error({
				sendSMSError: e,
			});
		}
	}
	async sendEmail(from, to, otp, email_regards, template, extra_params) {
		try {
			const requestBody = {
				template_name: template || 'reward-template',
				template_params: [otp, email_regards],
				email_from: from,
				email_to: to,
				otp_mode: 'email',
				type: extra_params && extra_params.type ? extra_params.type : '',
				extra_params: extra_params || {},
			};

			const sendEmailResponse = await axios.post(`${config.workflows.base_url}/webhook/sd-notifications`, requestBody, {
				headers: {
					Authorization: config.workflows.sd_notifications_auth,
				},
			});

			return sendEmailResponse.data;
		} catch (e) {
			await new LogSys().error({
				sendEmailError: e,
			});
		}
	}
	async sendWhatsapp(mobile, otp, template, extra_params) {
		try {
			const requestBody = {
				template_name: template || 'reward-template',
				template_params: [otp],
				phone: mobile,
				otp_mode: 'whatsapp',
				type: extra_params && extra_params.type ? extra_params.type : '',
				extra_params: extra_params || {},
			};

			const sendSMSResponse = await axios.post(`${config.workflows.base_url}/webhook/sd-notifications`, requestBody, {
				headers: {
					Authorization: config.workflows.sd_notifications_auth,
				},
			});

			return sendSMSResponse.data;
		} catch (e) {
			await new LogSys().error({
				sendWhatsappError: e,
			});
		}
	}

	insertRedemptionAndUpdateLedger = async (
		orderResponse,
		ledgerReferenceId,
		ledgerLinkId,
		sku_id,
		ledgerId,
		newOrder,
		link_reference_id,
		reference_code_otp,
		redeemed_mode,
		link_ledger_id,
		soft_link_token
	) => {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const { keys } = orderResponse;
			new LogSys().log(`VPP NEW:${newOrder} Keys RefId:${ledgerReferenceId} | keys:${keys}`);
			if (keys && keys[0] && keys.length) {
				/* We must add these to the redemptions table of that user */
				const insertRedemptionResponse = await set.insertVoucherRedemption(
					ledgerLinkId,
					sku_id,
					keys[0],
					link_reference_id,
					reference_code_otp,
					redeemed_mode,
					link_ledger_id,
					soft_link_token
				);
				const isInsertRedemptionSuc =
					typeof insertRedemptionResponse === 'number' &&
					Math.floor(insertRedemptionResponse) === insertRedemptionResponse;
				new LogSys().log(
					`VPP NEW:${newOrder} isInsertRedemptionSuc RefId:${ledgerReferenceId} | suc:${isInsertRedemptionSuc}`
				);
				if (isInsertRedemptionSuc) {
					const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(ledgerId, 'successful', null, null);
					return {
						success: true,
						err_code: null,
					};
				}
				return {
					success: false,
					err_code: newOrder ? 'NEW_INS_REDM_FAIL' : 'INS_REDM_FAIL',
				};
			}
			return {
				success: false,
				err_code: newOrder ? 'NEW_INV_KEYS_NULL' : 'INV_KEYS_NULL',
			};
		} catch (e) {
			await new LogSys().error({
				insertRedemptionAndUpdateLedgerError: e,
			});
		}
	};

	async handleFailedLedger({
		ledgerId,
		ledgerReferenceId,
		ledgerLinkId,
		ledgerVendorCode,
		ledgerAttempts,
		ledgerLinkCampaign,
		linkReferenceId,
		deliveryMode,
		failedLedger,
		reference_code_otp,
		soft_link_token,
	}) {
		try {
			new LogSys().log(`Retrying RefId:${ledgerReferenceId} | ctr:${ledgerAttempts}`);
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const voucherSku = ledgerReferenceId ? ledgerReferenceId.split('-')[0] : null;
			// let reference_code_otp = '';
			let link_reference_id = '';
			let soft_link_order_id = '';
			let soft_link_token = '';
			const user = {
				email: failedLedger['reward_link']['email'] || '',
				date: Date.now(),
			};
			let secretKey = config.secret_key;
			let expiresIn = config.expiresIn;
			const skuDetails = await get.getSkuBrandMapping(voucherSku);
			const sku_id = skuDetails.id;
			if (deliveryMode === 'link') {
				link_reference_id = linkReferenceId;

				if (!linkReferenceId) {
					linkReferenceId = await this.generateUniqueCode();
				}

				if (!reference_code_otp) {
					reference_code_otp = await this.generateOTP();
				}
				soft_link_order_id = voucherSku + '-' + link_reference_id;
				if (!soft_link_token) {
					soft_link_token = await this.generateToken(user, secretKey, expiresIn);
				}
			}
			/* INCREASE LEDGER ATTEMPTS */
			const increaseAttemptsResponse = await set.updateLedgerAttempts(ledgerId, ledgerAttempts + 1);
			if (ledgerVendorCode != 'ZEUS_INVENTORY') {
				new LogSys().log(`Requesting VPP Old Order Api RefId:${ledgerReferenceId}, time:${new Date().toISOString()}`);
				/* REQUEST VPP API FOR OLD VOUCHERS */
				const getOrderHistoryResponse = await get.orderHistoryfromVpp(
					ledgerReferenceId,
					ledgerReferenceId,
					ledgerLinkCampaign + ' - (R)',
					ledgerVendorCode,
					link_reference_id,
					reference_code_otp,
					soft_link_order_id,
					voucherSku
				);

				const orderHistorySuccess =
					getOrderHistoryResponse != '' && getOrderHistoryResponse && getOrderHistoryResponse['success'];

				new LogSys().log(
					`VPP Response RefId:${ledgerReferenceId} | suc:${orderHistorySuccess}, time:${new Date().toISOString()}`
				);

				if (orderHistorySuccess) {
					const finalResponse = await this.insertRedemptionAndUpdateLedger(
						getOrderHistoryResponse,
						ledgerReferenceId,
						ledgerLinkId,
						sku_id,
						ledgerId,
						false,
						link_reference_id,
						reference_code_otp,
						deliveryMode,
						ledgerId,
						soft_link_token
					);
					return finalResponse;
				} else {
					new LogSys().log(`VPP Place New Order RefId:${ledgerReferenceId}, time:${new Date().toISOString()}`);
					/* REQUEST VPP API FOR OLD VOUCHERS */
					const placeNewOrderResponse = await get.placeNewOrderVpp(
						ledgerReferenceId,
						ledgerReferenceId,
						ledgerLinkCampaign + ' - (R)',
						ledgerVendorCode,
						voucherSku,
						link_reference_id,
						reference_code_otp,
						soft_link_order_id
					);

					const placeNewOrderSuccess =
						placeNewOrderResponse != '' && placeNewOrderResponse && placeNewOrderResponse['success'];

					new LogSys().log(
						`VPP New Order Response RefId:${ledgerReferenceId} | suc:${orderHistorySuccess}, time:${new Date().toISOString()}`
					);

					if (placeNewOrderSuccess) {
						const { keys } = placeNewOrderResponse;

						if (deliveryMode === 'link') {
							const updateRes = await set.updateSoftlinkVoucherRedeemedStatus(
								keys[0],
								ledgerReferenceId,
								ledgerLinkCampaign + ' - (R)',
								link_reference_id,
								reference_code_otp,
								true,
								soft_link_order_id,
								ledgerReferenceId,
								true
							);
							new LogSys().log({ msg: `getLinkVouchers updateRes ${updateRes}`, time: new Date().toISOString() });
						}

						const finalResponse = await this.insertRedemptionAndUpdateLedger(
							placeNewOrderResponse,
							ledgerReferenceId,
							ledgerLinkId,
							sku_id,
							ledgerId,
							true,
							link_reference_id,
							reference_code_otp,
							deliveryMode,
							ledgerId,
							soft_link_token
						);
						return finalResponse;
					}
				}
			} else if (ledgerVendorCode == 'ZEUS_INVENTORY') {
				new LogSys().log(`Inventory Failed Order, RefId:${ledgerReferenceId}, time:${new Date().toISOString()}`);
				if (!ledgerReferenceId.includes('inventory')) {
					new LogSys().log(
						`Bypassing VPP - Redeeming from Inventory, RefId:${ledgerReferenceId}, time:${new Date().toISOString()}`
					);
					/* Get Voucher Code */

					const campaignName = ledgerLinkCampaign;
					const campaignNameR = campaignName + ' - (R)';
					if (deliveryMode == 'link') {
						let softlinkvoucherCode = await get.voucherCodeByOrerId(voucherSku, ledgerReferenceId);

						if (!softlinkvoucherCode) {
							softlinkvoucherCode = await get.voucherCode(voucherSku);
						}

						if (softlinkvoucherCode) {
							new LogSys().log(`Got Voucher from Gift Card Inventory, RefId:${ledgerReferenceId}`);
							/* Update Voucher Redeemed */
							const voucherCodeId = softlinkvoucherCode['id'];
							let finalResponse: any = {};
							const updateVoucherRedeemedResponse = await set.updateSoftlinkVoucherRedeemedStatus(
								voucherCodeId,
								ledgerReferenceId,
								campaignNameR,
								link_reference_id,
								reference_code_otp,
								true,
								soft_link_order_id,
								ledgerReferenceId,
								true
							);

							new LogSys().log(`Updated Voucher Redeemed at Zeus Inventory, RefId:${ledgerReferenceId}`);
							finalResponse = await this.insertRedemptionAndUpdateLedger(
								{ keys: [voucherCodeId] },
								ledgerReferenceId,
								ledgerLinkId,
								sku_id,
								ledgerId,
								true,
								link_reference_id,
								reference_code_otp,
								deliveryMode,
								ledgerId,
								soft_link_token
							);

							return finalResponse;
						}
					} else {
						let voucherCode = await get.voucherCodeByOrerId(voucherSku, ledgerReferenceId);

						if (!voucherCode) {
							voucherCode = await get.voucherCode(voucherSku);
						}

						if (voucherCode) {
							new LogSys().log(`Got Voucher from Gift Card Inventory, RefId:${ledgerReferenceId}`);
							/* Update Voucher Redeemed */
							const voucherCodeId = voucherCode['id'];
							let finalResponse: any = {};
							const updateVoucherRedeemedResponse = await set.updateVoucherRedeemed(
								voucherCodeId,
								ledgerReferenceId,
								campaignNameR,
								link_reference_id,
								reference_code_otp,
								true,
								soft_link_order_id,
								ledgerReferenceId
							);
							new LogSys().log(`Updated Voucher Redeemed at Zeus Inventory, RefId:${ledgerReferenceId}`);
							finalResponse = await this.insertRedemptionAndUpdateLedger(
								{ keys: [voucherCodeId] },
								ledgerReferenceId,
								ledgerLinkId,
								sku_id,
								ledgerId,
								true,
								link_reference_id,
								reference_code_otp,
								deliveryMode,
								ledgerId,
								soft_link_token
							);

							return finalResponse;
						}
					}
				}
			}

			return {
				success: false,
				err_code: 'NO_HIS_ORD_FAIL',
			};
		} catch (e) {
			await new LogSys().error({
				handleFailedLedgerError: e,
			});
		}
	}

	async retryFailedVouchers() {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			/* Get Failed Link Ledgers */
			const failedLinksLedger = await get.getAllFailedLinkLedger();

			const allLedgerResponses = [];
			if (failedLinksLedger && failedLinksLedger.length) {
				for (let i = 0; i < failedLinksLedger.length; i++) {
					const failedLedger = failedLinksLedger[i];
					const ledgerId = failedLedger['id'];
					const ledgerReferenceId = failedLedger['reference_id'];
					const ledgerLinkId = failedLedger['reward_link']['id'];
					const ledgerLinkCampaign = failedLedger['reward_link']['reward_campaign']
						? failedLedger['reward_link']['reward_campaign']['name']
						: null;
					const ledgerVendorCode = failedLedger['vendor_code'];
					const ledgerAttempts = failedLedger['attempts'];
					const linkReferenceId = failedLedger['link_reference_id'] || '';
					const deliveryMode = failedLedger['reward_link']['reward_campaign']['delivery_mode'] || '';
					const reference_code_otp = failedLedger['reference_code_otp'] || '';
					const soft_link_token = failedLedger['soft_link_token'] || '';

					const failedLedResponse = await this.handleFailedLedger({
						ledgerId,
						ledgerReferenceId,
						ledgerLinkId,
						ledgerVendorCode,
						ledgerAttempts,
						ledgerLinkCampaign,
						linkReferenceId,
						deliveryMode,
						failedLedger,
						reference_code_otp,
						soft_link_token,
					});

					new LogSys().log({
						ref: ledgerReferenceId,
						ctr: ledgerAttempts,
						res: failedLedResponse,
					});

					allLedgerResponses.push(failedLedResponse);
				}
			}

			return {
				response: allLedgerResponses,
			};
		} catch (e) {
			await new LogSys().error({
				retryVoucherError: e,
			});
			return {
				success: false,
				message: 'Server Error, Please try later',
				err_code: 'RETRY_EXC_ERR',
			};
		}
	}

	/* Get Link Details & Voucher details for PDF @Parthiban N */
	async getVoucherDoc(linkId: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			const linkDetailsArr = await get.getLinkDetailsForPDF(linkId)
			const linkDetails = linkDetailsArr[0];

			if (linkDetails) {

				if (linkDetails['status'] == 'redeemed') {
					let responseData: any = [];
					return {
						"result": responseData,
						"success": true,
						"message": "Vouchers Fetched!"
					};
				}

				const linkEndDate = linkDetails["end_date"];
				const linkRewardCampaign = linkDetails["reward_campaign"];
				let linkPendingValue = linkDetails["pending_value"] * 1;

				/* Check Link Is Valid Or Expired */
				if (linkDetails && linkEndDate > new Date().toISOString() && linkPendingValue >= 1) {
					let sku_details = linkDetails["reward_campaign"]["new_catalogue"][0]["sp_reward_sku_id"];

					if (sku_details) {
						let sku_code = sku_details["sku"];
						let sku_value = parseInt(sku_details["value"]);

						if (!sku_code || !sku_value) {
							return {
								"success": false,
								"message": "SKU details Not Available",
								"err_code": "NO_BAL_ERR"
							};
						} else {
							let coupon_qty = parseInt(linkPendingValue / sku_value);

							if (coupon_qty == 0) {
								return {
									"success": false,
									"message": "Balance Not Available",
									"err_code": "NO_BAL_ERR"
								};
							}

							if ((coupon_qty * sku_value) > linkPendingValue) {
								return {
									"success": false,
									"message": "Balance Not Available",
									"err_code": "NO_BAL_ERR"
								};
							}
							const campaignName = linkDetails["reward_campaign"]["name"];
							const campaignNameR = campaignName + " - (R)";

							/* Update Balance */
							let newLinkBalance = 0.1;
							let updateLinkBalanceResponse = await set.updateLinkBalance(linkId, newLinkBalance);

							let sku_qty = coupon_qty;

							let total_success_product_count = 0;
							let total_product_count = coupon_qty;
							let remaining_vouchers_qty = 0;

							// Getting Vouchers from Inventory
							const voucherdetails: any = await get.getMultipleVoucherCode(sku_code, sku_qty);
							let vouchers_count = voucherdetails.length > 0 ? voucherdetails.length : 0;

							if (vouchers_count > 0) {
								if (vouchers_count == sku_qty) {
									remaining_vouchers_qty = 0;
									total_success_product_count = vouchers_count;
								} else {
									remaining_vouchers_qty = sku_qty - vouchers_count;
									total_success_product_count = vouchers_count;
								}

								const storeVouchers = await storeVoucherCode(voucherdetails, linkId, campaignNameR, sku_value, linkPendingValue);

								async function storeVoucherCode(voucherdetails, linkId, campaignNameR, voucher_value, linkPendingValue) {

									for (let i = 0; i < vouchers_count; i++) {
										let voucher_details = voucherdetails[i];

										/* Update Voucher Redeemed */
										let voucherCodeId = voucher_details["id"];

										const updateVoucherRedeemedResponse = await set.updateVoucherRedeemed(voucherCodeId, linkId, campaignNameR, "", "", true, "", "");

										if (updateVoucherRedeemedResponse) {
											/* Add to Link Ledger */
											new LogSys().log(`Adding Transaction to Ledger`);
											let addToLedgerId = await set.addTransactionToLedger(linkId, voucher_value, "debit", `inventory-${voucherCodeId}`, "created", "ZEUS_INVENTORY", null, null, null);
											/* Insert Redeemed Details */
											let insertRedemptionResponse = await set.insertVoucherRedemption(linkId, sku_code, voucherCodeId, null, null, 'direct_link', addToLedgerId, null);

											if (insertRedemptionResponse) {
												/* Update Order Status */
												new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:successful`);
												let updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(addToLedgerId, "successful", null, null);
											} else {
												/* Update Order Status */
												new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:failed`);
												let updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(addToLedgerId, "failed", null, null);


											}
										} else {

										}
									}
								}
							} else {
								remaining_vouchers_qty = sku_qty - vouchers_count;
								total_success_product_count = vouchers_count;
							}

							if (remaining_vouchers_qty > 0) {
								let max_item_request_count = process.env.MAX_ITEM_REQUEST_COUNT;
								let loops_count = remaining_vouchers_qty / max_item_request_count;
								if (Number.isInteger(loops_count)) {
									loops_count = loops_count;
								} else {
									loops_count = parseInt(loops_count) + 1;
								}

								let total_remaining_vouchers_qty = remaining_vouchers_qty;

								let request_qty = 0;

								for (let i = 0; i < loops_count; i++) {

									if (total_remaining_vouchers_qty > max_item_request_count) {
										request_qty = max_item_request_count;

										total_remaining_vouchers_qty = total_remaining_vouchers_qty - max_item_request_count;
									} else {
										request_qty = total_remaining_vouchers_qty;
										total_remaining_vouchers_qty = 0;
									}

									if (request_qty > 0) {
										let auto_generated_id = Math.floor((Math.random() * 100) + 1);
										const referenceId = sku_code + "-" + ((linkRewardCampaign["catalog_mode"] == "leq") ? (sku_value + "-") : ("")) + auto_generated_id + i + "-" + linkId;

										const voucherCodeFromVppReponse = await get.getMultipleVoucherCodeFromVpp(sku_code, sku_value, linkId, referenceId, campaignNameR, parseInt(request_qty));

										let isVppVoucherSuccess = voucherCodeFromVppReponse && voucherCodeFromVppReponse["success"];
										let isVppVoucherMessage = voucherCodeFromVppReponse && voucherCodeFromVppReponse["message"];
										let vendorCode = voucherCodeFromVppReponse && voucherCodeFromVppReponse["vendorCode"];

										if (isVppVoucherSuccess) {
											let voucherCodeDetails = voucherCodeFromVppReponse["response"];
											let voucherCodekeys = voucherCodeFromVppReponse["keys"];

											for (let j = 0; j < voucherCodeDetails.length; j++) {
												let voucherCodeResponse = voucherCodeDetails[j];

												total_success_product_count = total_success_product_count + 1;

												let unique_id = referenceId + '-' + voucherCodekeys[j];

												let voucherCodeId = voucherCodekeys[j];

												updateAPIVoucherDetails(voucherCodeResponse, unique_id, vendorCode, isVppVoucherSuccess, voucherCodeId);
											}
										} else {

											let request_qty_value = request_qty * sku_value;
											/* Add to Link Ledger */
											new LogSys().log(`Adding Transaction to Ledger`);
											const addToLedgerId = await set.addTransactionToLedger(linkId, request_qty_value, "debit", referenceId, "created", null, null, null, null);

											/* Call VPP API */
											new LogSys().log({ msg: "Getting Voucher from VPP", time: new Date().toISOString() });
											/* Get Voucher from VPP API */
											const voucherCodeFromVpp = await get.voucherCodeFromVpp(sku_code, request_qty_value, linkId, referenceId, campaignNameR, null, null, null, null);
											new LogSys().log({ msg: "Received Response from VPP", time: new Date().toISOString() });

											/* Update Order Status */
											new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:${isVppVoucherSuccess}`);
											const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(addToLedgerId, isVppVoucherSuccess ? "successful" : "failed", vendorCode, isVppVoucherMessage);

										}

										async function updateAPIVoucherDetails(voucherCodeResponse, unique_id, vendorCode, isVppVoucherSuccess, voucherCodeId) {
											/* Add to Link Ledger */
											new LogSys().log(`Adding Transaction to Ledger`);

											const addToLedgerId = await set.addTransactionToLedger(linkId, sku_value, "debit", unique_id, "created", null, null, null, null);

											/* Update Order Status */
											new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:${isVppVoucherSuccess}`);
											let updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(addToLedgerId, isVppVoucherSuccess ? "successful" : "failed", vendorCode, isVppVoucherMessage);

											new LogSys().log("VPP Voucher Received Successfully");

											let insertRedemptionResponse = await set.insertVoucherRedemption(linkId, sku_code, voucherCodeId, null, null, 'direct_link', addToLedgerId, null);


											new LogSys().log("Inserted Redemption Response" + JSON.stringify({ res: insertRedemptionResponse }));
										}
									}
								}
							}

							if (total_success_product_count == total_product_count) {
								let status = 'redeemed';

								newLinkBalance = 0;
								let LinkBalanceUpdateResponse = await set.updateLinkBalance(linkId, newLinkBalance);

								const updatelinkStatus = await set.updateLinkRedemptionStatus(linkId, status);

								let responseData: any = [];
								return {
									"result": responseData,
									"success": true,
									"message": "Vouchers Fetched!"
								};
							} else {
								return {
									"success": false,
									"message": "Something went wrong",
									"err_code": "NO_BAL_ERR"
								};
							}
						}
					} else {
						return {
							"success": false,
							"message": "SKU details Not Available",
							"err_code": "NO_BAL_ERR"
						};
					}
				} else {
					const isLinkExpired = linkEndDate > new Date().toISOString() ? false : true;
					return {
						"success": false,
						"message": isLinkExpired ? "Link Expired" : "Invalid Link",
						"error_tag": isLinkExpired ? "LINK_EXPIRED" : "INVALID_LINK",
						"err_code": "LNK_ERR"
					}
				}
			} else {
				return {
					"success": false,
					"message": "Link not found",
					"err_code": "UPD_VOU_RED_ERR"
				};
			}
		} catch (e) {
			await new LogSys().error({
				retryVoucherError: e
			});
			return {
				"success": false,
				"message": "Server Error, Please try later",
				"err_code": "RETRY_EXC_ERR"
			}
		}
	}
	/* End */

	async softlinkresend(linkId: any, sku: any, redemption_id: any, link_ledger: any) {
		try {
			new LogSys().log({ msg: 'Link resend Initilized:' + linkId, time: new Date().toISOString() });
			new LogSys().log({ msg: 'Link resend redemption_id:' + redemption_id, time: new Date().toISOString() });
			new LogSys().log({ msg: 'Link resend sku:' + sku, time: new Date().toISOString() });

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const linkDetailsArr = await get.getRefeanceLinkDetailsFromId(linkId);
			let getRedemptionDetails = redemption_id ? await get.getLinkredemptionsFromId(redemption_id) : {};
			const getLedgetDetails = link_ledger ? await get.getLedgerDetailsById(link_ledger) : {};
			const linkDetails = linkDetailsArr[0];
			new LogSys().log({ msg: 'get Link Details', time: new Date().toISOString() });

			let deliveryMode = linkDetails['reward_campaign'].delivery_mode || 'direct_link';
			let softLinkDeliveryMode =
				linkDetails['reward_campaign'].soft_link_delivery_mode == null
					? ['email']
					: linkDetails['reward_campaign'].soft_link_delivery_mode.length === 0
						? ['email']
						: linkDetails['reward_campaign'].soft_link_delivery_mode;
			new LogSys().log({ getRedemptionDetails: getRedemptionDetails, time: new Date().toISOString() });

			if (!redemption_id) {
				getRedemptionDetails = link_ledger ? await get.getLinkredemptionsFromLedgerId(link_ledger) : {};
				if (getRedemptionDetails) {
					redemption_id = getRedemptionDetails.redemption_id;
				} else {
					getRedemptionDetails = {};
				}
			}
			const to = linkDetails['email'];
			const mobile = linkDetails['phone'];
			const rcEmailRegards = linkDetails['reward_campaign'].email_regards;
			const link_reference_id = getRedemptionDetails['link_reference_id'] || getLedgetDetails['link_reference_id'];
			const old_reference_code_otp =
				getRedemptionDetails['reference_code_otp'] || getLedgetDetails['reference_code_otp'];
			// const reference_code_otp = await this.generateOTP();
			const reference_code_otp = old_reference_code_otp;

			let link_resend_count = getRedemptionDetails['link_resend_count'] || 0;
			let max_link_resend: any = config.max_link_resend || 3;
			max_link_resend = parseFloat(max_link_resend);
			link_resend_count = parseFloat(link_resend_count);
			const redeemed_mode = getRedemptionDetails['redeemed_mode'] || 'link';
			new LogSys().log({ msg: 'OTP generated', time: new Date().toISOString() });

			let soft_link_token = '';
			const user = {
				email: to,
				date: Date.now(),
			};

			let secretKey = config.secret_key;
			let expiresIn = config.expiresIn;
			new LogSys().log({ msg: 'expiresIn' + expiresIn, time: new Date().toISOString() });
			/* Check Link Is Valid Or Expired */
			soft_link_token = await this.generateToken(user, secretKey, expiresIn);
			/* Check Link Is Valid Or Expired */

			if (redeemed_mode == 'link' && link_reference_id) {
				if (link_resend_count < max_link_resend) {
					link_resend_count++;

					if (linkDetails) {
						if (redemption_id) {
							const updateOtp = await set.updateReferenceLinkandCode(
								link_reference_id,
								reference_code_otp,
								redemption_id,
								link_resend_count,
								soft_link_token
							);
						}
						new LogSys().log({ msg: 'updated OTP', time: new Date().toISOString() });
						if (link_ledger) {
							const updateLedgerOtp = await set.updateSoftLinkOtp(
								link_ledger,
								reference_code_otp,
								soft_link_token,
								link_resend_count
							);
						}
						let skuDetails: any = [];

						const voucherDetails = await get.voucherDetails(sku);

						skuDetails.push(voucherDetails);
						new LogSys().log({
							msg: 'Received Response voucherDetails' + JSON.stringify(voucherDetails),
							time: new Date().toISOString(),
						});

						let voucherValue: any = '';
						if (voucherDetails) {
							voucherValue = Number(voucherDetails['amount']) || 0;
						}

						new LogSys().log({ msg: 'Received Response from VPP', time: new Date().toISOString() });
						new LogSys().log('Link Code and Pin VPP Voucher Received Successfully');
						const now = new Date();
						const hoursToAdd = Number(config.expiresIn) || 0; // Default to 0 if invalid
						const future = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
						const token_expairy_on = this.expiryformatDate(future);
						let extra_params = {
							other_site_domain: config.custom_domain,
							link_reference_id: link_reference_id,
							reference_code_otp: reference_code_otp,
							type: 'link',
							brand: skuDetails || [],
							value: voucherValue,
							valid_till: linkDetails['end_date'],
							first_time_send: false,
							image_url: config.defaults.asset_base_url || '',
							soft_link_token: soft_link_token,
						};

						if (softLinkDeliveryMode.length !== 0) {
							new LogSys().log({ msg: 'extra_params:' + JSON.stringify(extra_params), time: new Date().toISOString() });
							softLinkDeliveryMode.forEach((mode) => {
								if (mode === 'email') {
									this.sendEmail(
										config.from_mail,
										to,
										reference_code_otp,
										rcEmailRegards,
										'reward-link-template',
										extra_params
									);
								} else if (mode === 'whatsapp') {
									this.sendWhatsapp(mobile, reference_code_otp, 'reward-link-template', extra_params);
								} else {
									this.sendEmail(
										config.from_mail,
										to,
										reference_code_otp,
										rcEmailRegards,
										'reward-link-template',
										extra_params
									);
								}
							});
						}

						return {
							success: true,
							message: 'Notification Sent Successfully!.',
						};
					} else {
						return {
							success: false,
							message: 'Notification Not Send!. Please Contact The Administrator.',
							err_code: 'LINK_NOT_FOUND',
						};
					}
				} else {
					return {
						success: false,
						message: 'Maximum Resend Limit Reached. Please Contact The Administrator.',
						err_code: 'DELIVERY_MODE_ERR',
					};
				}
			} else {
				return {
					success: false,
					message: 'Notification Not Send! Delivery Mode is not Link. Please Contact The Administrator.',
					err_code: 'DELIVERY_MODE_ERR',
				};
			}
		} catch (e) {
			await new LogSys().error({
				redeemVoucherError: e,
			});
			return {
				success: false,
				message: 'Please Contact The Administrator.',
				err_code: 'EXC_ERR',
			};
		}
	}

	async generateUniqueCode() {
		const get = new Getters(this.itemsService, this.accountabilitySchema);
		let randomChars = await this.generateRandomChars(config.max_random_chars);
		let checkExist = await get.checkRandomChars(randomChars);

		// Keep generating new codes until a unique one is found
		while (checkExist.length > 0) {
			randomChars = await this.generateRandomChars(config.max_random_chars);
			checkExist = await get.checkRandomChars(randomChars);
		}
		return randomChars;
	}

	async generateRandomChars(length: any) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let randomChars = '';
		for (let i = 0; i < length; i++) {
			const randomIndex = Math.floor(Math.random() * chars.length);
			randomChars += chars.charAt(randomIndex);
		}
		return randomChars;
	}

	async generateOTP() {
		// Generate a random 4-digit number
		const otp = Math.floor(1000 + Math.random() * 9000);
		return otp.toString();
	}


	async getTodayDate() {
		// Create a new Date object
		let today = new Date();
		const padZero = (num) => num.toString().padStart(2, '0');
		const day = padZero(today.getDate());
		const month = padZero(today.getMonth() + 1); // Months are zero-based
		const year = today.getFullYear().toString().slice(-2); // Get last 2 digits of the year
		const hours = today.getHours();
		const minutes = padZero(today.getMinutes());
		const seconds = padZero(today.getSeconds());
		const formattedHours = hours % 12 || 12; // Convert to 12-hour format and handle 0 as 12
		return `${day}-${month}-${year}-${formattedHours}:${minutes}:${seconds}`;
	}

	async getSoftLinkVouchers(link_reference_id: any, reference_code_otp: any, soft_link_token: any, env: any) {
		try {
			new LogSys().log({ msg: 'getLinkVouchers', time: new Date().toISOString() });
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			// Add job to queue for processing
			const queue = getQueueForClient('soft-link-queue')
			this.workerNode('soft-link-queue')
			const job = await queue.add('redeem', { link_reference_id, reference_code_otp, soft_link_token, env }, { removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } });
			// const worker = this.workerNode()

			const counts = await queue.getJobCounts();
			// Wait for job to complete
			const finallResult = await job.waitUntilFinished(queueEvents['soft-link-queue']);

			return finallResult;

		} catch (e) {
			await new LogSys().error({
				getLinkVouchers: e,
			});

			return {
				success: false,
				message: 'Not Found Record!.  Please Contact Administrator.',
			};
		}
	}

	async verifyToken(token: any, secretKey: any, expiry: number) {
		try {
			const decoded: any = jwt.verify(token, secretKey, { ignoreExpiration: true });
			new LogSys().log(`verifyToken decoded: ${JSON.stringify(decoded)}`);
			// Step 2: Manually check expiry using iat + custom expiry
			if (!decoded.iat) {
				return false;
			}

			const iat = decoded.iat; // issued at (in seconds)
			const expiryTimestamp = iat + (expiry * 3600);
			const currentTimestamp = Math.floor(Date.now() / 1000);
			new LogSys().log(`verifyToken expiryTimestamp: ${expiryTimestamp}`);
			new LogSys().log(`verifyToken currentTimestamp: ${currentTimestamp}`);

			if (currentTimestamp > expiryTimestamp) {
				new LogSys().log(`verifyToken- Token Expaired`);
				return false
				// Handle as expired
			} else {
				new LogSys().log(`verifyToken- Token valid`);

				return true
			}

			return false;
		} catch (err) {
			return false;
		}
	}

	async generateToken(user: any, secretKey: any, expiresIn: any) {
		const expireTime = 3600 * expiresIn;
		return jwt.sign(user, secretKey, { expiresIn: expireTime });
	}

	async generateVoucherBySkuBestVendor(sku: string, voucherValue: any, bestVendor: string, qty: any, referenceId: any) {
		try {

			new LogSys().log(
				`generateVoucherBySkuBestVendor:${sku} voucherValue:${voucherValue} qty:${qty} referenceId:${referenceId}`
			);

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let voucherCodeFromVpp: any = {};

			if (bestVendor === 'best_vendor') {
				voucherCodeFromVpp = await get.generateMultipleVoucherCodeFromVpp(sku, voucherValue, '', referenceId, '', qty);
			} else {
				voucherCodeFromVpp = await get.placeMultipleVoucherNewOrderVpp(sku, '', referenceId, '', qty, bestVendor);
			}


			new LogSys().log({ msg: 'Received Response from VPP', time: new Date().toISOString() });
			const isVppVoucherSuccess = voucherCodeFromVpp && voucherCodeFromVpp['success'];
			const voucherMessage = voucherCodeFromVpp && voucherCodeFromVpp['message'];
			const vendorCode = voucherCodeFromVpp && voucherCodeFromVpp['vendorCode'];
			/* Update Order Status */
			new LogSys().log(`generateVoucherBySkuBestVendor:${vendorCode} OrderStatus:${isVppVoucherSuccess}`);
			new LogSys().log(` voucherMessage:${voucherMessage} OrderStatus:${isVppVoucherSuccess}`);
			new LogSys().log(` vendorCode:${vendorCode}`);

			return isVppVoucherSuccess;
		} catch (error) {
			new LogSys().log(`generateVoucherBySkuBestVendor Error:${error}`);
			return false;
		}
	}

	async appendSL(code: any) {
		return `${code}-SL`;
	}

	async containsSL(code: any) {
		return code.includes('-SL');
	}

	async createErrorResponse() {
		return {
			success: false,
			message: 'Failed to fetch voucher,Please Contact Administrator!',
		};
	}

	async fetchVoucherCode(
		ledgerVendorCode: any,
		voucherSku: any,
		amount: any,
		referenceId: any,
		campaignNameR: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_order_id: any
	) {
		const get = new Getters(this.itemsService, this.accountabilitySchema);
		const set = new Setters(this.itemsService, this.accountabilitySchema);
		const apiVendorList: any = config.apiVendorList || [];
		new LogSys().log({
			msg: 'fetchVoucherCode apiVendorList ',
			apiVendorList: apiVendorList,
			VendorCode: ledgerVendorCode,
		});

		if (!ledgerVendorCode || ledgerVendorCode === 'ZEUS_INVENTORY' || ledgerVendorCode === 'best_vendor') {
			return await get.voucherCodeFromVpp(
				voucherSku,
				amount,
				referenceId,
				referenceId,
				campaignNameR,
				link_reference_id,
				reference_code_otp,
				false,
				soft_link_order_id
			);
		}

		if (apiVendorList.length !== 0) {
			if (apiVendorList.includes(ledgerVendorCode)) {
				return await get.placeNewVoucheForSoftLik(
					referenceId,
					referenceId,
					campaignNameR,
					ledgerVendorCode,
					voucherSku,
					link_reference_id,
					reference_code_otp,
					soft_link_order_id
				);
			}
		}
	}

	async logResponse(voucherCodeFromVpp: any) {
		new LogSys().log({ msg: 'Received Response from VPP', time: new Date().toISOString() });
		new LogSys().log(` vendorCode:${voucherCodeFromVpp?.vendorCode} OrderStatus:${voucherCodeFromVpp?.success}`);
		new LogSys().log(` voucherMessage:${voucherCodeFromVpp?.message} OrderStatus:${voucherCodeFromVpp?.success}`);
	}

	async handleVoucherRedemption(
		voucherCodeFromVpp: any,
		voucherSkuID: any,
		campaignNameR: any,
		link_reference_id: any,
		reference_code_otp: any,
		soft_link_order_id: any,
		reward_link: any,
		ledgerId: any,
		soft_link_token: any,
		skudetails: any,
		referenceId: any
	) {
		const get = new Getters(this.itemsService, this.accountabilitySchema);
		const set = new Setters(this.itemsService, this.accountabilitySchema);
		const voucherCodeResponse = voucherCodeFromVpp.response?.[0] || {};
		const voucherCode = {
			code: voucherCodeResponse.code || '',
			pin: voucherCodeResponse.pin || '',
			valid_till: voucherCodeResponse.expiry || '',
		};

		const voucherCodeId = voucherCodeFromVpp.keys?.[0];
		const updateRes = await set.updateSoftlinkVoucherRedeemedStatus(
			voucherCodeId,
			referenceId,
			campaignNameR,
			link_reference_id,
			reference_code_otp,
			true,
			soft_link_order_id,
			referenceId,
			true
		);
		new LogSys().log({
			msg: `updateSoftlinkVoucherRedeemedStatus ${JSON.stringify(updateRes)}`,
			time: new Date().toISOString(),
		});
		const insertRedemptionResponse = await set.insertVoucherRedemption(
			reward_link,
			voucherSkuID,
			voucherCodeId,
			link_reference_id,
			reference_code_otp,
			'link',
			ledgerId,
			soft_link_token
		);

		new LogSys().log(` insertRedemptionResponse:${insertRedemptionResponse}`);

		if (voucherCodeId && insertRedemptionResponse) {
			return {
				success: true,
				message: 'Voucher Fetched successfully!',
				amount: voucherCodeFromVpp.amount,
				voucher: voucherCode.code,
				pin: voucherCode.pin,
				valid_till: voucherCode.valid_till,
				brand_details: skudetails.brand || {},
			};
		}

		return this.createErrorResponse();
	}

	async expiryformatDate(date: any) {
		const pad = (n) => n.toString().padStart(2, '0');

		const day = pad(date.getDate());
		const month = pad(date.getMonth() + 1); // Month is 0-indexed
		const year = date.getFullYear();

		const hours = pad(date.getHours());
		const minutes = pad(date.getMinutes());
		const seconds = pad(date.getSeconds());

		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}



	private workers: { [key: string]: Worker } = {};

	async workerNode(jobName: any) {

		console.log("quque jobName--->", jobName)
		// Define the worker to process jobs in the queue
		if (!this.workers[jobName]) {
			this.workers[jobName] = new Worker(
				jobName, // Queue name
				async (job: any) => {
					try {

						switch (jobName) {

							case 'voucher-fetch-queue':
								new LogSys().log(`Processing job: ${jobName} with ID: ${job.id}`);
								// Call the processRedeemJob function with the job data
								const result = await this.processRedeemJob(job.data);
								return result;

							case 'soft-link-queue':
								const soft_link_result = await this.softLinkprocessRedeemJob(job.data);
								return soft_link_result;
								break;

							default:
								return {
									success: false,
									message: 'Job processing failed',
									err_code: 'JOB_NOT_FOUND_ERROR'
								};
								break;
						}



					} catch (error) {
						new LogSys().log(`Job error: ${error}`);
						new LogSys().log(`Job processing failed for job: ${job.id}`);
						return {
							success: false,
							message: 'Job processing failed',
							err_code: 'JOB_PROCESSING_ERROR'
						};
					}
				},
				{
					connection: connection,
					concurrency: 1,
					removeOnComplete: { count: 0 },
					removeOnFail: { count: 0 },
				}
			);
		}
		return this.workers[jobName];
	};

	async processRedeemJob(params: any) {
		const { linkId, sku, token, itemsService, accountabilitySchema } = params;
		// Input validation
		if (!linkId || !sku || !token) {
			new LogSys().log({ msg: 'Validation failed: Missing required parameters', linkId, sku, token });
			return {
				success: false,
				message: 'Missing required parameters: linkId, sku, or token',
				err_code: 'INVALID_INPUT',
			};
		}
		const get = new Getters(itemsService || this.itemsService, accountabilitySchema || this.accountabilitySchema);
		const set = new Setters(itemsService || this.itemsService, accountabilitySchema || this.accountabilitySchema);

		try {
			const linkDetailsArr = await get.getLinkDetailsFromId(linkId);
			if (!linkDetailsArr || linkDetailsArr.length === 0) {
				new LogSys().log({ msg: 'Validation failed: Invalid linkId, link not found', linkId });
				return {
					success: false,
					message: 'Invalid linkId: link not found',
					err_code: 'LINK_NOT_FOUND',
				};
			}
			const skuDetails = await get.getSkuBrandMapping(sku);
			if (!skuDetails || !skuDetails.id) {
				new LogSys().log({ msg: 'Validation failed: Invalid sku, SKU not found', sku });
				return {
					success: false,
					message: 'Invalid sku: SKU not found',
					err_code: 'SKU_NOT_FOUND',
				};
			}
			const sku_id = skuDetails.id;
			const linkDetails = linkDetailsArr[0];
			// Validate voucher value
			const voucherDetails = await get.voucherDetails(sku);
			const voucherValue = Number(voucherDetails?.amount) || 0;
			if (!voucherValue || voucherValue <= 0) {
				new LogSys().log({ msg: 'Validation failed: Invalid voucher value for this SKU', sku, voucherValue });
				return {
					success: false,
					message: 'Invalid voucher value for this SKU',
					err_code: 'INVALID_VOUCHER_VALUE',
				};
			}
			let deliveryMode = linkDetails['reward_campaign'].delivery_mode || 'direct_link';
			let redeemed_mode = linkDetails['reward_campaign'].delivery_mode || 'direct_link';
			const brandLimitation = linkDetailsArr[0]['reward_campaign']['brand_limitation'] || [];
			let softLinkDeliveryMode =
				linkDetails['reward_campaign'].soft_link_delivery_mode == null
					? ['email']
					: linkDetails['reward_campaign'].soft_link_delivery_mode.length === 0
						? ['email']
						: linkDetails['reward_campaign'].soft_link_delivery_mode;
			const linkEndDate = linkDetails['end_date'];
			const linkRewardCampaign = linkDetails['reward_campaign'];
			const linkPendingValue = linkDetails['pending_value'] * 1;
			const referenceId =
				sku + '-' + (linkRewardCampaign['catalog_mode'] == 'leq' ? linkPendingValue + '-' : '') + linkId;

			//manually selecting voucher vendor
			const voucherVendor: any = linkRewardCampaign['voucher_vendor'] || 'best_vendor';

			const to = linkDetails['email'] || '';
			const mobile = linkDetails['phone'] || '';
			const rcEmailRegards = linkDetails['reward_campaign'].email_regards;
			/* Check Link Is Valid Or Expired */
			if (linkDetails && linkEndDate > new Date().toISOString()) {
				new LogSys().log('Fetched Link Details');
				/* Verify Token Valid */
				const isTokenValid =
					token == linkDetails['token'] &&
					linkDetails['token_last_updated'] >= new Date(new Date().getTime() - 5 * 60 * 1000).toISOString();

				if (!isTokenValid) {
					new LogSys().log({ msg: 'Validation failed: Token invalid or expired', token, linkToken: linkDetails['token'], token_last_updated: linkDetails['token_last_updated'] });
				}

				if (isTokenValid) {
					new LogSys().log('Checked Token Valid');

					let skuDetails: any = [];

					const voucherDetails = await get.voucherDetails(sku);
					skuDetails.push(voucherDetails);
					let voucherValue: any = '';
					const brandName = voucherDetails.brand['brand_name'];
					if (voucherDetails) {
						voucherValue = Number(voucherDetails['amount']) || 0;
					}

					/* Check Link and Balance Value */
					if (voucherDetails && voucherValue <= linkPendingValue) {
						let monthly_limit_utilized_after_redeem = 0
						let overall_limit_utilized_after_redeem = 0
						let getBrandLimitationDetailsResponse: any = [];
						let overall_limit = 0;
						let monthly_limit = 0;
						let currentMonthData = []
						///Brand Limitation Check
						///If the brand limitation is configured, then we need to check the brand limitation for the brand.
						///If the brand limitation is not configured, then we need to check the brand limitation for the brand.
						///If the brand limitation is configured, then we need to check the brand limitation for the brand.	
						if (brandLimitation.length > 0) {
							const matchedBrand = brandLimitation.find((brandDetails: any) =>
								brandDetails.brand && brandDetails.brand.brand_name === brandName
							);

							if (matchedBrand) {
								overall_limit = matchedBrand['overall_limit'] || 0;
								monthly_limit = matchedBrand['monthly_limit'] || 0;

								const matched_brand_name = matchedBrand.brand['brand_name'];
								monthly_limit_utilized_after_redeem = voucherValue;
								overall_limit_utilized_after_redeem = voucherValue;

								getBrandLimitationDetailsResponse = await get.getUserBrandWiseRedemptions(
									linkDetailsArr[0]['reward_campaign']['id'],
									to,
									mobile,
									matched_brand_name
								);

								if (getBrandLimitationDetailsResponse?.length > 0) {
									currentMonthData = getBrandLimitationDetailsResponse;

									const overall_limit_utilized = getBrandLimitationDetailsResponse[0]['overall_limit_utilized'] || 0;
									const monthly_limit_utilized = getBrandLimitationDetailsResponse[0]['monthly_limit_utilized'] || 0;

									monthly_limit_utilized_after_redeem = Number(monthly_limit_utilized) + voucherValue;
									overall_limit_utilized_after_redeem = Number(overall_limit_utilized) + voucherValue;


									if (overall_limit > 0 && overall_limit_utilized_after_redeem > overall_limit) {
										new LogSys().log(`Brand Overall Limit Reached: ${matched_brand_name} - ${overall_limit} - Used: ${overall_limit_utilized_after_redeem}`);
										return {
											success: false,
											message: matchedBrand['overall_error_message'] || 'Reached the maximum limit of this brand',
										};
									}

									if (monthly_limit > 0 && monthly_limit_utilized_after_redeem > monthly_limit) {
										new LogSys().log(`Brand Monthly Limit Reached: ${matched_brand_name} - ${monthly_limit} - Used: ${monthly_limit_utilized_after_redeem}`);
										return {
											success: false,
											message: matchedBrand['monthly_error_message'] || 'Reached the maximum limit of this brand for this month',
										};
									}
								}
							}
						}

						const voucherList = await get.voucherCodeList(sku);
						const inventoryQty: any = config.inventoryQty;
						const soft_link_inventory_qty: any = config.softlLinkInventoryQty;
						let isGenerated = true;


						///Need to maintain the inventory in Zeus with the minimum configured quantity.
						if (voucherList.length < inventoryQty && deliveryMode === 'direct_link') {
							const qty = inventoryQty - voucherList.length;
							isGenerated = await this.generateVoucherBySkuBestVendor(sku, voucherValue, voucherVendor, qty, referenceId);
							new LogSys().log(`Voucher Generated:${deliveryMode} - ${isGenerated}`);

						}

						///Soft link Need to maintain the inventory in Zeus with the minimum configured quantity.
						if (voucherList.length < soft_link_inventory_qty && deliveryMode === 'link') {
							const qty = soft_link_inventory_qty - voucherList.length;
							isGenerated = await this.generateVoucherBySkuBestVendor(sku, voucherValue, voucherVendor, qty, referenceId);
							new LogSys().log(`Voucher Generated:${deliveryMode} - ${isGenerated}`);
						}

						new LogSys().log('Checked Balance Available');

						/* Get Voucher Code */
						let voucherCode: any = '';
						let randomChars: any = '';
						let reference_code_otp: any = '';
						let giftcard_status: any = false;
						let soft_link_order_id: any = '';
						let link_ledger_reference_id: any = '';
						let soft_link_token = '';
						const user = {
							email: to,
							date: Date.now(),
						};
						let secretKey = config.secret_key;
						let expiresIn = config.expiresIn;
						const campaignName = linkDetails['reward_campaign']['name'];
						const campaignNameR = campaignName + ' - (R)';
						const platform = "reward-links";
						let link_reference_id = "";

						if (deliveryMode === 'link') {
							voucherCode = await get.voucherCode(sku);
							randomChars = await this.generateUniqueCode();
							reference_code_otp = await this.generateOTP();
							soft_link_token = await this.generateToken(user, secretKey, expiresIn);
						} else {
							voucherCode = await get.voucherCode(sku);

						}


						link_reference_id = randomChars;
						const now = new Date();
						const hoursToAdd = Number(config.expiresIn) || 0; // Default to 0 if invalid
						const future = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
						const token_expairy_on = this.expiryformatDate(future);
						/*object for Email*/
						let extra_params = {
							other_site_domain: config.custom_domain,
							link_reference_id: randomChars,
							reference_code_otp: reference_code_otp,
							type: 'link',
							brand: skuDetails || [],
							value: voucherValue,
							valid_till: linkDetails['end_date'],
							first_time_send: true,
							image_url: config.defaults.asset_base_url || '',
							soft_link_token: soft_link_token
						};



						if (voucherCode && Object.keys(voucherCode).length > 0 && voucherCode.id) {

							new LogSys().log('Got Voucher from Gift Card Inventory');
							/* Update Voucher Redeemed */
							const voucherCodeId = voucherCode['id'];
							let inventory_vendor_code = 'ZEUS_INVENTORY';
							if (voucherVendor !== 'best_vendor') {
								inventory_vendor_code = voucherVendor;
							}
							const voucherCore = {
								code: voucherCode['code'],
								pin: voucherCode['pin'],
								valid_till: voucherCode['validity'],
								amount: voucherCode['price'],
							};

							let orderid = '';
							let updateVoucherRedeemedResponse: any = [];

							if (deliveryMode === 'link') {
								//If the delivery mode is 'link', it means a soft link, and the VPP order ID concatenation happens here.
								soft_link_order_id = sku + '-' + randomChars;
								orderid = '';
								link_ledger_reference_id = referenceId;

								if (softLinkDeliveryMode.length !== 0) {
									softLinkDeliveryMode.forEach((mode) => {
										if (mode === 'email') {
											this.sendEmail(
												config.from_mail,
												to,
												reference_code_otp,
												rcEmailRegards,
												'reward-link-template',
												extra_params
											);
											new LogSys().log('Email Notification sent!');
										} else if (mode === 'whatsapp') {
											this.sendWhatsapp(mobile, reference_code_otp, 'reward-link-template', extra_params);
											new LogSys().log('Whatsup Notification sent!');
										} else {
											this.sendEmail(
												config.from_mail,
												to,
												reference_code_otp,
												rcEmailRegards,
												'reward-link-template',
												extra_params
											);
											new LogSys().log('Email Notification sent!');
										}
									});
								}
							} else {
								const updateVoucherRedeemedResponse = await set.updateVoucherRedeemed(
									voucherCodeId,
									referenceId,
									campaignNameR,
									link_reference_id,
									reference_code_otp,
									true,
									soft_link_order_id,
									referenceId
								);

							}

							/* Update Balance  and status redeemed */
							const newLinkBalance = linkPendingValue - voucherValue;
							const updateLinkBalanceResponse = await set.updateLinkBalance(linkId, newLinkBalance);

							if (updateLinkBalanceResponse) {
								/* Add to Link Ledger */
								let addToLedgerId = {};
								if (deliveryMode !== 'link') {
									new LogSys().log(`Adding Direct redeem Transaction to Ledger`);
									addToLedgerId = await set.addTransactionToLedger(
										linkId,
										voucherValue,
										'debit',
										referenceId,
										'created',
										inventory_vendor_code,
										link_reference_id,
										reference_code_otp,
										soft_link_token
									);
								} else {
									new LogSys().log(`Adding Soft link redeem Transaction to Ledger`);
									addToLedgerId = await set.addTransactionToLedger(
										linkId,
										voucherValue,
										'debit',
										referenceId,
										'created',
										inventory_vendor_code,
										link_reference_id,
										reference_code_otp,
										soft_link_token
									);
								}

								let insertRedemptionResponse = {};
								if (deliveryMode !== 'link') {
									insertRedemptionResponse = await set.insertVoucherRedemption(
										linkId,
										sku_id,
										voucherCodeId,
										randomChars,
										reference_code_otp,
										redeemed_mode,
										addToLedgerId,
										soft_link_token
									);
								}

								if (brandLimitation.length > 0) {
									if (currentMonthData && currentMonthData.length > 0) {
										//update the brand limitation details
										const updateBrandLimitationDetailsResponse = await set.updateBrandLimitationDetails(currentMonthData[0]['id'], monthly_limit_utilized_after_redeem, overall_limit_utilized_after_redeem);
										if (updateBrandLimitationDetailsResponse) {
											new LogSys().log(`Brand Limitation Details Updated:${updateBrandLimitationDetailsResponse}`);
										}
									} else {
										// insert the brand limitation details

										const insertBrandLimitationDetailsResponse = await set.insertBrandLimitationDetails(
											linkDetailsArr[0]['reward_campaign']['id'],
											to,
											mobile,
											brandName,
											monthly_limit_utilized_after_redeem,
											overall_limit_utilized_after_redeem
										);
										if (insertBrandLimitationDetailsResponse) {
											new LogSys().log(`Brand Limitation Details Inserted:${insertBrandLimitationDetailsResponse}`);
										}
									}

								}
								/* Insert Redeemed Details */
								if (addToLedgerId) {
									/* Update Order Status */
									new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:successful`);
									const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(
										addToLedgerId,
										'successful',
										null,
										null
									);



									return {
										success: true,
										amount: voucherCore.amount,
										message: 'Voucher Successfully Fetched!',
										voucher: deliveryMode === 'link' ? '' : voucherCore.code,
										pin: deliveryMode === 'link' ? '' : voucherCore.pin,
										valid_till: deliveryMode === 'link' ? '' : voucherCore.valid_till,
									};
								} else {
									/* Update Order Status */
									new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:failed`);
									const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(
										addToLedgerId,
										'failed',
										null,
										null
									);

									return {
										success: false,
										message: 'Voucher Redemption Error',
										err_code: 'INS_VOU_RED_ERR',
									};
								}
							} else {
								return {
									success: false,
									message: 'Voucher Redemption Error',
									err_code: 'UPD_BAL_ERR',
								};
							}
						} else {

							/* Update Balance */
							const newLinkBalance = linkPendingValue - voucherValue;
							const updateLinkBalanceResponse = await set.updateLinkBalance(linkId, newLinkBalance);

							if (updateLinkBalanceResponse) {
								new LogSys().log(`Balance of link:${linkId} Updated To: ${newLinkBalance}`);

								/* Add to Link Ledger */
								new LogSys().log(
									`Adding Transaction to Ledger ${link_reference_id}${reference_code_otp}${soft_link_token}`
								);
								const addToLedgerId = await set.addTransactionToLedger(
									linkId,
									voucherValue,
									'debit',
									referenceId,
									'created',
									null,
									link_reference_id,
									reference_code_otp,
									soft_link_token
								);

								/* Call VPP API */
								new LogSys().log({ msg: 'Getting Voucher from VPP', time: new Date().toISOString() });
								let voucherCodeFromVpp: any = [];


								/* Get Voucher from VPP API */
								if (voucherVendor === 'best_vendor') {

									if (deliveryMode == 'link') {
										soft_link_order_id = sku + '-' + randomChars;
										voucherCodeFromVpp = await get.voucherCodeFromVpp(
											sku,
											voucherValue,
											'',
											referenceId,
											campaignNameR,
											'',
											'',
											giftcard_status,
											''
										);
									} else {
										giftcard_status = true;
										voucherCodeFromVpp = await get.voucherCodeFromVpp(
											sku,
											voucherValue,
											referenceId,
											referenceId,
											campaignNameR,
											'',
											'',
											giftcard_status,
											''
										);
									}
								} else {

									if (deliveryMode == 'link') {
										soft_link_order_id = sku + '-' + randomChars;
										voucherCodeFromVpp = await get.placeNewOrderVpp(
											referenceId,
											'',
											campaignNameR,
											voucherVendor,
											sku,
											link_reference_id,
											'',
											''
										);
									} else {
										giftcard_status = true;
										voucherCodeFromVpp = await get.placeNewOrderVpp(
											referenceId,
											referenceId,
											campaignNameR,
											voucherVendor,
											sku,
											'',
											'',
											''
										);
									}
								}


								new LogSys().log({ msg: 'Received Response from VPP', time: new Date().toISOString() });

								const isVppVoucherSuccess = voucherCodeFromVpp && voucherCodeFromVpp['success'];
								const voucherMessage = voucherCodeFromVpp && voucherCodeFromVpp['message'];
								const vendorCode = voucherCodeFromVpp && voucherCodeFromVpp['vendorCode'];
								/* Update Order Status */
								new LogSys().log(`Updating Ledger:${vendorCode} OrderStatus:${isVppVoucherSuccess}`);
								new LogSys().log(`Updating vendorCode:${vendorCode} OrderStatus:${isVppVoucherSuccess}`);
								new LogSys().log(`Updating voucherMessage:${voucherMessage} OrderStatus:${isVppVoucherSuccess}`);

								const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(
									addToLedgerId,
									isVppVoucherSuccess ? 'successful' : 'failed',
									vendorCode,
									voucherMessage
								);
								if (brandLimitation.length > 0) {
									new LogSys().log(`VPP API CALL-Brand Limitation Details`);

									if (currentMonthData && currentMonthData.length > 0) {
										//update the brand limitation details
										const updateBrandLimitationDetailsResponse = await set.updateBrandLimitationDetails(currentMonthData[0]['id'], monthly_limit_utilized_after_redeem, overall_limit_utilized_after_redeem);
										if (updateBrandLimitationDetailsResponse) {
											new LogSys().log(`VPP API CALL-Brand Limitation Details Updated:${updateBrandLimitationDetailsResponse}`);
										}
									} else {
										// insert the brand limitation details

										const insertBrandLimitationDetailsResponse = await set.insertBrandLimitationDetails(
											linkDetailsArr[0]['reward_campaign']['id'],
											to,
											mobile,
											brandName,
											monthly_limit_utilized_after_redeem,
											overall_limit_utilized_after_redeem
										);
										if (insertBrandLimitationDetailsResponse) {
											new LogSys().log(`VPP API CALL-Brand Limitation Details Inserted:${insertBrandLimitationDetailsResponse}`);
										}
									}

								}

								if (isVppVoucherSuccess) {
									if (deliveryMode == 'link') {
										// let getRandomLinkUpdateResponse = await set.updateReferenceLinkandCode(randomChars, reference_code_otp, linkId, 0,soft_link_token);

										if (softLinkDeliveryMode.length !== 0) {
											softLinkDeliveryMode.forEach((mode) => {
												if (mode === 'email') {
													this.sendEmail(
														config.from_mail,
														to,
														reference_code_otp,
														rcEmailRegards,
														'reward-link-template',
														extra_params
													);
												} else if (mode === 'whatsapp') {
													this.sendWhatsapp(mobile, reference_code_otp, 'reward-link-template', extra_params);
												} else {
													this.sendEmail(
														config.from_mail,
														to,
														reference_code_otp,
														rcEmailRegards,
														'reward-link-template',
														extra_params
													);
												}
											});
										}
									}

									new LogSys().log('VPP Voucher Received Successfully' + JSON.stringify({ res: voucherCodeFromVpp }));

									const voucherCodeId = voucherCodeFromVpp.keys[0];
									const voucherCodeResponse = voucherCodeFromVpp.response[0];

									let voucherCore = {
										code: '',
										pin: '',
										valid_till: '',
									};
									if (voucherCodeResponse['code']) {
										voucherCore = {
											code: voucherCodeResponse['code'],
											pin: voucherCodeResponse['pin'],
											valid_till: voucherCodeResponse['expiry'],
										};
									}

									if (deliveryMode !== 'link') {
										const insertRedemptionResponse = await set.insertVoucherRedemption(
											linkId,
											sku_id,
											voucherCodeId,
											randomChars,
											reference_code_otp,
											redeemed_mode,
											addToLedgerId,
											soft_link_token
										);
									}
									/* Insert Redeemed Details */
									new LogSys().log('Inserted Redemption Response');
									return {
										success: true,
										amount: voucherValue,
										message: 'Voucher Successfully Fetched!',
										voucher: deliveryMode === 'link' ? '' : voucherCore.code,
										pin: deliveryMode === 'link' ? '' : voucherCore.pin,
										valid_till: deliveryMode === 'link' ? '' : voucherCore.valid_till,
									};
								} else {
									new LogSys().log('VPP Failure');
									new LogSys().log({
										msg: 'VPP Response',
										time: new Date().toISOString(),
										response: voucherCodeFromVpp,
									});
									return {
										success: false,
										message: 'Please contact Administrator',
										err_code: 'VPP_FAIL_ERR',
									};
								}
							} else {
								new LogSys().log('Balance Updatation Failure');
								return {
									success: false,
									message: 'Voucher Redemption Error',
									err_code: 'VPP_UPD_BAL_ERR',
								};
							}
						}
					} else {
						new LogSys().log('Balance Unavailable');
						/* Balance Not Available */
						return {
							success: false,
							message: 'Balance Not Available',
							err_code: 'NO_BAL_ERR',
						};
					}
				} else {
					new LogSys().log("Token Expired");
					return {
						success: false,
						message: "Link Expired",
						error_tag: "LINK_EXPIRED",
						err_code: "EXP_LNK_ERR"
					};
				}
			} else {
				const isLinkExpired = linkEndDate > new Date().toISOString() ? false : true;
				return {
					success: false,
					message: isLinkExpired ? 'Link Expired' : 'Invalid Link',
					error_tag: isLinkExpired ? 'LINK_EXPIRED' : 'INVALID_LINK',
					err_code: 'LNK_ERR',
				};
			}




		} catch (e) {
			console.log("Redeem Voucher Error", e);
			await new LogSys().error({ redeemVoucherError: e });
			return {
				success: false,
				message: 'Please contact Administrator',
				err_code: 'EXC_ERR',
			};
		}
	}

	async softLinkprocessRedeemJob(params: any) {
		const { link_reference_id, reference_code_otp, soft_link_token, env, itemsService, accountabilitySchema } = params;
		const get = new Getters(itemsService || this.itemsService, accountabilitySchema || this.accountabilitySchema);
		const set = new Setters(itemsService || this.itemsService, accountabilitySchema || this.accountabilitySchema);

		try {
			const isValid = await this.verifyToken(
				soft_link_token,
				env.SOFT_LINK_SECRET_KEY,
				env.SOFT_LINK_TOKEN_EXPIRE_INPUT
			);

			new LogSys().log({ msg: `getLinkVouchers status : ${isValid}`, time: new Date().toISOString() });

			if (isValid) {
				//get vouchers from LINK_REWARD_REDEMPTIONS_TABLE
				let getResponse = await get.softLinkOtpVerification(link_reference_id, reference_code_otp);
				new LogSys().log({ msg: `getLinkVouchers getResponse ${getResponse}`, time: new Date().toISOString() });

				let newVouchersResponse = {
					success: false,
					message: 'Voucher Not Fetched! Please Contact Administrator',
					amount: '',
					voucher: '',
					pin: '',
					valid_till: '',
					brand_details: {},
				};
				if (getResponse.length !== 0) {
					const id = getResponse[0].redemption_id;
					const sku_id = getResponse[0].brand_sku.id;
					getResponse[0].brand_sku.brand.brand_name = getResponse[0].brand_sku.brand.brand_name;
					getResponse[0].brand_sku.brand.brand_image = getResponse[0].brand_sku.brand.brand_image;

					let voucherDetails = await get.getZeusVoucherCode(id);

					if (voucherDetails.pin) {
						newVouchersResponse.voucher = voucherDetails.code;
						newVouchersResponse.pin = voucherDetails.pin;
						newVouchersResponse.valid_till = voucherDetails.validity;
						newVouchersResponse.amount = voucherDetails.price;
						newVouchersResponse.brand_details = getResponse[0].brand_sku.brand;
						newVouchersResponse.message = 'Voucher Fetched Successfully!';
						newVouchersResponse.success = true;
					}

					return newVouchersResponse;
				} else {
					let getLedger = await get.getLinkLedger(link_reference_id, reference_code_otp);

					if (getLedger.length > 0) {
						const voucherSku = getLedger[0].reference_id ? getLedger[0].reference_id.split('-')[0] : null;
						const skuDetails = await get.getSkuBrandMapping(voucherSku);
						const sku_id = skuDetails.id;
						const amount = getLedger[0].amount;
						const reward_link = getLedger[0].reward_link.id;
						const soft_link_token = getLedger[0].soft_link_token;
						const ledgerId = getLedger[0].id;
						const soft_link_order_id = link_reference_id + '-' + voucherSku;
						const campaignName = getLedger[0].reward_link.reward_campaign.name;
						const ledgerVendorCode = getLedger[0].reward_link.reward_campaign.voucher_vendor || 'best_vendor';
						const referenceId = getLedger[0].reference_id
						const campaignNameR = campaignName + ' - (R)';
						const sku = getLedger[0].reference_id ? getLedger[0].reference_id.split("-")[0] : null;
						const link_ledger_reference_id = getLedger[0].reference_id;
						const deliveryMode = 'link';
						const platform = "softlink";

						if (voucherSku && amount) {
							new LogSys().log({
								msg: `getLinkVouchers ledgerId ${ledgerId}  voucherSku ${voucherSku} amount: ${amount}`,
								time: new Date().toISOString(),
							});
							const skudetails = await get.voucherDetails(voucherSku);
							const getLedgerDetails = ledgerId ? await get.getLinkredemptionsFromLedgerId(ledgerId) : {};
							new LogSys().log({
								msg: `getLedgerDetails ${JSON.stringify(getLedgerDetails)}`,
								time: new Date().toISOString(),
							});
							if (!getLedgerDetails) {
								const getZeusVoucherCodeByLedgeDetails = await get.getZeusVoucherCodeByLedgerReferenceId(
									getLedger[0].reference_id
								);

								new LogSys().log({
									msg: `getZeusVoucherCodeByLedgeDetails ${JSON.stringify(getZeusVoucherCodeByLedgeDetails)}`,
									time: new Date().toISOString(),
								});
								if (!getZeusVoucherCodeByLedgeDetails?.id) {
									//fetch inventory from zeus
									let voucherDetails = await get.voucherCode(sku);
									if (voucherDetails && Object.keys(voucherDetails).length > 0 && voucherDetails.id) {
										new LogSys().log({
											msg: `getLinkVouchers voucherDetails id ${voucherDetails.id}`,
											time: new Date().toISOString(),
										});
										new LogSys().log({
											msg: `getLinkVouchers voucherDetails gift_card id ${voucherDetails.gift_card}`,
											time: new Date().toISOString(),
										});
										const updateVoucherRedeemedResponse = await set.updateSoftlinkVoucherRedeemedStatus(
											voucherDetails.id,
											referenceId,
											campaignNameR,
											link_reference_id,
											reference_code_otp,
											true,
											soft_link_order_id,
											link_ledger_reference_id,
											true
										);


										const getredemptions = await get.getLinkredemptionsFromId(voucherDetails.id);
										new LogSys().log({
											msg: `getLinkVouchers getredemptions ${getredemptions}`,
											time: new Date().toISOString(),
										});

										let insertRedemptionResponse = {};
										if (!getredemptions) {
											insertRedemptionResponse = await set.insertVoucherRedemption(
												reward_link,
												sku_id,
												voucherDetails.id,
												link_reference_id,
												reference_code_otp,
												'link',
												ledgerId,
												soft_link_token
											);
											new LogSys().log({
												msg: `getLinkVouchers insertRedemptionResponse ${insertRedemptionResponse}`,
												time: new Date().toISOString(),
											});
										}

										if (voucherDetails.pin && insertRedemptionResponse) {
											newVouchersResponse.voucher = voucherDetails.code;
											newVouchersResponse.pin = voucherDetails.pin;
											newVouchersResponse.valid_till = voucherDetails.validity;
											newVouchersResponse.amount = amount;
											newVouchersResponse.brand_details = skudetails.brand || {};
											newVouchersResponse.message = 'Voucher Fetched successfully!';
											newVouchersResponse.success = true;

											new LogSys().log({
												msg: `getLinkVouchers ${insertRedemptionResponse}`,
												time: new Date().toISOString(),
											});

											return newVouchersResponse;
										} else {
											return newVouchersResponse;
										}
									} else {

										new LogSys().log({ msg: 'voucher Details Not Found ', time: new Date().toISOString() });

										let voucherCodeFromVpp: any = await this.fetchVoucherCode(
											ledgerVendorCode,
											voucherSku,
											amount,
											getLedger[0].reference_id,
											campaignNameR,
											'',
											'',
											''
										);


										this.logResponse(voucherCodeFromVpp);

										if (!voucherCodeFromVpp?.success) {
											new LogSys().log({ msg: `voucherCodeFromVpp?.success ${voucherCodeFromVpp?.success}`, time: new Date().toISOString() });

											return this.createErrorResponse();
										}

										const voucherCodeId = voucherCodeFromVpp.keys?.[0];
										new LogSys().log({ msg: `voucherCodeId ${voucherCodeId}`, time: new Date().toISOString() });

										const inventoryDetails = await get.getVoucherCodeById(voucherCodeId);

										if (inventoryDetails.length !== 0 && !inventoryDetails[0].gift_card) {
											voucherCodeFromVpp.amount = inventoryDetails[0].price;
											return await this.handleVoucherRedemption(
												voucherCodeFromVpp,
												sku_id,
												campaignNameR,
												link_reference_id,
												reference_code_otp,
												soft_link_order_id,
												reward_link,
												ledgerId,
												soft_link_token,
												skudetails,
												getLedger[0].reference_id
											);
										} else if (!(await this.containsSL(getLedger[0].reference_id))) {

											new LogSys().log({ msg: `if inventory Details Not Found ${getLedger[0].reference_id}`, time: new Date().toISOString() });

											const refId = await this.appendSL(getLedger[0].reference_id);
											const updateRes = await set.updateSoftReferenceId(getLedger[0].id, refId);
											new LogSys().log({ msg: `if inventory Details Not Found ${refId} updateRes: ${updateRes}`, time: new Date().toISOString() });

											if (updateRes) {
												new LogSys().log({ msg: `New Request refId: ${refId}`, time: new Date().toISOString() });

												voucherCodeFromVpp = await this.fetchVoucherCode(
													ledgerVendorCode,
													voucherSku,
													amount,
													refId,
													campaignNameR,
													'',
													'',
													''
												);
												const voucherCodeId = voucherCodeFromVpp.keys?.[0];


												const inventoryDetails = await get.getVoucherCodeById(voucherCodeId);
												this.logResponse(voucherCodeFromVpp);

												if (!voucherCodeFromVpp?.success) {
													return this.createErrorResponse();
												}
												voucherCodeFromVpp.amount = inventoryDetails[0].price;

												return await this.handleVoucherRedemption(
													voucherCodeFromVpp,
													sku_id,
													campaignNameR,
													link_reference_id,
													reference_code_otp,
													soft_link_order_id,
													reward_link,
													ledgerId,
													soft_link_token,
													skudetails,
													getLedger[0].reference_id
												);
											}
										}
									}
								} else {
									if (getZeusVoucherCodeByLedgeDetails?.id) {
										const getLinkredemptionsDetails = await get.getLinkredemptionsFromId(
											getZeusVoucherCodeByLedgeDetails.id
										);
										if (!getLinkredemptionsDetails) {
											const insertRedemptionResponse = await set.insertVoucherRedemption(
												reward_link,
												sku_id,
												getZeusVoucherCodeByLedgeDetails.id,
												link_reference_id,
												reference_code_otp,
												'link',
												ledgerId,
												soft_link_token
											);
										}

										newVouchersResponse.voucher = getZeusVoucherCodeByLedgeDetails.code;
										newVouchersResponse.pin = getZeusVoucherCodeByLedgeDetails.pin;
										newVouchersResponse.valid_till = getZeusVoucherCodeByLedgeDetails.validity;
										newVouchersResponse.amount = getZeusVoucherCodeByLedgeDetails.price;
										newVouchersResponse.brand_details = skudetails.brand;
										newVouchersResponse.message = 'Voucher Fetched Successfully!';
										newVouchersResponse.success = true;
									}

									return newVouchersResponse;
								}
							} else {

								new LogSys().log({
									msg: `Data Fetching From Redeemption List`,
									time: new Date().toISOString(),
								});
								const id = getLedgerDetails.redemption_id;
								let voucherDetails = await get.getZeusVoucherCode(id);
								new LogSys().log({
									msg: `Data Fetching From Redeemption ${JSON.stringify(voucherDetails)}`,
									time: new Date().toISOString(),
								});
								if (voucherDetails) {
									newVouchersResponse.voucher = voucherDetails.code;
									newVouchersResponse.pin = voucherDetails.pin;
									newVouchersResponse.valid_till = voucherDetails.validity;
									newVouchersResponse.amount = voucherDetails.price;
									newVouchersResponse.brand_details = skudetails.brand;
									newVouchersResponse.message = 'Voucher Fetched Successfully!';
									newVouchersResponse.success = true;
								}

								return newVouchersResponse;
							}
						} else {
							return newVouchersResponse;
						}
					} else {
						return newVouchersResponse;
					}
				}
			} else {
				return {
					success: false,
					message: 'Invalid Token!. Please Contact Administrator.',
				};
			}



		} catch (e) {
			console.log("Softlink Redeem Voucher Error", e);
			await new LogSys().error({ redeemVoucherError: e });
			return {
				success: false,
				message: 'Please contact Administrator',
				err_code: 'EXC_ERR',
			};
		}
	}
}

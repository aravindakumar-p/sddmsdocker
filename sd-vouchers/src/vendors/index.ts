import WorkAdvantage from './entities/work_advantage';
import store from './entities/store';
import vendorConfig from './vendor-config';
import LogSys from '../helpers/logger';
import QCAmazon from './entities/qc_amazon';
import currencies from './currencies.json';
import Getters from '../db/getters';
import Setters from '../db/setters';
import flipkartGiftingApi from './entities/flipkart_gifting';
import { AnyARecord } from 'dns';
import QuickCilver from './entities/quick_cilver';
import RewardStore from './entities/reward_store';

/**
 * Vendor Vouchers Class:
 * Objective:
 * Standalone Class to handle API Integration with Multiple Vendors to retrieve vouchers or other voucher related information.
 *
 * What it is / What it is not:
 * - Shall be used to handle retrieving Vouchers from 3rd party APIs
 * - Shall not involve with saving / updating vouchers in Database
 * - Shall not involve with connections with Directus
 * */
export default class VendorVouchers {
	get = null;
	set = null;
	services = null;
	accountabilitySchema = null;
	itemsService = null;

	constructor(ItemsService, accountabilitySchema) {
		this.itemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}
	sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	/* Work Advantage ---------------------------- */
	getWorkAdvantageCode = async (referenceId: any, vendor_code: any) => {
		try {
			const workAdvantage = new WorkAdvantage(vendorConfig.workAdvantageConfig);

			let code = null;
			let codeException = null;
			const lastCodeUpdateTime = store.work_advantage.AUTH_CODE_LAST_UPDATED;
			const lastCode = store.work_advantage.AUTH_CODE;
			const codeValidityTime = vendorConfig.workAdvantageConfig.code_validity_time;
			const timeSinceLastUpdate = (new Date().getTime() - lastCodeUpdateTime) / 1000;

			if (lastCode && lastCodeUpdateTime && timeSinceLastUpdate < codeValidityTime) {
				await new LogSys().log(
					'Fetching Previous Auth Code TSLU:' + timeSinceLastUpdate,
					false,
					referenceId,
					vendor_code
				);
				code = lastCode;
			} else {
				await new LogSys().log('Generating Auth Code TSLU:' + timeSinceLastUpdate, false, referenceId, vendor_code);
				const authCodeResponse = await workAdvantage.getAuthCode();
				code = authCodeResponse.code;
				codeException = authCodeResponse.codeException;
			}
			return {
				code,
				codeException,
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getWorkAdvantageCode Error',
				},
				referenceId,
				vendor_code
			);
			return { code: null, codeException: true };
		}
	};

	getWorkAdvantageVoucher = async (
		upc_id: any,
		qty: any,
		referenceId: any,
		retrieveIfRedeemed: any,
		vendor_code: any
	) => {
		try {
			await new LogSys().log('Initialising WorkAdvantage Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise WorkAdvantage Object */
			const workAdvantage = new WorkAdvantage(vendorConfig.workAdvantageConfig);

			await new LogSys().log('Getting Authorization Code', false, referenceId, vendor_code);
			/* Step 2 - Fetch Authorization Code */
			const { code, codeException } = await this.getWorkAdvantageCode(referenceId, vendor_code);

			await new LogSys().log('Getting OAuthToken', false, referenceId, vendor_code);
			/* Step 3 - Use Authorization code to get OAuth Token */
			const { access_token, oAuthException } = await workAdvantage.getOAuthToken(code, referenceId, vendor_code);

			await new LogSys().log(
				'Getting Vouchers: ' + JSON.stringify({ upc_id, qty, referenceId }),
				false,
				referenceId,
				vendor_code
			);
			/* Step 4 - Use OAuth Token, Qty, utid and get vouchers */
			let { vouchers, success, message, orderId, orderException } = await workAdvantage.placeVouchersOrder({
				upc_id,
				qty,
				access_token,
				referenceId,
				vendor_code,
			});
			await new LogSys().log(
				`Received Response for refId:${referenceId}, Suc:${success}, Msg:${message}`,
				false,
				referenceId,
				vendor_code
			);

			/* Step 5 - If required, for non unique ref id, get older order details */
			let oldOrderException = null;
			if (!success && retrieveIfRedeemed && message && message.toLowerCase().includes('unique reference id')) {
				await new LogSys().log(
					`Getting Older Order Details for Ref:${referenceId},"Message:"${message}`,
					false,
					referenceId,
					vendor_code
				);
				const oldOrderResponse = await workAdvantage.getOlderOrderDetails(referenceId, access_token, vendor_code);

				vouchers = oldOrderResponse.vouchers;
				success = oldOrderResponse.success;
				message = oldOrderResponse.message;
				orderId = oldOrderResponse.orderId;
				oldOrderException = oldOrderResponse.oldOrderException;
				await new LogSys().log(
					`Received Old Order Response Suc:${success}, ordId:${orderId},"Message:"${message}`,
					false,
					referenceId,
					vendor_code
				);
			}

			let isExceptionOccurred = codeException || orderException || oAuthException || oldOrderException;

			await new LogSys().log(`isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);

			if (isExceptionOccurred) {
				await new LogSys().log(
					`Throwing Error: coE:${codeException} oaE:${oAuthException} orE:${orderException} ooE:${oldOrderException}`,
					false,
					referenceId,
					vendor_code
				);
				return {
					vouchers: null,
					success: false,
					message: 'Exception Occurred:',
					orderId: null,
					exception: true,
					vendorCode: vendor_code,
				};
			} else {
				return {
					vouchers: vouchers,
					success: success,
					message: message,
					orderId: orderId,
					exception: !!isExceptionOccurred,
					vendorCode: vendor_code,
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getWorkAdvantageVoucher Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'Exception Occurred:' + e,
				orderId: null,
				exception: true,
				vendorCode: vendor_code,
			};
		}
	};

	getWorkAdvantageCatalogue = async (countryCode: any) => {
		try {
			/* Step 1 - Initialise WorkAdvantage Object */
			const workAdvantage = new WorkAdvantage(vendorConfig.workAdvantageConfig);

			/* Step 2 - Fetch Authorization Code */
			const { code } = await workAdvantage.getAuthCode();

			/* Step 3 - Use Authorization code to get OAuth Token */
			const { access_token } = await workAdvantage.getOAuthToken(code, null, null);

			/* Step 4 - Use Authorization code to get OAuth Token */
			const catalog = await workAdvantage.getCatalog(access_token, countryCode);

			return catalog;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getWorkAdvantageCatalogue Error',
				},
				null,
				null
			);
		}
	};

	getWorkAdvantageWalletBalance = async () => {
		try {
			/* Step 1 - Initialise WorkAdvantage Object */
			const workAdvantage = new WorkAdvantage(vendorConfig.workAdvantageConfig);

			/* Step 2 - Fetch Authorization Code */
			const { code } = await workAdvantage.getAuthCode();

			/* Step 3 - Use Authorization code to get OAuth Token */
			const { access_token } = await workAdvantage.getOAuthToken(code, null, null);

			/* Step 4 - Use Authorization code to get OAuth Token */
			const balance = await workAdvantage.getBalance(access_token);

			return balance;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getWorkAdvantageWalletBalance Error',
				},
				null,
				null
			);
		}
	};

	async getWorkAdvantagePreviousOrder(referenceId: any, vendor_code: any) {
		try {
			await new LogSys().log('PrevOrd Initialising WorkAdvantage Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise WorkAdvantage Object */
			const workAdvantage = new WorkAdvantage(vendorConfig.workAdvantageConfig);

			await new LogSys().log('PrevOrd Getting Authorization Code', false, referenceId, vendor_code);
			/* Step 2 - Fetch Authorization Code */
			const { code, codeException } = await this.getWorkAdvantageCode(referenceId, vendor_code);

			await new LogSys().log('PrevOrd Getting OAuthToken', false, referenceId, vendor_code);
			/* Step 3 - Use Authorization code to get OAuth Token */
			const { access_token, oAuthException } = await workAdvantage.getOAuthToken(code, referenceId, vendor_code);

			/* Step 4 - If required, for non unique ref id, get older order details */
			await new LogSys().log(
				`PrevOrd Getting Older Order Details for Ref:${referenceId}`,
				false,
				referenceId,
				vendor_code
			);
			const oldOrderResponse = await workAdvantage.getOlderOrderDetails(referenceId, access_token, vendor_code);

			const vouchers = oldOrderResponse.vouchers;
			const success = oldOrderResponse.success;
			const message = oldOrderResponse.message;
			const orderId = oldOrderResponse.orderId;
			const oldOrderException = oldOrderResponse.oldOrderException;
			await new LogSys().log(
				`PrevOrd Received Old Order Response Suc:${success}, ordId:${orderId}`,
				false,
				referenceId,
				vendor_code
			);

			const isExceptionOccurred = codeException || oAuthException || oldOrderException;

			await new LogSys().log(`PrevOrd isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);
			if (isExceptionOccurred) {
				await new LogSys().log(
					`PrevOrd Throwing Error: coE:${codeException} oaE:${oAuthException} ooE:${oldOrderException}`,
					false,
					referenceId,
					vendor_code
				);

				return {
					vouchers: null,
					success: false,
					message: 'Exception Occurred:',
					exception: true,
					orderId: orderId,
					vendorCode: vendor_code,
				};
			}

			return {
				vouchers: vouchers,
				success: success,
				message: message,
				orderId: orderId,
				exception: !!isExceptionOccurred,
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'PrevOrd getWorkAdvantagePreviousOrder Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'PrevOrd Exception Occurred:' + e,
				exception: true,
				orderId: null,
			};
		}
	}

	/*Flipkart API */
	getFlipkartVoucher = async (qty: any, reference_id: any, price: any, vendor_code: any, brand_sku: any) => {
		try {
			await new LogSys().log('Initialising Flipkart Voucher', false, reference_id, vendor_code);

			const getQty: any = qty;
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;

			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';

			const api = new flipkartGiftingApi({
				transactionId: '',
				denomination: '',
				qty: 1,
				code: '',
				baseUrl: vendorConfig.flipkartConfig.baseUrl,
				headers: vendorConfig.flipkartConfig.headers,
			});

			const giftCardList: any = [];
			let status = false;
			let vendorOrderKeys: any = [];
			let totalValue: any = 0;
			let transactionId: any = null;
			let commonMessge: any = '';

			totalValue = getQty * price;

			const { success, balance, codeException, message } = await api.getFlipkartBalance();

			if (success) {
				if (balance) {
					if (totalValue < balance) {
						for (let i = 0; i < getQty; i++) {
							//generate the referance_id
							const getRefId = reference_id + '-' + (i + 1);
							vendorOrderDetail = await get.getVendorOrderFromRef(getRefId, vendorId, vendor_code);
							await new LogSys().log(
								`checking data from sd_vendor_orders collection:${vendorOrderDetail}`,
								false,
								reference_id,
								vendor_code
							);

							vendorOrderId =
								vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;
							/* Always create a Entry in orders table if entry not already there */
							if (!vendorOrderDetail) {
								vendorOrderKeys = await set.addVendorOrder(getRefId, vendorId, vendor_code);

								await new LogSys().log('Getting TransactionId Code', false, reference_id, vendor_code);
								/* Step 1 - Fetch transactionId Code */
								const getTrasactionResponse = await api.getTrasactionId();
								if (getTrasactionResponse.statusCode == 'SUCCESS') {
									transactionId = getTrasactionResponse.transactionId;

									await new LogSys().log(
										`Flipkart TransactionId Generated : ${getTrasactionResponse}`,
										getTrasactionResponse,
										reference_id,
										vendor_code
									);
									if (transactionId) {
										//flipkart transactionId is orderid sd_vendor_orders collection
										await set.updateVendorOrderByKeys(
											vendorOrderKeys,
											vendorOrderId ? vendorOrderId : transactionId,
											'pending'
										);
										await new LogSys().log('Generating Gift Cards', false, reference_id, vendor_code);
										/* Step 2 - Generating gift card */
										let egvResponse: any = null;
										egvResponse = await api.generateFlipkartVoucher({
											transactionId: transactionId,
											denomination: price,
										});

										if (egvResponse.statusCode == 'CREATION_SUCCESSFUL') {
											await new LogSys().log('Flipkart Gift Card Generated :', false, reference_id, vendor_code);
											egvResponse.egv.transactionId = transactionId;
											egvResponse.egv.storeToInventory = true;
											egvResponse.egv.sku = brand_sku;

											//flipkart transactionId is orderid sd_vendor_orders collection
											await set.updateVendorOrderByKeys(
												vendorOrderKeys,
												vendorOrderId ? vendorOrderId : transactionId,
												egvResponse ? 'completed' : 'pending'
											);
											status = true;
											giftCardList.push(egvResponse);
										} else {
											if (egvResponse.codeException) {
												await new LogSys().log(
													`Gift Card  Generating  Error ${JSON.stringify(egvResponse)}`,
													getTrasactionResponse,
													reference_id,
													vendor_code
												);
												commonMessge = egvResponse.statusCode;
												return {
													giftCardList: giftCardList,
													success: false,
													message: egvResponse.statusCode,
													codeException: true,
													vendorCode: vendor_code,
												};
											}
										}
									} else {
										await new LogSys().log(
											`Flipkart TransactionId  Not Generated ${getTrasactionResponse}`,
											getTrasactionResponse,
											reference_id,
											vendor_code
										);

										commonMessge = 'Flipkart TransactionId  Not Generated';
										return {
											giftCardList: giftCardList,
											success: false,
											message: 'Flipkart TransactionId  Not Generated',
											codeException: true,
											vendorCode: vendor_code,
										};
									}
								} else {
									await new LogSys().log(
										`Create TransactionId Error :${getTrasactionResponse}`,
										false,
										reference_id,
										vendor_code
									);
									commonMessge = 'Flipkart Transaction ID Not generated';
									return {
										giftCardList: giftCardList,
										success: false,
										message: 'Transaction ID Not generated',
										codeException: true,
										vendorCode: vendor_code,
									};
								}
							} else {
								await new LogSys().log(
									'Fetch Gift Card From SD Gift Card Inventory:',
									false,
									reference_id,
									vendor_code
								);

								//gift card inventory flipkart vendor_order_id is transaction id
								const getExistingInventoryDetails = await get.getVendorTrasanctionDetails(
									vendorOrderDetail.vendor_order_id
								);

								const egvDetails: any = {};
								const egv: any = {};
								egvDetails.statusCode = 'Fetching Data From Inventory';
								egvDetails.statusMessage =
									'Please provide a unique reference ID for the order, following the gift card fetching process from the SD Gift Card Inventory.';

								//check getExistingInventoryDetails length
								if (getExistingInventoryDetails.length !== 0) {
									egv.code = getExistingInventoryDetails[0].code || '';
									egv.pin = getExistingInventoryDetails[0].pin || '';
									egv.expiryDate = getExistingInventoryDetails[0].validity || '';
									egv.storeToInventory = false;
									egv.transactionId = vendorOrderDetail.vendor_order_id;
									egv.sku = brand_sku;

									egv.recipient = {
										medium: 'INLINE',
										format: 'JSON',
										status: 'DISPATCHED',
										walletInfoRequired: false,
									};
									egvDetails.egv = egv;
									giftCardList.push(egvDetails);
									if (giftCardList.length !== 0) {
										status = true;
									}
								} else {
									//check redispatch Inventory
									const getRedispatchFlipkartVoucher = await api.redispatchFlipkartVoucher(
										vendorOrderDetail.vendor_order_id
									);

									if (getRedispatchFlipkartVoucher.statusCode == 'SUCCESS') {
										egvDetails.statusCode = getRedispatchFlipkartVoucher.statusCode;
										egvDetails.statusMessage = getRedispatchFlipkartVoucher.statusMessage;
										egv.code = getRedispatchFlipkartVoucher.egv.code || '';
										egv.pin = getRedispatchFlipkartVoucher.egv.pin || '';
										egv.expiryDate = getRedispatchFlipkartVoucher.egv.expiryDate || '';
										egv.storeToInventory = true;
										egv.transactionId = vendorOrderDetail.vendor_order_id;
										egv.sku = brand_sku;
										egv.balance = getRedispatchFlipkartVoucher.egv.balance;

										egv.recipient = {
											medium: 'INLINE',
											format: 'JSON',
											status: 'DISPATCHED',
											walletInfoRequired: false,
										};
										egvDetails.egv = egv;
										giftCardList.push(egvDetails);
										if (giftCardList.length !== 0) {
											status = true;
										}
									} else {
										await new LogSys().log(
											`TransactionId Already Generated : ${vendorOrderDetail.vendor_order_id}`,
											false,
											reference_id,
											vendor_code
										);
										await new LogSys().log(
											`Redispatch Flipkart Voucher statusCode:${getRedispatchFlipkartVoucher.statusCode} TransactionId: ${vendorOrderDetail.vendor_order_id}`,
											false,
											reference_id,
											vendor_code
										);
										await new LogSys().log(
											`Redispatch Flipkart Voucher statusMessage:${getRedispatchFlipkartVoucher.statusMessage}`,
											false,
											reference_id,
											vendor_code
										);

										if (getRedispatchFlipkartVoucher.statusCode == 'ERR_NOT_GENERATED') {
											//vendorOrderDetail.vendor_order_id is trasanctionId
											if (vendorOrderDetail.vendor_order_id) {
												await new LogSys().log('Re Generating Gift Card :', false, reference_id, vendor_code);
												/* Step 2 - Generating gift card */
												let getEgvResponse: any = null;
												getEgvResponse = await api.generateFlipkartVoucher({
													transactionId: vendorOrderDetail.vendor_order_id,
													denomination: price,
												});

												if (getEgvResponse.statusCode === 'CREATION_SUCCESSFUL') {
													await new LogSys().log('Flipkart Gift Card Re-Generated :', false, reference_id, vendor_code);
													getEgvResponse.egv.transactionId = vendorOrderDetail.vendor_order_id;
													getEgvResponse.egv.storeToInventory = true;
													getEgvResponse.egv.sku = brand_sku;

													//flipkart transactionId is orderid sd_vendor_orders collection
													await set.updateVendorOrderByKeys(
														vendorOrderKeys,
														vendorOrderId ? vendorOrderId : vendorOrderDetail.vendor_order_id,
														getEgvResponse ? 'completed' : 'pending'
													);
													status = true;
													giftCardList.push(getEgvResponse);
												} else {
													if (getEgvResponse.codeException) {
														await new LogSys().log(
															`Redispatch Flipkart Voucher generation failes:${getRedispatchFlipkartVoucher.statusMessage}`,
															false,
															reference_id,
															vendor_code
														);
														commonMessge = getRedispatchFlipkartVoucher.statusMessage;
														return {
															giftCardList: giftCardList,
															success: false,
															message: getRedispatchFlipkartVoucher.statusMessage,
															codeException: true,
															vendorCode: vendor_code,
														};
													}
												}
											} else {
												await new LogSys().log(
													`TransactionId Not Available:${getRedispatchFlipkartVoucher.statusMessage}`,
													false,
													reference_id,
													vendor_code
												);
												commonMessge = 'TransactionId Not Available';
												return {
													giftCardList: giftCardList,
													success: false,
													message: 'TransactionId Not Available',
													codeException: true,
													vendorCode: vendor_code,
												};
											}
										} else if (getRedispatchFlipkartVoucher.statusCode == 'ERR_TRANSACTION_FAILED') {
											//here transaction failed so new to create new transactionid and it should update in vendor orders
											await new LogSys().log(
												`TransactionId Failed: ${vendorOrderDetail.vendor_order_id}`,
												false,
												reference_id,
												vendor_code
											);

											await new LogSys().log('Getting TransactionId Code', false, reference_id, vendor_code);
											/* Step 1 - Fetch transactionId Code */
											const retryTrasactionResponse = await api.getTrasactionId();
											if (retryTrasactionResponse.statusCode === 'SUCCESS') {
												transactionId = retryTrasactionResponse.transactionId;

												await new LogSys().log(
													`Flipkart TransactionId Generated : ${retryTrasactionResponse}`,
													retryTrasactionResponse,
													reference_id,
													vendor_code
												);
												if (transactionId) {
													//flipkart transactionId is orderid sd_vendor_orders collection
													await set.updateVendorOrderByKeys(
														vendorOrderKeys,
														vendorOrderId ? vendorOrderId : transactionId,
														'pending'
													);
													await new LogSys().log('Generating Gift Card :', false, reference_id, vendor_code);
													/* Step 2 - Generating gift card */
													let egvResponse: any = null;
													egvResponse = await api.generateFlipkartVoucher({
														transactionId: transactionId,
														denomination: price,
													});

													if (egvResponse.statusCode === 'CREATION_SUCCESSFUL') {
														await new LogSys().log('Flipkart Gift Card Generated :', false, reference_id, vendor_code);
														egvResponse.egv.transactionId = transactionId;
														egvResponse.egv.storeToInventory = true;
														egvResponse.egv.sku = brand_sku;

														//flipkart transactionId is orderid sd_vendor_orders collection
														await set.updateVendorOrderByKeys(
															vendorOrderKeys,
															vendorOrderId ? vendorOrderId : transactionId,
															egvResponse ? 'completed' : 'pending'
														);
														status = true;
														giftCardList.push(egvResponse);
													} else {
														if (egvResponse.codeException) {
															commonMessge = egvResponse.statusCode;

															return {
																giftCardList: giftCardList,
																success: false,
																message: egvResponse.statusCode,
																codeException: true,
																vendorCode: vendor_code,
															};
														}
													}
												} else {
													await new LogSys().log(
														`Flipkart TransactionId Not Availabe: ${retryTrasactionResponse}`,
														retryTrasactionResponse,
														reference_id,
														vendor_code
													);

													commonMessge = 'TransactionId Not Available';
													return {
														giftCardList: giftCardList,
														success: false,
														message: 'TransactionId Not Available',
														codeException: true,
														vendorCode: vendor_code,
													};
												}
											} else {
												await new LogSys().log(
													`Create TransactionId Error :${retryTrasactionResponse}`,
													false,
													reference_id,
													vendor_code
												);
												commonMessge = 'Transaction Id Not generated';
												return {
													giftCardList: giftCardList,
													success: false,
													message: 'Transaction Id Not generated',
													codeException: true,
													vendorCode: vendor_code,
												};
											}
										}
									}
								}
							}
						}

						if (giftCardList.length == getQty) {
							status = true;
						}
						/* Step 3 - Finally return  gift card */
						return {
							giftCardList: giftCardList,
							success: status,
							message: commonMessge,
							codeException: false,
							vendorCode: vendor_code,
						};
					} else {
						await new LogSys().log(`Flikart Insufficient balance :${message}`, false, reference_id, vendor_code);
						return {
							giftCardList: giftCardList,
							success: false,
							message: 'Flikart Insufficient balance',
							codeException: true,
							vendorCode: vendor_code,
						};
					}
				} else {
					await new LogSys().log(`Flikart Balance Not Found :${message}`, false, reference_id, vendor_code);

					return {
						giftCardList: giftCardList,
						success: false,
						message: 'Flikart Balance Not Found',
						codeException: true,
						vendorCode: vendor_code,
					};
				}
			} else {
				await new LogSys().log(`get Flikart Balance Error :${message}`, false, reference_id, vendor_code);

				if (!codeException) {
					return {
						giftCardList: giftCardList,
						success: false,
						message: 'Flikart Balance Error',
						codeException: true,
						vendorCode: vendor_code,
					};
				}
			}
		} catch (e) {
			await new LogSys().log(`Error :${e}`, false, reference_id, vendor_code);

			await new LogSys().jsonError(
				{
					exception: e,
					error: `getFlipKartVoucher Error ${e}`,
				},
				reference_id,
				vendor_code
			);
			return { giftCardList: [], success: false, message: e, codeException: true, vendorCode: vendor_code };
		}
	};

	/* QC Amazon --------------------------------- */
	getQCAmazonBearerToken = async (referenceId: any, vendor_code: any) => {
		try {
			let accessTokenException = null;
			let authCodeException = null;

			try {
				const qcAmazon = new QCAmazon(vendorConfig.qcAmazonConfig);

				let accessToken = null;

				const lastCodeUpdateTime = store.qc_amazon.OAUTH_CODE_LAST_UPDATED;
				const lastCode = store.qc_amazon.OAUTH_CODE;
				const codeValidityTime = vendorConfig.qcAmazonConfig.code_validity_time;
				const timeSinceLastUpdate = (new Date().getTime() - lastCodeUpdateTime) / 1000;

				if (lastCode && lastCodeUpdateTime && timeSinceLastUpdate < codeValidityTime) {
					await new LogSys().log(
						'QC Fetching Previous OAuth Code TSLU:' + timeSinceLastUpdate,
						false,
						referenceId,
						vendor_code
					);
					accessToken = lastCode;
				} else {
					await new LogSys().log(
						'QC Generating OAuth Code TSLU:' + timeSinceLastUpdate,
						false,
						referenceId,
						vendor_code
					);

					await new LogSys().log('Getting QC Authorization Code', false, referenceId, vendor_code);
					/* Step 2 - Get Authorization Code */
					const { code, codeException } = await qcAmazon.getAuthCode(referenceId, vendor_code);

					authCodeException = codeException;

					await new LogSys().log('Getting QC OAuthToken', false, referenceId, vendor_code);
					/* Step 3 - Get OAuth Token */
					const { access_token, oAuthException } = await qcAmazon.getOAuthToken(code, referenceId, vendor_code);

					accessToken = access_token;
					accessTokenException = oAuthException;
				}

				return {
					access_token: accessToken,
					oAuthException: accessTokenException,
					codeException: authCodeException,
				};
			} catch (e) {
				await new LogSys().jsonError(
					{
						exception: e,
						error: 'getQCAmazonBearerToken B Error',
					},
					referenceId,
					vendor_code
				);
				return { access_token: null, oAuthException: accessTokenException, codeException: authCodeException };
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCAmazonBearerToken A Error',
				},
				referenceId,
				vendor_code
			);
			return null;
		}
	};

	getQCAmazonVoucher = async (
		vendorSku,
		qty,
		referenceId,
		retrieveIfRedeemed,
		price,
		currency,
		vendorOrderId,
		syncOnly,
		isOrderComplete,
		vendor_code
	) => {
		try {
			await new LogSys().log('getQCAmazonVoucher Initialising QC AMZN Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC Amazon Object */
			const qcAmazon = new QCAmazon(vendorConfig.qcAmazonConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQCAmazonBearerToken(
				referenceId,
				vendor_code
			);

			await new LogSys().log('Placing QC Order', false, referenceId, vendor_code);
			/* Step 4 - Place Order */
			const currencyISOCode = currencies[currency].ISOnum;

			if (!isOrderComplete || !retrieveIfRedeemed) {
				/* We place new order if order status is not completed */
				const { vouchers, success, message, orderId, status, orderException, statusCode, walletBalance } =
					await qcAmazon.placeVouchersOrder({
						vendorSku,
						qty,
						access_token,
						referenceId,
						price,
						currencyISOCode,
						syncOnly,
						vendor_code,
					});

				const oldOrderException = null;

				/* Step 6 - Get Order Details */

				const isExceptionOccurred = codeException || orderException || oAuthException || oldOrderException;

				await new LogSys().log(
					`isExceptionOccurred: ${!!isExceptionOccurred}` + ' Message:' + message,
					false,
					referenceId,
					vendor_code
				);

				if (isExceptionOccurred) {
					await new LogSys().log(
						`Exception Occurred due to QC Amazon: coE:${codeException} oaE:${oAuthException} orE:${orderException} ooE:${oldOrderException}`,
						false,
						referenceId,
						vendor_code
					);
					return {
						vouchers: null,
						success: false,
						message: 'Exception Occurred:',
						exception: true,
						orderId: orderId,
						vendorCode: vendor_code,
					};
				}

				return {
					vouchers: vouchers,
					success: success,
					message: message,
					status,
					orderId: orderId,
					exception: !!isExceptionOccurred,
					statusCode,
					walletBalance,
					vendorCode: vendor_code,
				};
			} else {
				/* We check for order history */
				/* We place new order if order status is not completed */
				let { vouchers, success, message, orderId, status, orderException, statusCode } = {};

				let oldOrderException = null;

				const oldOrderResponse = await qcAmazon.getOlderOrderDetails(
					vendorOrderId,
					access_token,
					referenceId,
					vendor_code
				);
				vouchers = oldOrderResponse.vouchers;
				success = oldOrderResponse.success;
				message = oldOrderResponse.message;
				orderId = vendorOrderId;
				oldOrderException = oldOrderResponse.oldOrderException;
				await new LogSys().log(
					`Received Old QC Order Response Suc:${success}, ordId:${orderId}`,
					false,
					referenceId,
					vendor_code
				);

				/* Step 6 - Get Order Details */

				const isExceptionOccurred = codeException || orderException || oAuthException || oldOrderException;

				await new LogSys().log(`isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);

				if (isExceptionOccurred) {
					await new LogSys().log(
						`Exception Occurred QC Amazon (Order Details): coE:${codeException} oaE:${oAuthException} orE:${orderException} ooE:${oldOrderException}`,
						false,
						referenceId,
						vendor_code
					);
					return {
						vouchers: null,
						success: false,
						message: 'Exception Occurred:',
						exception: true,
						orderId: orderId,
						vendorCode: vendor_code,
					};
				}

				return {
					vouchers: vouchers,
					success: success,
					message: message,
					status,
					orderId: orderId,
					exception: !!isExceptionOccurred,
					statusCode,
					vendoCode: vendor_code,
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCAmazonVoucher Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'Exception Occurred:' + e,
				exception: true,
				orderId: null,
				vendoCode: vendor_code,
			};
		}
	};

	getQCAmazonOlderOrder = async (referenceId: any, vendorOrderId: any, vendor_code: any) => {
		try {
			await new LogSys().log('getQCAmazonOlderOrder Initialising QC AMZN Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC Amazon Object */
			const qcAmazon = new QCAmazon(vendorConfig.qcAmazonConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQCAmazonBearerToken(
				referenceId,
				vendor_code
			);

			await new LogSys().log('Getting QC Order History', false, referenceId, vendor_code);

			/* We check for order history */
			/* We place new order if order status is not completed */
			let { vouchers, success, message, orderId, status } = {};

			let oldOrderException = null;

			const oldOrderResponse = await qcAmazon.getOlderOrderDetails(
				vendorOrderId,
				access_token,
				referenceId,
				vendor_code
			);

			vouchers = oldOrderResponse.vouchers;
			success = oldOrderResponse.success;
			message = oldOrderResponse.message;
			orderId = vendorOrderId;
			oldOrderException = oldOrderResponse.oldOrderException;
			await new LogSys().log(
				`Received Old QC Order Response Suc:${success}, ordId:${orderId}`,
				false,
				referenceId,
				vendor_code
			);

			/* Step 6 - Get Order Details */

			const isExceptionOccurred = codeException || oAuthException || oldOrderException;

			await new LogSys().log(`isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);

			if (isExceptionOccurred) {
				await new LogSys().log(
					`Exception Occurred QC Amazon (Order Details): coE:${codeException} oaE:${oAuthException} ooE:${oldOrderException}`,
					false,
					referenceId,
					vendor_code
				);
				return {
					vouchers: null,
					success: false,
					message: 'Exception Occurred:',
					exception: true,
					orderId: orderId,
					vendorCode: vendor_code,
				};
			}

			return {
				vouchers: vouchers,
				success: success,
				message: message,
				status,
				orderId: orderId,
				exception: !!isExceptionOccurred,
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCAmazonOlderOrder Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'Exception Occurred:' + e,
				exception: true,
				orderId: null,
				vendorCode: vendor_code,
			};
		}
	};

	getQCAmazonOrderStatus = async (referenceId: any, vendor_code: any) => {
		try {
			await new LogSys().log('getQCAmazonOrderStatus Initialising QC AMZN Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC Amazon Object */
			const qcAmazon = new QCAmazon(vendorConfig.qcAmazonConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQCAmazonBearerToken(
				referenceId,
				vendor_code
			);

			const { response } = await qcAmazon.getOrderStatus(referenceId, access_token, vendor_code);
			await new LogSys().log('get QC Amazon Order Status', false, referenceId, vendor_code);

			return response;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `getQCAmazonOrderStatus Error : ${e}`,
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: `Exception Occurred:${e}`,
				exception: true,
				vendorCode: vendor_code,
			};
		}
	};

	async getQCAmazonCatalog() {
		try {
			await new LogSys().log('getQCAmazonCatalog Initialising QC AMZN Object', false, null, null);
			/* Step 1 - Initialise QC Amazon Object */
			const qcAmazon = new QCAmazon(vendorConfig.qcAmazonConfig);

			await new LogSys().log('QC Getting Access Token', false, null, null);
			const { access_token, codeException, oAuthException } = await this.getQCAmazonBearerToken(null, null);
			await new LogSys().log(`access_token ${access_token}`, false, null, null);
			await new LogSys().log(`codeException ${codeException}`, false, null, null);
			await new LogSys().log(`oAuthException ${oAuthException}`, false, null, null);

			const { categoryId } = await qcAmazon.getCategory(access_token);

			const { productList } = await qcAmazon.getProducts(categoryId, access_token);

			return { productList, categoryId };
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCAmazonOrderStatus Error',
				},
				null,
				null
			);
			return { vouchers: null, success: false, message: 'Exception Occurred:' + e, exception: true };
		}
	}

	getFlipkartWalletBalance = async () => {
		try {
			/* Step 1 - Initialise  Object */
			const api = new flipkartGiftingApi({
				transactionId: '',
				denomination: '',
				qty: 1,
				code: '',
				baseUrl: vendorConfig.flipkartConfig.baseUrl,
				headers: vendorConfig.flipkartConfig.headers,
			});

			/* Step 4 - Use Authorization code to get OAuth Token */
			const { success, balance } = await api.getFlipkartBalance();

			return { success, balance };
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get Flipkart Wallet Balance Error',
				},
				null,
				null
			);
		}
	};

	getFlipkartRedispatch = async (transactionId: any) => {
		try {
			/* Step 1 - Initialise  Object */
			const api = new flipkartGiftingApi({
				transactionId: '',
				denomination: '',
				qty: 1,
				code: '',
				baseUrl: vendorConfig.flipkartConfig.baseUrl,
				headers: vendorConfig.flipkartConfig.headers,
			});

			/* Step 4 - Use Authorization code to get OAuth Token */
			const response = await api.redispatchFlipkartVoucher(transactionId);

			return response;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get Flipkart Wallet Balance Error',
				},
				null,
				null
			);
		}
	};

	generateFlipkartVoucher = async (transactionId: any, denomination: any) => {
		try {
			/* Step 1 - Initialise  Object */
			const api = new flipkartGiftingApi({
				transactionId: '',
				denomination: '',
				qty: 1,
				code: '',
				baseUrl: vendorConfig.flipkartConfig.baseUrl,
				headers: vendorConfig.flipkartConfig.headers,
			});

			/* Step 4 - Use Authorization code to get OAuth Token */
			const response = await api.generateFlipkartVoucher({ transactionId, denomination });

			return response;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get Flipkart Wallet Balance Error',
				},
				null,
				null
			);
		}
	};

	/* QC  --------------------------------- */

	getQCOrderStatus = async (referenceId: any, vendor_code: any) => {
		try {
			await new LogSys().log('getQCOrderStatus Initialising QC Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC Amazon Object */
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(
				referenceId,
				vendor_code
			);

			const { response } = await quickCilver.getOrderStatus(referenceId, access_token, vendor_code);
			await new LogSys().log('get QC  Order Status', false, referenceId, vendor_code);

			return response;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `getQCOrderStatus Error : ${e}`,
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: `Exception Occurred:${e}`,
				exception: true,
				vendorCode: vendor_code,
			};
		}
	};

	getQuickCilverVoucher = async (
		vendorSku: any,
		qty: any,
		referenceId: any,
		retrieveIfRedeemed: any,
		price: any,
		currency: any,
		vendorOrderId: any,
		syncOnly: any,
		isOrderComplete: any,
		vendor_code: any
	) => {
		try {
			await new LogSys().log('getQCVoucher Initialising Quick Cilver Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC  Object */
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(
				referenceId,
				vendor_code
			);

			await new LogSys().log('Placing QC Order', false, referenceId, vendor_code);
			/* Step 4 - Place Order */
			const currencyISOCode = currencies[currency].ISOnum;

			if (!isOrderComplete || !retrieveIfRedeemed) {
				/* We place new order if order status is not completed */
				const { vouchers, success, message, orderId, status, orderException, statusCode, walletBalance } =
					await quickCilver.placeVouchersOrder({
						vendorSku,
						qty,
						access_token,
						referenceId,
						price,
						currencyISOCode,
						syncOnly,
						vendor_code,
					});

				const oldOrderException = null;

				/* Step 6 - Get Order Details */

				let isExceptionOccurred = codeException || orderException || oAuthException || oldOrderException;

				await new LogSys().log(
					`isExceptionOccurred: ${!!isExceptionOccurred}` + ' Message:' + message,
					false,
					referenceId,
					vendor_code
				);

				if (isExceptionOccurred) {
					await new LogSys().log(
						`Exception Occurred due to QC : coE:${codeException} oaE:${oAuthException} orE:${orderException} ooE:${oldOrderException}`,
						false,
						referenceId,
						vendor_code
					);
					return {
						vouchers: null,
						success: false,
						message: 'Exception Occurred:',
						exception: true,
						orderId: orderId,
						vendorCode: vendor_code,
					};
				}

				return {
					vouchers: vouchers,
					success: success,
					message: message,
					status,
					orderId: orderId,
					exception: !!isExceptionOccurred,
					statusCode,
					walletBalance,
					vendorCode: vendor_code,
				};
			} else {
				/* We check for order history */
				/* We place new order if order status is not completed */
				let { vouchers, success, message, orderId, status, orderException, statusCode } = {};

				let oldOrderException = null;

				const oldOrderResponse = await quickCilver.getOlderOrderDetails(
					vendorOrderId,
					access_token,
					referenceId,
					vendor_code
				);
				vouchers = oldOrderResponse.vouchers;
				success = oldOrderResponse.success;
				message = oldOrderResponse.message;
				orderId = vendorOrderId;
				oldOrderException = oldOrderResponse.oldOrderException;
				await new LogSys().log(
					`Received Old QC Order Response Suc:${success}, ordId:${orderId}`,
					false,
					referenceId,
					vendor_code
				);

				/* Step 6 - Get Order Details */

				const isExceptionOccurred = codeException || orderException || oAuthException || oldOrderException;

				await new LogSys().log(`isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);

				if (isExceptionOccurred) {
					await new LogSys().log(
						`Exception Occurred QC (Order Details): coE:${codeException} oaE:${oAuthException} orE:${orderException} ooE:${oldOrderException}`,
						false,
						referenceId,
						vendor_code
					);
					return {
						vouchers: null,
						success: false,
						message: 'Exception Occurred:',
						exception: true,
						orderId: orderId,
						vendorCode: vendor_code,
					};
				}

				return {
					vouchers: vouchers,
					success: success,
					message: message,
					status,
					orderId: orderId,
					exception: !!isExceptionOccurred,
					statusCode,
					vendoCode: vendor_code,
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCVoucher Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'Exception Occurred:' + e,
				exception: true,
				orderId: null,
				vendoCode: vendor_code,
			};
		}
	};

	async getQuickCilverCatalogList(categoryId: any) {
		try {
			await new LogSys().log('getQCCatalog Initialising QC  Object', false, null, null);
			/* Step 1 - Initialise QC Amazon Object */
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);

			await new LogSys().log('QC Getting Access Token', false, null, null);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(null, null);
			await new LogSys().log(`access_token ${access_token}`, false, null, null);
			await new LogSys().log(`codeException ${codeException}`, false, null, null);
			await new LogSys().log(`oAuthException ${oAuthException}`, false, null, null);
			if (!categoryId) {
				const { categoryIds } = await quickCilver.getCategory(access_token);
				categoryId = categoryIds;
			}

			await new LogSys().log(`categoryId: ${categoryId}`, false, null, null);
			const { productList } = await quickCilver.getProducts(categoryId, access_token);
			await new LogSys().log(`productList: ${JSON.stringify(productList)}`, false, null, null);

			return { productList, categoryId };
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get Quick Cilver CatalogList Error',
				},
				null,
				null
			);
			return { vouchers: null, success: false, message: 'Exception Occurred:' + e, exception: true };
		}
	}

	getQucikCilverBearerToken = async (referenceId: any, vendor_code: any) => {
		try {
			let accessTokenException = null;
			let authCodeException = null;

			try {
				const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);

				let accessToken = null;

				const lastCodeUpdateTime = store.quick_silver.OAUTH_CODE_LAST_UPDATED;
				const lastCode = store.quick_silver.OAUTH_CODE;
				const codeValidityTime = vendorConfig.quickcilverConfig.code_validity_time;
				const timeSinceLastUpdate = (new Date().getTime() - lastCodeUpdateTime) / 1000;

				if (lastCode && lastCodeUpdateTime && timeSinceLastUpdate < codeValidityTime) {
					await new LogSys().log(
						'QC Fetching Previous OAuth Code TSLU:' + timeSinceLastUpdate,
						false,
						referenceId,
						vendor_code
					);
					accessToken = lastCode;
				} else {
					await new LogSys().log(
						'QC Generating OAuth Code TSLU:' + timeSinceLastUpdate,
						false,
						referenceId,
						vendor_code
					);

					await new LogSys().log('Getting QC Authorization Code', false, referenceId, vendor_code);
					/* Step 2 - Get Authorization Code */
					const { code, codeException } = await quickCilver.getQuickCilverAuthCode(referenceId, vendor_code);

					authCodeException = codeException;

					await new LogSys().log('Getting QC OAuthToken', false, referenceId, vendor_code);
					/* Step 3 - Get OAuth Token */
					const { access_token, oAuthException } = await quickCilver.getQuickCilverOAuthToken(
						code,
						referenceId,
						vendor_code
					);

					accessToken = access_token;
					accessTokenException = oAuthException;
				}

				return {
					access_token: accessToken,
					oAuthException: accessTokenException,
					codeException: authCodeException,
				};
			} catch (e) {
				await new LogSys().jsonError(
					{
						exception: e,
						error: 'getQCBearerToken B Error',
					},
					referenceId,
					vendor_code
				);
				return { access_token: null, oAuthException: accessTokenException, codeException: authCodeException };
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCBearerToken A Error',
				},
				referenceId,
				vendor_code
			);
			return null;
		}
	};

	getQCOlderOrder = async (referenceId: any, vendorOrderId: any, vendor_code: any) => {
		try {
			await new LogSys().log('getQCOlderOrder Initialising QC Object', false, referenceId, vendor_code);
			/* Step 1 - Initialise QC Amazon Object */
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);

			await new LogSys().log('QC Getting Access Token', false, referenceId, vendor_code);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(
				referenceId,
				vendor_code
			);

			await new LogSys().log('Getting QC Order History', false, referenceId, vendor_code);

			/* We check for order history */
			/* We place new order if order status is not completed */
			let { vouchers, success, message, orderId, status } = {};

			let oldOrderException = null;

			const oldOrderResponse = await quickCilver.getOlderOrderDetails(
				vendorOrderId,
				access_token,
				referenceId,
				vendor_code
			);

			vouchers = oldOrderResponse.vouchers;
			success = oldOrderResponse.success;
			message = oldOrderResponse.message;
			orderId = vendorOrderId;
			oldOrderException = oldOrderResponse.oldOrderException;
			await new LogSys().log(
				`Received Old QC Order Response Suc:${success}, ordId:${orderId}`,
				false,
				referenceId,
				vendor_code
			);

			/* Step 6 - Get Order Details */

			const isExceptionOccurred = codeException || oAuthException || oldOrderException;

			await new LogSys().log(`isExceptionOccurred: ${!!isExceptionOccurred}`, false, referenceId, vendor_code);

			if (isExceptionOccurred) {
				await new LogSys().log(
					`Exception Occurred QC  (Order Details): coE:${codeException} oaE:${oAuthException} ooE:${oldOrderException}`,
					false,
					referenceId,
					vendor_code
				);
				return {
					vouchers: null,
					success: false,
					message: 'Exception Occurred:',
					exception: true,
					orderId: orderId,
					vendorCode: vendor_code,
				};
			}

			return {
				vouchers: vouchers,
				success: success,
				message: message,
				status,
				orderId: orderId,
				exception: !!isExceptionOccurred,
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCOlderOrder Error',
				},
				referenceId,
				vendor_code
			);
			return {
				vouchers: null,
				success: false,
				message: 'Exception Occurred:' + e,
				exception: true,
				orderId: null,
				vendorCode: vendor_code,
			};
		}
	};

	async updateQuickCilverCatalog() {
		try {
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);
			await new LogSys().log('QC Getting Access Token', false, null, null);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(null, null);
			await new LogSys().log(`access_token ${access_token}`, false, null, null);
			await new LogSys().log(`codeException ${codeException}`, false, null, null);
			await new LogSys().log(`oAuthException ${oAuthException}`, false, null, null);
			const { categoryId } = await quickCilver.getCategory(access_token);

			await new LogSys().log(`categoryId: ${categoryId}`, false, null, null);

			return { categoryId };
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQuick cilver Error',
				},
				null,
				null
			);
			return { vouchers: null, success: false, message: 'Exception Occurred:' + e, exception: true };
		}
	}

	getQCWalletBalance = async (cardNumber: any, pin: any) => {
		try {
			await new LogSys().log(`Initialising get WalletBalance Object`, false, null, null);
			/* Step 1 - Initialise QC Amazon Object */
			const quickCilver = new QuickCilver(vendorConfig.quickcilverConfig);
			const { access_token, codeException, oAuthException } = await this.getQucikCilverBearerToken(null, null);
			await new LogSys().log(`access_token ${access_token}`, false, null, null);
			const { status, message, balance, responseJson } = await quickCilver.getBalance(cardNumber, pin, access_token);
			await new LogSys().log(`status: ${status}`, false, null, null);
			await new LogSys().log(`message: ${message}`, false, null, null);
			await new LogSys().log(`balance: ${balance}`, false, null, null);

			return { status, message, balance, responseJson };
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getQCWalletBalance Error',
				},
				null,
				null
			);
		}
	};

	getRewardStoreWalletBalance = async () => {
		try {
			await new LogSys().log(`Initialising get WalletBalance Object`, false, null, null);
			const { success, balance } = await RewardStore.getBalance()
			return { success, balance: balance[0].amount, currency: balance[0].currency }
			await new LogSys().log(`balance: ${balance[0].amount}`, false, null, null);
			await new LogSys().log(`currency: ${balance[0].currency}`, false, null, null);

		}
		catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getRewardStoreWalletBalance Error',
				},
				null,
				null
			);
		}
	}
}

import { Voucher, VoucherResponse } from '../models/common';
import Getters from '../db/getters';
import Setters from '../db/setters';
import VendorVouchers from '../vendors';
import { CONFIG } from '../config';
import LogSys from '../helpers/logger';
import helpers from '../helpers/common';
import WorkAdvantageDetails from './sub/wadvantage_details';
import QCAmazonController from './sub/qc_amazon';
import FlipkartEgvController from './sub/flipkart';
import QucikCilverController from './sub/quick_cilver';
import RewardStoreController from './sub/reward_store';
import * as XLSX from 'xlsx';
import RewardStore from '../vendors/entities/reward_store';


export default class CoreController {
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

	getWACatalog = async ({ countryCode }) => {
		try {
			const catalogArr: any = [];
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			/* Call get Catalog method of vendorVouchers */
			const catalog = await vendorVoucher.getWorkAdvantageCatalogue(countryCode);

			catalog.dealList.forEach((deal) => {
				const { benefits, name, id } = deal;
				let { terms, howtoavail } = deal;
				const brandName = name;
				const brandId = id;

				benefits.forEach((ben, i) => {
					const productName = ben['value'];
					const utid = ben['utid'];
					const upc_id = ben['upc_id'];
					const offerId = ben['offer_id'];
					const price = ben['price'];

					if (i != 0) {
						terms = null;
						howtoavail = null;
					}

					catalogArr.push({
						brandId,
						brandName,
						productName,
						utid,
						upc_id,
						offerId,
						price,
						terms,
						howtoavail,
					});
				});
			});

			return catalogArr;
		} catch (e) {
			return [];
		}
	};

	getQCCatalog = async ({ countryCode }) => {
		try {
			await new LogSys().log(`getCatalog QC-AMAZON`, false, null, null);

			const catalogArr = [];
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			/* Call get Catalog method of vendorVouchers */
			const { productList, categoryId } = await vendorVoucher.getQCAmazonCatalog();
			await new LogSys().log(`getCatalog QC-AMAZON productList ${JSON.stringify(productList)}`, false, null, null);

			for (let i = 0; i < productList.length; i++) {
				const product = productList[i];

				catalogArr.push({
					categoryId: categoryId,
					productName: product.name,
					sku: product.sku,
					price: `${product.currency.code} ${product.minPrice} - ${product.maxPrice}`,
				});
			}

			return catalogArr;
		} catch (e) {
			return [];
		}
	};

	getQuickCilverCatalog = async ({ countryCode, vendorApiIntId }) => {
		try {
			const catalogArr = [];
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();
			const vendorDetails = await get.getVendorFromVendorCode(vendorApiIntId, null);
			const category = vendorDetails ? vengetQuickCilverCatalogdorDetails['categoryid'] : null;
			/* Call get Catalog method of vendorVouchers */
			const { productList, categoryId } = await vendorVoucher.getQuickCilverCatalogList(category);

			for (let i = 0; i < productList.length; i++) {
				const product = productList[i];

				catalogArr.push({
					categoryId: categoryId,
					productName: product.name,
					sku: product.sku,
					price: `${product.currency.code} ${product.minPrice} - ${product.maxPrice}`,
				});
			}

			return catalogArr;
		} catch (e) {
			return [];
		}
	};

	getRewardCatalog = async ({ countryCode, vendorApiIntId }) => {
		try {

			const getProducts: any = await RewardStore.getProducts();
			return getProducts
		} catch (e) {
			return [];
		}
	}


	getCatalog = async ({ vendorApiIntId, countryCode }) => {
		let catalogArr = [];
		await new LogSys().log(`getCatalog initialize`, false, null, null);

		try {
			switch (vendorApiIntId) {
				/* WorkAdvantage Integration */
				case CONFIG.vendor_id_mapping.WORK_ADVANTAGE:
					catalogArr = await this.getWACatalog({ countryCode });
					break;
				case CONFIG.vendor_id_mapping.AMAZON_QC:
					catalogArr = await this.getQCCatalog({ countryCode });
					break;
				case CONFIG.vendor_id_mapping.FLIPKART_EGV:
					catalogArr = [];
					break;
				case CONFIG.vendor_id_mapping.QUICKCILVER_EGV:
					catalogArr = await this.getQuickCilverCatalog({ countryCode, vendorApiIntId });
					break;
				case CONFIG.vendor_id_mapping.REWARD_STORE:
					catalogArr = await this.getRewardCatalog({ countryCode, vendorApiIntId })
					break;
			}
		} catch (e) {
			return {
				success: false,
				error: e,
				catalog: null,
			};
		}
		return {
			success: true,
			catalog: catalogArr,
			error: null,
		};
	};

	catalogToExcel = async ({ vendorApiIntId, catalog }) => {
		try {
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			const get = new Getters(this.itemsService, this.accountabilitySchema);


			if (catalog.length > 0) {
				const vendorDetails = await get.getVendorFromVendorCode(vendorApiIntId, null);
				const vendorId = vendorDetails ? vendorDetails['id'] : null;

				catalog.forEach((item: any) => {
					if (vendorApiIntId == CONFIG.vendor_id_mapping.REWARD_STORE) {
						item.sku = catalog.id
						catalog.id = null
					}
					item.vendorId = vendorId;
				});
				if (vendorApiIntId != CONFIG.vendor_id_mapping.REWARD_STORE) {
					await set.vendorCatalogue(catalog);

				}
			}
			/* Checking for Work Advantage */
			if (vendorApiIntId == CONFIG.vendor_id_mapping.WORK_ADVANTAGE) {
				const MAX_CELL_LENGTH = 32767; // Excel's hard limit

				// Add headers to worksheet
				const headers = [
					{ header: 'Brand Id', key: 'brandId' },
					{ header: 'Brand Name', key: 'brandName' },
					{ header: 'Product Name', key: 'productName' },
					{ header: 'UTID', key: 'utid' },
					{ header: 'UPC ID', key: 'upc_id' },
					{ header: 'Offer Id', key: 'offerId' },
					{ header: 'Price', key: 'price' },
					{ header: 'TNC', key: 'terms' },
					{ header: 'How to Avail', key: 'howtoavail' },
				];

				// Format catalog & truncate oversized text
				const formattedCatalog = catalog.map((row: any) => {
					const formattedRow: Record<string, any> = {};
					headers.forEach((col) => {
						let cellValue = row[col.key];
						if (typeof cellValue === 'string' && cellValue.length > MAX_CELL_LENGTH) {
							cellValue = cellValue.slice(0, MAX_CELL_LENGTH - 3) + '...';
						}
						formattedRow[col.header] = cellValue;
					});
					return formattedRow;
				});

				// Create worksheet
				const worksheet = XLSX.utils.json_to_sheet(formattedCatalog);

				// Create workbook and append sheet
				const workbook = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');

				// Return as buffer
				const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
				return buffer;
			}


			/* Checking for AMAZON_QC */
			if (vendorApiIntId == CONFIG.vendor_id_mapping.AMAZON_QC) {
				// Create a new workbook and worksheet
				// Add headers to worksheet
				const headers = [
					{ header: 'Category Id', key: 'categoryId' },
					{ header: 'Product Name', key: 'productName' },
					{ header: 'SKU', key: 'sku' },
					{ header: 'Price', key: 'price' },
				];
				const formattedCatalog = catalog.map((row: any) => {
					const formattedRow = {};
					headers.forEach((col: any) => {
						formattedRow[col.header] = row[col.key]; // Map the header to the key value
					});
					return formattedRow;
				});
				const worksheet = XLSX.utils.json_to_sheet(formattedCatalog);

				// Create a new workbook
				const workbook = XLSX.utils.book_new();

				XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');
				const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
				return buffer;
			}

			/* Checking for QWICKCILVER_EGV*/
			if (vendorApiIntId == CONFIG.vendor_id_mapping.QUICKCILVER_EGV) {
				// // Add headers to worksheet
				const headers = [
					{ header: 'Category Id', key: 'categoryId' },
					{ header: 'Product Name', key: 'productName' },
					{ header: 'SKU', key: 'sku' },
					{ header: 'Price', key: 'price' },
				];
				const formattedCatalog = catalog.map((row: any) => {
					const formattedRow = {};
					headers.forEach((col: any) => {
						formattedRow[col.header] = row[col.key]; // Map the header to the key value
					});
					return formattedRow;
				});
				const worksheet = XLSX.utils.json_to_sheet(formattedCatalog);

				// Create a new workbook
				const workbook = XLSX.utils.book_new();

				XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');
				const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

				return buffer;
			}

			if (vendorApiIntId == CONFIG.vendor_id_mapping.REWARD_STORE) {
				const headers = [
					{ header: 'Category Name', key: 'category' },
					{ header: 'Sub Category', key: 'sub_category' },
					{ header: 'Product Name', key: 'name' },
					{ header: 'SKU', key: 'sku' },
					{ header: 'Discount (%)', key: 'discount' },
					{ header: 'Details', key: 'details' },
					{ header: 'How to Use', key: 'how_to_use' },
					{ header: 'Image URL', key: 'image_url' },
					{ header: 'Delivery Time (hrs)', key: 'delivery_time' },
					{ header: 'Validity (days)', key: 'validity' },
					{ header: 'Delivery Type', key: 'delivery_type' },
					{ header: 'Terms & Conditions', key: 'terms_and_conditions' },
					{ header: 'Redemption Type', key: 'redemption_type' },
					{ header: 'Country', key: 'country' },
					{ header: 'Currency', key: 'currency' },
					{ header: 'Denomination Min', key: 'min' },
					{ header: 'Denomination Max', key: 'max' }
				];

				const formattedCatalog = catalog.flatMap((row: any) => {
					// If product has no denominations, just return one row
					if (!row.denominations || row.denominations.length === 0) {
						const formattedRow: any = {};
						headers.forEach((col: any) => {
							formattedRow[col.header] = row[col.key] || '';
						});
						return [formattedRow];
					}

					// If product has multiple denominations, create one row per denomination
					return row.denominations.map((denom: any) => {
						const formattedRow: any = {};
						headers.forEach((col: any) => {
							// If the column refers to denomination fields, pull from denom
							if (['min', 'max', 'discount'].includes(col.key)) {
								formattedRow[col.header] = denom[col.key];
							} else {
								formattedRow[col.header] = row[col.key] || '';
							}
						});
						return formattedRow;
					});
				});
				const worksheet = XLSX.utils.json_to_sheet(formattedCatalog);

				// Create a new workbook
				const workbook = XLSX.utils.book_new();

				XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');
				const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

				return buffer;

			}
		} catch (e) {
			return null;
		}
	};

	getWABalance = async () => {
		try {
			const vendorVoucher = new VendorVouchers();

			const { success, balance } = await vendorVoucher.getWorkAdvantageWalletBalance();

			return { success, balance };
		} catch (e) {
			return { success: false, error: e };
		}
	};

	getRewardStoreBalance = async () => {
		try {
			const vendorVoucher = new VendorVouchers();
			const { success, balance, currency } = await vendorVoucher.getRewardStoreWalletBalance();
			return { success, balance, currency };
		} catch (e) {
			return { success: false, error: e };
		}
	}

	getFlipkartBalance = async () => {
		try {
			const vendorVoucher = new VendorVouchers();
			const { success, balance } = await vendorVoucher.getFlipkartWalletBalance();

			return { success, balance };
		} catch (e) {
			return { success: false, error: e };
		}
	};

	getBalance = async ({ vendorApiIntId }) => {
		try {
			switch (vendorApiIntId) {
				/* WorkAdvantage Integration */
				case CONFIG.vendor_id_mapping.WORK_ADVANTAGE:
					return this.getWABalance();
				case CONFIG.vendor_id_mapping.AMAZON_QC:
					return { success: false, error: 'Balance Auto updated when order placed', balance: 0 };
				case CONFIG.vendor_id_mapping.FLIPKART_EGV:
					return this.getFlipkartBalance();
				case CONFIG.vendor_id_mapping.QUICKCILVER_EGV:
					return { success: false, error: 'Balance Auto updated when order placed', balance: 0 };
				case CONFIG.vendor_id_mapping.REWARD_STORE:
					return this.getRewardStoreBalance()
			}

			return { success: false, error: 'Vendor Not found' };
		} catch (e) {
			return { success: false, error: e };
		}
	};

	async oldVouchersWorkAdvantage({ vendor_code, reference_id, options }) {
		try {
			const workAdvantageDetails = new WorkAdvantageDetails(this.itemsService, this.accountabilitySchema);

			const { vouchers, success, message, exception, orderId } = await workAdvantageDetails.getOrderDetails(
				reference_id,
				vendor_code
			);

			/* When this option is True, we store to inventory else we dont store previous order to inventory */
			const isStoreToInventory = options && options['store_to_inventory'];

			const result = success
				? await workAdvantageDetails.storeToInventory({
					vouchers,
					reference_id,
					orderId,
					options,
					brand_sku,
					vendor_code,
				})
				: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;
			const newVouchersResponse: any = {
				success,
				message,
				keys: keys || null,
				exception,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: helpers.convertExpiryIstToTs(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'oldVouchersWorkAdvantage Error',
				},
				reference_id,
				vendor_code
			);
		}
	}

	async oldVouchersQCAmazon({ vendor_code, reference_id, options }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';
			let vendorReferenceAppend: any = '';
			const isOrderComplete = false;
			let sku = options.voucherSku;

			/* Initializing QC Amazon Controller Object */
			const qcAmazonController = new QCAmazonController(this.itemsService, this.accountabilitySchema);

			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			vendorReferenceAppend =
				vendorOrderDetail && vendorOrderDetail['reference_append'] ? vendorOrderDetail['reference_append'] : 0;

			/* Appended Reference ID, it is just normal reference id if there is no append */
			const appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

			/* Checking the status of the reference id or appended reference id */
			const orderStatus: any = await qcAmazonController.checkOrderStatus(appendedReferenceId, vendor_code);

			/* if order is cancelled, we need to increment the reference append */
			if (orderStatus['status'] == 'CANCELED') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: CANCELED',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PENDING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PENDING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PROCESSING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PROCESSING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'COMPLETE') {
				vendorOrderId = orderStatus['orderId'];
			} else {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order not found',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			}

			const { vouchers, success, message, exception, orderId, status } = await qcAmazonController.getOrderDetails(
				appendedReferenceId,
				vendorOrderId,
				vendor_code
			);

			/* Update Order Status for Vendor */
			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderId,
				success ? 'completed' : 'pending',
				vendor_code
			);

			const result = success
				? await qcAmazonController.storeToInventory({ vouchers, reference_id, orderId, options, sku, vendor_code })
				: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;
			const newVouchersResponse: VoucherResponse = {
				success,
				message,
				keys: keys || null,
				exception,
				orderStatusFromVendor: status,
				statusCodeFromVendor: status,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: new Date(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'oldVouchersQCAmazon Error',
				},
				reference_id,
				vendor_code
			);
		}
	}

	async oldVouchersFlipkart({ vendor_code, reference_id, options }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let transactionId: any = '';
			let giftCardList: any = [];
			let sku = options.voucherSku;
			let flipkartEgvResponse: VoucherResponse = {
				success: false,
				message: '',
				response: [],
				keys: [],
				orderStatusFromVendor: '',
				statusCodeFromVendor: '',
				exception: false,
				vendorCode: vendor_code,
			};
			const egvDetails: any = {};
			const egv: any = {};

			/* Inlitlized Flipkart Controller*/
			const flipkartController = new FlipkartEgvController(this.itemsService, this.accountabilitySchema);

			let vendor_order_reference_id = reference_id + '-' + 1;
			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(vendor_order_reference_id, vendorId, vendor_code);

			transactionId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			if (transactionId) {
				await new LogSys().log('Fetch Gift Card From SD Gift Card Inventory:', false, reference_id, vendor_code);

				//check gift card inventory flipkart vendor_order_id is transaction id
				const getExistingInventoryDetails = await get.getVendorTrasanctionDetails(transactionId);

				if (getExistingInventoryDetails.length !== 0) {
					flipkartEgvResponse.keys.push(getExistingInventoryDetails[0].id);
					const myVoucher = {
						code: getExistingInventoryDetails[0].code,
						pin: getExistingInventoryDetails[0].pin,
						expiry: getExistingInventoryDetails[0].validity,
						link_reference_id: getExistingInventoryDetails[0].link_reference_id,
						reference_code_otp: getExistingInventoryDetails[0].reference_code_otp,
					};

					flipkartEgvResponse.response.push(myVoucher);

					flipkartEgvResponse.success = true;
					flipkartEgvResponse.exception = false;
					flipkartEgvResponse.message = 'Fetching From Inventory';

					return flipkartEgvResponse;
				} else {
					const getRedispatchFlipkartVoucher = await this.getRedispatchDetails(transactionId);

					if (getRedispatchFlipkartVoucher.statusCode == 'SUCCESS') {
						egvDetails.statusCode = getRedispatchFlipkartVoucher.statusCode;
						egvDetails.statusMessage = getRedispatchFlipkartVoucher.statusMessage;
						egv.code = getRedispatchFlipkartVoucher.egv.code || '';
						egv.pin = getRedispatchFlipkartVoucher.egv.pin || '';
						egv.expiryDate = helpers.convertDateFormat(getRedispatchFlipkartVoucher.egv.expiryDate) || '';
						egv.balance = getRedispatchFlipkartVoucher.egv.balance || '';
						egv.storeToInventory = true;
						egv.transactionId = transactionId;
						egv.sku = options.voucherSku;

						egv.recipient = {
							medium: 'INLINE',
							format: 'JSON',
							status: 'DISPATCHED',
							walletInfoRequired: false,
						};
						egvDetails.egv = egv;

						giftCardList.push(egvDetails);

						if (giftCardList === null || giftCardList.length == 0) {
							return flipkartEgvResponse;
						} else {
							/* Update Order Status for Vendor */
							await set.updateVendorOrderStatus(reference_id, transactionId, 'completed', vendor_code);
						}

						const result = await flipkartController.storeToInventory({
							giftCardList,
							reference_id,
							options,
							vendor_code,
							sku,
						});

						const keys = result?.keys ?? null;
						const VoucherList = result?.VoucherList ?? null;

						flipkartEgvResponse.keys = keys;

						/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
						VoucherList.forEach(({ egv, link_reference_id, reference_code_otp }) => {
							const validity = helpers.convertDateFormat(egv.expiryDate);
							const myVoucher = {
								code: egv.code,
								pin: egv.pin,
								expiry: validity,
								link_reference_id: link_reference_id,
								reference_code_otp: reference_code_otp,
							};

							flipkartEgvResponse.response.push(myVoucher);
						});

						flipkartEgvResponse.success = true;
						flipkartEgvResponse.exception = false;
						flipkartEgvResponse.message = giftCardList[0].statusMessage || '';

						return flipkartEgvResponse;
					} else {
						return flipkartEgvResponse;
					}
				}
			}
		} catch (e) {
			await new LogSys().log(`oldVouchersFlipkart Error:${e}`, false, reference_id, vendor_code);

			await new LogSys().jsonError(
				{
					exception: e,
					error: 'oldVouchersFlipkart Error',
				},
				reference_id,
				vendor_code
			);
		}
	}

	async oldVouchersQuickCilver({ vendor_code, reference_id, options }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);

			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';
			let vendorReferenceAppend: any = '';
			const isOrderComplete = false;
			let sku = options.voucherSku;

			/* Initializing QC Amazon Controller Object */
			const qcController = new QucikCilverController(this.itemsService, this.accountabilitySchema);

			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			vendorReferenceAppend =
				vendorOrderDetail && vendorOrderDetail['reference_append'] ? vendorOrderDetail['reference_append'] : 0;

			/* Appended Reference ID, it is just normal reference id if there is no append */
			const appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

			/* Checking the status of the reference id or appended reference id */
			const orderStatus: any = await qcController.checkOrderStatus(appendedReferenceId, vendor_code);

			/* if order is cancelled, we need to increment the reference append */
			if (orderStatus['status'] == 'CANCELED') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: CANCELED',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PENDING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PENDING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PROCESSING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PROCESSING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'COMPLETE') {
				vendorOrderId = orderStatus['orderId'];
			} else {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order not found',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			}

			const { vouchers, success, message, exception, orderId, status } = await qcController.getOrderDetails(
				appendedReferenceId,
				vendorOrderId,
				vendor_code
			);

			/* Update Order Status for Vendor */
			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderId,
				success ? 'completed' : 'pending',
				vendor_code
			);

			const result = success
				? await qcController.storeToInventory({ vouchers, reference_id, orderId, options, sku, vendor_code })
				: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;

			const newVouchersResponse: VoucherResponse = {
				success,
				message,
				keys: keys || null,
				exception,
				orderStatusFromVendor: status,
				statusCodeFromVendor: status,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: new Date(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'oldVouchersQC Error',
				},
				reference_id,
				vendor_code
			);
		}
	}
	async getAndStoreOldVouchers({ vendor_code, reference_id, options }) {
		try {
			/* Checking for Work Advantage */
			switch (vendor_code) {
				/* WorkAdvantage Integration */
				case CONFIG.vendor_id_mapping.WORK_ADVANTAGE:
					return this.oldVouchersWorkAdvantage({ vendor_code, reference_id, options });
				case CONFIG.vendor_id_mapping.AMAZON_QC:
					return this.oldVouchersQCAmazon({ vendor_code, reference_id, options });
				case CONFIG.vendor_id_mapping.FLIPKART_EGV:
					return this.oldVouchersFlipkart({ vendor_code, reference_id, options });
				case CONFIG.vendor_id_mapping.QUICKCILVER_EGV:
					return this.oldVouchersQuickCilver({ vendor_code, reference_id, options });
			}

			return {
				success: false,
				message: 'Unknown Vendor',
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'PrevOrd getOldVouchers Error',
				},
				reference_id,
				vendor_code
			);
		}
	}

	async orderWorkAdvantage({ vendor_code, reference_id, options, brand_sku, quantity }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';

			const workAdvantageDetails = new WorkAdvantageDetails(this.itemsService, this.accountabilitySchema);
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			/* Always create a Entry in orders table if entry not already there */
			if (!vendorOrderDetail) {
				const addVOrder = await set.addVendorOrder(reference_id, vendorId, vendor_code);
			}

			const { vouchers, success, message, exception, orderId } = await workAdvantageDetails.placeNewWaOrder(
				reference_id,
				quantity,
				brand_sku,
				vendor_code,
				options
			);

			/* Update Order Status for Vendor */
			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderId,
				success ? 'completed' : 'pending',
				vendor_code
			);

			const result = success
				? await workAdvantageDetails.storeToInventory({
					vouchers,
					reference_id,
					orderId,
					options,
					brand_sku,
					vendor_code,
				})
				: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;

			const newVouchersResponse: any = {
				success,
				message,
				keys: keys ? keys : null,
				exception,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: helpers.convertExpiryIstToTs(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `orderWorkAdvantage Error : ${e}`,
				},
				reference_id,
				vendor_code
			);

			return {
				success: false,
				message: 'Server Error Occurred',
				vendorCode: vendor_code,
			};
		}
	}

	async orderQCAmazon({ vendor_code, reference_id, options, brand_sku, quantity, env }) {
		try {
			// Check if the prefix is not present and add it if necessary
			if (!reference_id.startsWith(env.SD_PREFIX)) {
				reference_id = env.SD_PREFIX + reference_id;
			}

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';
			let vendorReferenceAppend: any = '';
			let isOrderComplete = false;

			/* Initializing QC Amazon Controller Object */
			const qcAmazonController = new QCAmazonController(this.itemsService, this.accountabilitySchema);

			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			vendorReferenceAppend =
				vendorOrderDetail && vendorOrderDetail['reference_append'] ? vendorOrderDetail['reference_append'] : 0;

			/* Appended Reference ID, it is just normal reference id if there is no append */
			let appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

			/* Checking the status of the reference id or appended reference id */
			const orderStatus: any = await qcAmazonController.checkOrderStatus(appendedReferenceId, vendor_code);

			/* if order is cancelled, we need to increment the reference append */
			if (orderStatus['status'] == 'CANCELED') {
				/* Since QC Order is Cancelled, We must modify the reference id and place fresh order */
				vendorReferenceAppend = vendorReferenceAppend * 1 + 1;
				appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

				/* Save the new incremented reference append */
				const saveNewRefAppend = await set.updateVendorOrderReferenceAppend(
					reference_id,
					vendorReferenceAppend,
					vendor_code
				);
			} else if (orderStatus['status'] == 'PENDING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PENDING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PROCESSING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PROCESSING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'COMPLETE') {
				vendorOrderId = orderStatus['orderId'];
				isOrderComplete = true;
			}

			/* Always create a Entry in orders table if entry not already there */
			if (!vendorOrderDetail) {
				const addVOrder = await set.addVendorOrder(reference_id, vendorId, vendor_code);
			}

			const { vouchers, success, message, exception, orderId, status, statusCode, walletBalance } =
				await qcAmazonController.placeOrder(
					appendedReferenceId,
					quantity,
					brand_sku,
					options,
					vendorOrderId,
					isOrderComplete,
					vendor_code
				);

			/* Update Order Status for Vendor */
			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderId,
				success || isOrderComplete ? 'completed' : 'pending',
				vendor_code
			);

			if (walletBalance) {
				/* Save wallet balance */
				try {
					const walletBalanceSetResponse = await set.updateVendorWalletBalance(vendorId, walletBalance);
				} catch (e) {
					await new LogSys().jsonError(
						{
							exception: e,
							error: 'Wallet Updation Error',
						},
						reference_id,
						vendor_code
					);
				}
			}

			const result = success
				? await qcAmazonController.storeToInventory({
					vouchers,
					reference_id,
					orderId,
					options,
					brand_sku,
					vendor_code,
				})
				: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;

			const newVouchersResponse: VoucherResponse = {
				success,
				message,
				keys: keys || null,
				exception,
				orderStatusFromVendor: status,
				statusCodeFromVendor: statusCode,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: new Date(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `orderQCAmazon Error : ${e}`,
				},
				reference_id,
				vendor_code
			);

			return {
				success: false,
				message: `Server Error Occurred : ${e}`,
				vendorCode: vendor_code,
			};
		}
	}

	async orderFlipkart({ vendor_code, reference_id, options, brand_sku, quantity, env }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			const vendorOrderDetail: any = [];
			const vendorOrderId: any = '';

			/* Checking for flipkart */
			const flipkartController = new FlipkartEgvController(this.itemsService, this.accountabilitySchema);

			let { giftCardList, success, message, exception, orderId, vendorCode } =
				await flipkartController.flipkartplaceOrder(
					reference_id,
					quantity,
					brand_sku,
					options,
					vendorOrderId,
					vendor_code
				);

			const flipkartEgvResponse: VoucherResponse = {
				success: success,
				message: message || '',
				response: [],
				keys: [],
				orderStatusFromVendor: '',
				statusCodeFromVendor: '',
				exception: exception,
				vendorCode: vendor_code,
			};

			if (quantity !== giftCardList.length) {
				success = false;
			}
			const result =
				giftCardList.length !== 0
					? await flipkartController.storeToInventory(
						giftCardList,
						reference_id,
						options,
						vendor_code,
						brand_sku,
						success
					)
					: null;

			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;
			flipkartEgvResponse.keys = keys;

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success) {
				VoucherList.forEach(({ egv, link_reference_id, reference_code_otp }) => {
					const validity = helpers.convertDateFormat(egv.expiryDate);

					const myVoucher = {
						code: egv.code,
						pin: egv.pin,
						expiry: validity,
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					flipkartEgvResponse.response.push(myVoucher);
				});
			}
			flipkartEgvResponse.success = success;
			flipkartEgvResponse.exception = success ? false : true;
			return flipkartEgvResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'Flipkart Error ',
				},
				reference_id,
				vendor_code
			);

			return {
				success: false,
				message: 'Server Error Occurred',
				vendorCode: vendor_code,
			};
		}
	}

	async orderQuickCilver({ vendor_code, reference_id, options, brand_sku, quantity, env }) {
		try {
			// Check if the prefix is not present and add it if necessary
			if (!reference_id.startsWith(env.SD_PREFIX)) {
				reference_id = env.SD_PREFIX + reference_id;
			}

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';
			let vendorReferenceAppend: any = '';
			let isOrderComplete = false;

			/* Initializing QC Controller Object */
			const qcController = new QucikCilverController(this.itemsService, this.accountabilitySchema);

			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			vendorReferenceAppend =
				vendorOrderDetail && vendorOrderDetail['reference_append'] ? vendorOrderDetail['reference_append'] : 0;

			/* Appended Reference ID, it is just normal reference id if there is no append */
			let appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

			/* Checking the status of the reference id or appended reference id */
			const orderStatus: any = await qcController.checkOrderStatus(appendedReferenceId, vendor_code);

			/* if order is cancelled, we need to increment the reference append */
			if (orderStatus['status'] == 'CANCELED') {
				/* Since QC Order is Cancelled, We must modify the reference id and place fresh order */
				vendorReferenceAppend = vendorReferenceAppend * 1 + 1;
				appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;

				/* Save the new incremented reference append */
				const saveNewRefAppend = await set.updateVendorOrderReferenceAppend(
					reference_id,
					vendorReferenceAppend,
					vendor_code
				);
			} else if (orderStatus['status'] == 'PENDING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PENDING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'PROCESSING') {
				const newVouchersResponse: VoucherResponse = {
					success: false,
					message: 'Order Status: PROCESSING',
					keys: null,
					exception: false,
					orderStatusFromVendor: null,
					statusCodeFromVendor: null,
					vendorCode: vendor_code,
					response: [],
				};

				return newVouchersResponse;
			} else if (orderStatus['status'] == 'COMPLETE') {
				vendorOrderId = orderStatus['orderId'];
				isOrderComplete = true;
			}

			/* Always create a Entry in orders table if entry not already there */
			if (!vendorOrderDetail) {
				const addVOrder = await set.addVendorOrder(reference_id, vendorId, vendor_code);
			}

			const { vouchers, success, message, exception, orderId, status, statusCode, walletBalance } =
				await qcController.placeOrder(
					appendedReferenceId,
					quantity,
					brand_sku,
					options,
					vendorOrderId,
					isOrderComplete,
					vendor_code
				);

			/* Update Order Status for Vendor */
			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderId,
				success || isOrderComplete ? 'completed' : 'pending',
				vendor_code
			);

			if (walletBalance) {
				/* Save wallet balance */
				try {
					const walletBalanceSetResponse = await set.updateVendorWalletBalance(vendorId, walletBalance);
				} catch (e) {
					await new LogSys().jsonError(
						{
							exception: e,
							error: 'Wallet Updation Error',
						},
						reference_id,
						vendor_code
					);
				}
			}

			const result = success
				? await qcController.storeToInventory({ vouchers, reference_id, orderId, options, brand_sku, vendor_code })
				: null;
			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;

			const newVouchersResponse: VoucherResponse = {
				success,
				message,
				keys: keys || null,
				exception,
				orderStatusFromVendor: status,
				statusCodeFromVendor: statusCode,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: new Date(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `orderQC Error : ${e}`,
				},
				reference_id,
				vendor_code
			);

			return {
				success: false,
				message: `Server Error Occurred : ${e}`,
				vendorCode: vendor_code,
			};
		}
	}

	async orderRewardStore({ vendor_code, reference_id, options, brand_sku, quantity, env }) {
		try {
			// Check if the prefix is not present and add it if necessary
			if (!reference_id.startsWith(env.SD_PREFIX)) {
				reference_id = env.SD_PREFIX + reference_id;
			}
			let vendorOrderDetail: any = [];
			let vendorOrderId: any = '';
			let vendorReferenceAppend: any = '';
			let isOrderComplete = false;


			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const vendorDetails = await get.getVendorFromVendorCode(vendor_code, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;
			const rewardController = new RewardStoreController(this.itemsService, this.accountabilitySchema);

			/* Getting Vendor Order Details and Reference Append */
			vendorOrderDetail = await get.getVendorOrderFromRef(reference_id, vendorId, vendor_code);

			vendorOrderId =
				vendorOrderDetail && vendorOrderDetail['vendor_order_id'] ? vendorOrderDetail['vendor_order_id'] : null;

			vendorReferenceAppend =
				vendorOrderDetail && vendorOrderDetail['reference_append'] ? vendorOrderDetail['reference_append'] : 0;

			/* Appended Reference ID, it is just normal reference id if there is no append */
			let appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;
			/* Always create a Entry in orders table if entry not already there */
			if (!vendorOrderDetail) {
				const addVOrder = await set.addVendorOrder(reference_id, vendorId, vendor_code);
			}


			const { vouchers, success, message, orderID, status, exception, statusCode }: any = await rewardController.placeOrder(
				appendedReferenceId,
				quantity,
				brand_sku,
				options,
				vendorOrderId,
				isOrderComplete,
				vendor_code
			);

			// if (orderData['status'] == 'CANCELLED') {

			// 	vendorReferenceAppend = vendorReferenceAppend * 1 + 1;
			// 	appendedReferenceId = vendorReferenceAppend ? `${reference_id}-${vendorReferenceAppend}` : reference_id;
			// 	const saveNewRefAppend = await set.updateVendorOrderReferenceAppend(
			// 		reference_id,
			// 		vendorReferenceAppend,
			// 		vendor_code
			// 	);

			// } else if (orderData['status'] == 'PENDING') {
			// 	const newVouchersResponse: VoucherResponse = {
			// 		success: false,
			// 		message: 'Order Status: PENDING',
			// 		keys: null,
			// 		exception: false,
			// 		orderStatusFromVendor: null,
			// 		statusCodeFromVendor: null,
			// 		vendorCode: vendor_code,
			// 		response: [],
			// 	};

			// 	return newVouchersResponse;

			// } else if (orderData['status'] == 'COMPLETE') {
			// 	vendorOrderId = orderData['id'];
			// 	isOrderComplete = true;
			// }

			const addVOrder = await set.updateVendorOrderStatus(
				reference_id,
				vendorOrderId ? vendorOrderId : orderID,
				success || isOrderComplete ? 'completed' : 'pending',
				vendor_code
			);
			const result = success
				? await rewardController.storeToInventory({ vouchers, reference_id, orderID, options, brand_sku, vendor_code })
				: null;
			const keys = result?.keys ?? null;
			const VoucherList = result?.VoucherList ?? null;


			const newVouchersResponse: VoucherResponse = {
				success,
				message,
				keys: keys || null,
				exception,
				orderStatusFromVendor: status,
				statusCodeFromVendor: statusCode,
				vendorCode: vendor_code,
				response: [],
			};

			/* Step 2 - We convert the vouchers from WorkAdvantage to our format as present in models */
			if (success && VoucherList && VoucherList.length) {
				VoucherList.forEach(({ cardnumber, pin_or_url, expiry, link_reference_id, reference_code_otp }) => {
					const myVoucher = {
						code: cardnumber,
						pin: pin_or_url,
						expiry: new Date(expiry),
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
					};

					newVouchersResponse.response.push(myVoucher);
				});
			}

			return newVouchersResponse;


		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'Reward Store Error ',
				},
				reference_id,
				vendor_code
			);

			return {
				success: false,
				message: 'Server Error Occurred',
				vendorCode: vendor_code,
			};

		}

	}
	async placeNewOrderAndStoreVoucher({ vendor_code, reference_id, options, brand_sku, quantity, env }) {
		try {

			const get = new Getters(this.itemsService, this.accountabilitySchema);


			switch (vendor_code) {


				/* WorkAdvantage Integration */
				case CONFIG.vendor_id_mapping.WORK_ADVANTAGE:
					return this.orderWorkAdvantage({ vendor_code, reference_id, options, brand_sku, quantity });
				case CONFIG.vendor_id_mapping.AMAZON_QC:
					return this.orderQCAmazon({ vendor_code, reference_id, options, brand_sku, quantity, env });
				case CONFIG.vendor_id_mapping.FLIPKART_EGV:
					return this.orderFlipkart({ vendor_code, reference_id, options, brand_sku, quantity, env });
				case CONFIG.vendor_id_mapping.QUICKCILVER_EGV:
					return this.orderQuickCilver({ vendor_code, reference_id, options, brand_sku, quantity, env });
				case CONFIG.vendor_id_mapping.REWARD_STORE:
					return this.orderRewardStore({ vendor_code, reference_id, options, brand_sku, quantity, env })
			}

			return {
				success: false,
				message: 'Unknown Vendor',
				vendorCode: vendor_code,
			};
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'PrevOrd placeNewOrderAndStoreVoucher Error',
				},
				reference_id,
				vendor_code
			);
		}

		return {
			success: false,
			message: 'PrevOrd placeNewOrderAndStoreVoucher Error',
			vendorCode: vendor_code,
		};
	}

	async getLinkVouchers({ link_reference_id, reference_code_otp, env }) {
		try {
			await new LogSys().log(
				'get Link Voucher Controller:' + link_reference_id + '-' + reference_code_otp,
				false,
				null,
				null
			);
			await new LogSys().log(`getLinkVouchers step 2:${link_reference_id}-${reference_code_otp} `, false, null, null);

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			let getResponse = await get.inventoryOtpVerification(link_reference_id, reference_code_otp);

			if (getResponse.length !== 0) {
				const { product_code, price, link_ledger_reference_id, soft_link_redeemed_status, id } = getResponse[0];
				let sku = product_code;
				let inventoryId = id;
				let amount = price;
				await new LogSys().log(`getLinkVouchers step 3:${sku}-${amount}-${inventoryId}`, false, null, null);

				return await this.getLinkVoucherDetails({
					sku,
					amount,
					link_reference_id,
					link_ledger_reference_id,
					env,
					soft_link_redeemed_status,
					inventoryId,
				});
			} else {
				return {
					success: false,
					message: 'Not Found Record!. Please Contact The administrator.',
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `getLinkVouchers Error ${e}`,
				},
				null,
				null
			);
			return {
				success: false,
				message: 'Not Found Record!. Please Contact The administrator.',
			};
		}
	}

	async getLinkVoucherDetails({
		sku,
		amount,
		link_reference_id,
		link_ledger_reference_id,
		env,
		soft_link_redeemed_status,
		inventoryId,
	}) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let getVoucherDetails: any = [];
			let newVouchersResponse = {
				success: true,
				message: 'Voucher Successfully Fetched',
				amount: '',
				voucher: '',
				pin: '',
				valid_till: '',
				brand_details: {},
			};

			let getBrandDetails = await get.getBrandSkuMappingbySku(sku);

			if (!soft_link_redeemed_status) {
				let getOneRedeemDetails = await get.getCampaignRedemptions(link_reference_id, env);
				if (getOneRedeemDetails?.data.success) {
					let redeemedId = getOneRedeemDetails?.data.data.soft_link_redemption_id || '';
					await new LogSys().log(`redeemedId:${redeemedId}`, false, null, null);

					if (!redeemedId) {
						await new LogSys().log(
							'get Link VoucherDetails Controller:' + sku + '-' + amount + '-' + link_reference_id,
							false,
							null,
							null
						);
						await new LogSys().log(
							`getLinkVoucherDetails step 4:${sku}-${amount}-${link_reference_id}`,
							false,
							null,
							null
						);
						//soft_link_order_id is first  order id of soft link
						let soft_link_order_id = sku + '-' + link_reference_id;
						if (soft_link_order_id) {
							await new LogSys().log(`getLinkVoucherDetails step 5:${soft_link_order_id}`, false, null, null);
							getVoucherDetails = await get.getLinkVoucherDetailsbyorderid(soft_link_order_id);
						}
						await new LogSys().log('getLinkVoucherDetails orderId:' + link_ledger_reference_id, false, null, null);
						await new LogSys().log(
							`getLinkVoucherDetails link_ledger_reference_id:${link_ledger_reference_id}`,
							false,
							null,
							null
						);

						//link_ledger_reference_id is new order id of soft link
						if (link_ledger_reference_id && getVoucherDetails.length === 0) {
							await new LogSys().log(`getLinkVoucherDetails step 6:${link_ledger_reference_id}`, false, null, null);

							getVoucherDetails = await get.getLinkVoucherDetailsbyorderid(link_ledger_reference_id);
						}

						if (getVoucherDetails.length === 0 && (soft_link_order_id || link_ledger_reference_id)) {
							await new LogSys().log(`getLinkVoucherDetails step 7:${getVoucherDetails.length}`, false, null, null);
							getVoucherDetails = await get.getLinkVoucherDetails(sku, amount);
						}

						let updateResponse = {};
						if (getVoucherDetails.length !== 0) {
							await new LogSys().log(`getLinkVoucherDetails step 8:${getVoucherDetails.length}`, false, null, null);

							const voucherDetails = getVoucherDetails[0];
							if (!voucherDetails.gift_card) {
								await new LogSys().log(`getLinkVoucherDetails step 9:${voucherDetails.gift_card}`, false, null, null);

								if (link_ledger_reference_id) {
									await new LogSys().log(`link_ledger_reference_id:${link_ledger_reference_id}`, false, null, null);
									updateResponse = await set.updateLinkVoucherStatus(voucherDetails.id, link_ledger_reference_id);
								} else {
									await new LogSys().log(`soft_link_order_id:${soft_link_order_id}`, false, null, null);
									updateResponse = await set.updateLinkVoucherStatus(voucherDetails.id, soft_link_order_id);
								}
								await set.softLinkOtpVerificationUpdate(inventoryId);

								await set.updateSoftLinkRedemptionInCampaigns(link_reference_id, updateResponse, env);
							}

							newVouchersResponse.voucher = voucherDetails.code;
							newVouchersResponse.pin = voucherDetails.pin;
							newVouchersResponse.valid_till = voucherDetails.validity;
							newVouchersResponse.amount = voucherDetails.price;
							newVouchersResponse.brand_details = getBrandDetails;
							return newVouchersResponse;
						} else {
							newVouchersResponse.message = 'Not Fetched Voucher Details . Please Contact The administrator.';
							newVouchersResponse.success = false;

							return newVouchersResponse;
						}
					} else {
						await new LogSys().log(` redeemedId:${redeemedId}`, false, null, null);
						let voucher = await get.getInventoryByid(redeemedId);
						await new LogSys().log(` voucher:${voucher}`, false, null, null);
						if (!soft_link_redeemed_status) {
							await set.softLinkOtpVerificationUpdate(inventoryId);
						}

						newVouchersResponse.voucher = voucher[0].code;
						newVouchersResponse.pin = voucher[0].pin;
						newVouchersResponse.valid_till = voucher[0].validity;
						newVouchersResponse.amount = voucher[0].price;
						newVouchersResponse.brand_details = getBrandDetails;
						return newVouchersResponse;
					}
				} else {
					newVouchersResponse.message = 'Not Fetched Voucher Details! Please Contact The administrator.';
					newVouchersResponse.success = false;

					return newVouchersResponse;
				}
			} else {
				if (soft_link_redeemed_status) {
					await new LogSys().log(` soft_link_redeemed_status:${soft_link_redeemed_status}`, false, null, null);
					let getOneRedeem: any = await get.getCampaignRedemptions(link_reference_id, env);
					await new LogSys().log(` getOneRedeem:${getOneRedeem.data}`, false, null, null);
					if (getOneRedeem.data.success) {
						let redeemedId = getOneRedeem.data.data.soft_link_redemption_id || '';
						if (redeemedId) {
							let voucher = await get.getInventoryByid(redeemedId);

							newVouchersResponse.voucher = voucher[0].code;
							newVouchersResponse.pin = voucher[0].pin;
							newVouchersResponse.valid_till = voucher[0].validity;
							newVouchersResponse.amount = voucher[0].price;
							newVouchersResponse.brand_details = getBrandDetails;

							return newVouchersResponse;
						} else {
							newVouchersResponse.message = 'Not Fetched Voucher Details! Please Contact The administrator.';
							newVouchersResponse.success = false;

							return newVouchersResponse;
						}
					} else {
						newVouchersResponse.message = 'Not Fetched Voucher Details Please Contact The administrator.';
						newVouchersResponse.success = false;

						return newVouchersResponse;
					}
				}
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get Link Voucher Details Error',
				},
				null,
				null
			);

			return {
				success: false,
				message: 'get Link Voucher Details Error',
			};
		}
	}

	async otpVerification({ link_reference_id, reference_code_otp }) {
		try {
			await new LogSys().log(` otpVerification:${link_reference_id}-${reference_code_otp}`, false, null, null);

			const get = new Getters(this.itemsService, this.accountabilitySchema);

			let getResponse = await get.inventoryOtpVerification(link_reference_id, reference_code_otp);

			if (getResponse.length !== 0) {
				await new LogSys().log(` OTP Verified:${link_reference_id}-${reference_code_otp}`, false, null, null);

				return {
					success: true,
					message: 'OTP Verified',
				};
			} else {
				return {
					success: false,
					message: 'Invalid OTP/Code',
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'otpVerification Error',
				},
				null,
				null
			);

			return null;
		}
	}

	async otpUpdate({ link_reference_id, reference_code_otp, old_reference_code_otp }) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let getResponse = await get.getInventoryByreferance(link_reference_id, old_reference_code_otp);

			if (getResponse.length !== 0) {
				if (getResponse[0].link_reference_id === link_reference_id) {
					let getUpdateResponce = await set.updateOtp(getResponse[0].id, reference_code_otp, link_reference_id);

					getResponse = await get.getInventoryByid(getUpdateResponce);

					return {
						success: true,
						message: 'OTP Updated',
						response: getResponse,
					};
				} else {
					return {
						success: false,
						message: 'OTP Not Updated! Due to Link Reference Id Not Matched ',
					};
				}
			} else {
				return {
					success: false,
					message: 'OTP Not Updated',
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: `OTP Not Updated ${e}`,
				},
				null,
				null
			);

			return {
				success: false,
				message: 'OTP Not Updated',
			};
		}
	}

	async getOneVocher(id: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let getResponse = await get.getVoucherBySoftLinkId(id);

			if (getResponse.length !== 0) {
				return getResponse;
			} else {
				return [];
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getOneVocher Error',
				},
				null,
				null
			);
		}
	}

	async referenceUpdate(id: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let getUpdateResponce = await set.referenceupdate(id);

			if (getUpdateResponce) {
				return {
					success: true,
					message: 'Record Updated',
				};
			} else {
				return {
					success: true,
					message: 'Record not Updated',
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'referenceUpdate',
				},
				null,
				null
			);
		}
	}

	getRedispatchDetails = async (transactionId: any) => {
		try {
			const vendorVoucher = new VendorVouchers();
			const res = await vendorVoucher.getFlipkartRedispatch(transactionId);

			return res;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'getRedispatchDetails',
				},
				null,
				null
			);
			return { success: false, error: e };
		}
	};

	generateFlipkartVoucher = async (transactionId: any, denomination: any) => {
		try {
			const vendorVoucher = new VendorVouchers();
			const res = await vendorVoucher.generateFlipkartVoucher(transactionId, denomination);

			return res;
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'generateFlipkartVoucher',
				},
				null,
				null
			);
			return { success: false, error: e };
		}
	};

	updateCatalog = async ({ vendorApiIntId, countryCode }) => {
		let getUpdateResponce: any = [];
		await new LogSys().log(`update catalog initialize`, false, null, null);

		try {
			switch (vendorApiIntId) {
				case CONFIG.vendor_id_mapping.QUICKCILVER_EGV:
					getUpdateResponce = await this.updateQuickCilverCatalogId({ countryCode, vendorApiIntId });
					break;
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'updateCatalog',
				},
				null,
				null
			);
			return {
				success: false,
				error: e,
				message: 'record',
			};
		}
		return getUpdateResponce;
	};

	updateQuickCilverCatalogId = async ({ countryCode, vendorApiIntId }) => {
		try {
			await new LogSys().log(`update catalog controller vendorApiIntId ${vendorApiIntId}`, false, null, null);

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();
			const vendorDetails = await get.getVendorFromVendorCode(vendorApiIntId, null);
			await new LogSys().log(`vendorDetails ${vendorDetails}`, false, null, null);

			const id = vendorDetails ? vendorDetails['id'] : null;
			/* Call get Catalog method of vendorVouchers */
			const { categoryId } = await vendorVoucher.updateQuickCilverCatalog();
			await new LogSys().log(`categoryId ${categoryId}`, false, null, null);
			await new LogSys().log(`id ${id}`, false, null, null);

			if (categoryId && id) {
				/* Update Order Status for Vendor */
				const getUpdateResponce = await set.updateVendorCategoryId(id, categoryId);

				if (getUpdateResponce) {
					return {
						success: true,
						message: 'Record Updated',
					};
				} else {
					await new LogSys().log(`categoryId Record not Updated`, false, null, null);

					return {
						success: true,
						message: 'Record not Updated',
					};
				}
			} else {
				return {
					success: true,
					message: 'Record not Updated, Due to CategoryId / Vendorid Not Available',
				};
			}
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'updateQuickCilverCatalogId',
				},
				null,
				null
			);
			return [];
		}
	};

	getQCBalance = async (cardNumber: any, pin: any) => {
		try {
			const vendorVoucher = new VendorVouchers();
			await new LogSys().log(`getQCBalance`, false, null, null);
			const { status, message, balance, responseJson } = await vendorVoucher.getQCWalletBalance(cardNumber, pin);
			return { status, message, balance, responseJson };
		} catch (e) {
			return { success: false, error: e };
		}
	};

	inventoryReport = async (start_date: any, end_date: any, limit: any) => {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			const vendorVoucher = new VendorVouchers();
			await new LogSys().log(`getQCBalance`, false, null, null);

			const inventoryList = await get.inventoryRedeemList(start_date, end_date, limit);
			const success = inventoryList.length !== 0;

			if (success) {
				for (let i = 0; i < inventoryList.length; i++) {
					let pin = inventoryList[i].pin.replace(/-/g, '');
					let code = inventoryList[i].code;

					if (pin && code) {
						const { status, message, balance, responseJson } = await vendorVoucher.getQCWalletBalance(code, pin);

						if (status && balance > 0) {
							let balObj: any = {};
							balObj.giftcard_inventory_id = inventoryList[i].id;
							balObj.balance = responseJson.balance;
							balObj.validity = responseJson.expiry;
							balObj.code_status = responseJson.status;
							await set.sd_giftcard_inventory_balance_report(balObj);
							await set.updateCheckBalaceStatus(inventoryList[i].id);
						}
					} else {
						await new LogSys().log(`Pin Not Available id: ${inventoryList[i].id}`, false, null, null);
					}
				}
			}

			return { success, inventoryList };
		} catch (e) {
			await new LogSys().log(`inventoryReport ${e}`, false, null, null);

			return { success: false, error: e };
		}
	};

	revalidateInventoryReport = async (start_date: any, end_date: any) => {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			const vendorVoucher = new VendorVouchers();
			await new LogSys().log(`Revalidate Inventory Report`, false, null, null);

			const inventoryList = await get.inventoryRedeemListRevlidate(start_date, end_date);
			const success = inventoryList.length !== 0;
			for (let i = 0; i < inventoryList.length; i++) {
				let pin = inventoryList[i].giftcard_inventory_id.pin.replace(/-/g, '');
				let code = inventoryList[i].giftcard_inventory_id.code;
				if (pin && code) {
					const { status, message, balance, responseJson } = await vendorVoucher.getQCWalletBalance(code, pin);

					if (status && balance > 0) {
						const validity = responseJson.expiry;
						await set.revalidateCheckBalaceStatus(inventoryList[i].id, validity);
					}
				} else {
					await new LogSys().log(`Pin Not Available id: ${inventoryList[i].id}`, false, null, null);
				}
			}

			return { success, inventoryList };
		} catch (e) {
			await new LogSys().log(`inventoryReport ${e}`, false, null, null);

			return { success: false, error: e };
		}
	};



}

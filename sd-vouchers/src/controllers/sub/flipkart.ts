import axios from 'axios';
import LogSys from '../../helpers/logger';
import VendorVouchers from '../../vendors';
import helpers from '../../helpers/common';
import Getters from '../../db/getters';
import Setters from '../../db/setters';
import { CONFIG } from '../../config';
import { compress } from '@directus/shared/utils';

/**
 * flikart Controller Class:
 * Objective:
 * Handling all logic of DB Setters and Getters & retrieving Vouchers from Vendor Vouchers .
 * */
export default class FlipkartEgvController {
	get = null;
	set = null;
	services = null;
	accountabilitySchema = null;
	itemsService = null;

	constructor(ItemsService, accountabilitySchema) {
		this.itemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	async flipkartplaceOrder(reference_id:any, quantity:any, brand_sku:any, options:any, vendorOrderId:any, vendor_code:any) {
		try {

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers(this.itemsService, this.accountabilitySchema);

			/* Get Brand Details for a given SKU : returns empty array if brand is Inactive*/
			const brandDetails = await get.getBrandSkuMapping(brand_sku, reference_id, vendor_code);

			const amount = brandDetails ? brandDetails['amount'] : null;
			const currency = brandDetails ? brandDetails['currency'] : null;

			const checkBrandVendorMapping = await get.checkBrandVendorMapping(
				brand_sku,
				amount,
				currency,
				CONFIG.vendor_id_mapping.FLIPKART_EGV,
				reference_id, vendor_code
			);
			const vendorSkuMappingResponse = await get.mappedVendorActiveBrandSKU(brand_sku, vendor_code, reference_id);


			if (
				amount &&
				currency &&
				checkBrandVendorMapping &&
				vendorSkuMappingResponse &&
				vendorSkuMappingResponse['vendor_sku']
			) {
				const vendorSKU = vendorSkuMappingResponse['vendor_sku'];
				const { giftCardList, success, message, codeException,vendorCode } = await vendorVoucher.getFlipkartVoucher(
					quantity,
					reference_id,
					amount,
					vendor_code,
					brand_sku
				);
				await new LogSys().log(`Flipkart Place Order giftCardList status:${success}`, codeException,reference_id,vendor_code);
				await new LogSys().log(`Flipkart Place Order giftCardList message:${message}`, codeException,reference_id,vendor_code);

				return {
					giftCardList, success,message, exception:codeException,orderId: null,vendorCode
				};
			} else {
				return {
					giftCardList: null,
					success: false,
					message: `Either No Vendor Sku Mapping from Brand SKU:${brand_sku} or Incorrect Brand SKU Mapping or Brand Vendor Mapping Absent`,
					exception: false,
					orderId: null,
					vendorCode: vendor_code
				};
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart placeNewWaOrder Error',
			}, reference_id, vendor_code);
			return {
				giftCardList: null,
				success: false,
				message: `${e}`,
				exception: false,
				orderId: null,
				vendorCode: vendor_code
			};
		}
	}

	storeToInventory = async (giftCardList:any, reference_id:any, options:any, vendor_code:any, brand_sku:any,success:any) => {
		try {
			await new LogSys().log('Initialising Flipkart Inventory', false, reference_id, vendor_code);

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const sku = reference_id.split('-')[0];

			const brandDetails = await get.getBrandSkuMapping(sku, reference_id, vendor_code);

			const amount = brandDetails ? brandDetails['amount'] : null;
			const currency = brandDetails ? brandDetails['currency'] : null;
			const brand_name = brandDetails?.brand?.brand_name ?? null;

			const vendorDetails = await get.getVendorFromVendorCode(CONFIG.vendor_id_mapping.FLIPKART_EGV, reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;

			/* Redeemed TRUE/FALSE to set in Giftcard inventory */
			let redeemed = options && options.redeemed && typeof options.redeemed == 'boolean' ? options.redeemed : false;
			let optionsOrderId = options && options.order_id ? options.order_id : null;
			const extra = options && options.extra ? options.extra : {};
			let validity: any;
			const vouchersToSave: any = [];
			let VoucherList = [];
			if (giftCardList.length !== 0) {
				for (let i = 0; i < giftCardList.length; i++) {
					let voucher_order_type = '';
					if (options && options.extra && options.extra.voucher_order_type) {
						voucher_order_type = options.extra.voucher_order_type.toLowerCase();
					}
					let link_reference_id: any = options.link_reference_id || '';
					let reference_code_otp: any = options.reference_code_otp || '';
					validity = helpers.convertDateFormat(giftCardList[i].egv.expiryDate);
					//sd store orders voucher_order_type=link means  zeus has generate the link_reference_id ,reference_code_otp return 
					if (voucher_order_type === "link") {
						link_reference_id = await this.generateUniqueCode();
						reference_code_otp = await this.generateOTP();
						optionsOrderId = "";
						redeemed = false;
						options.soft_link_order_id = !options.soft_link_order_id? brand_sku+ "-"+link_reference_id: ""
					}

					//link_reference_id id present means order id shoule be empty and no need to generate link_reference_id ,reference_code_otp it comming from campaigns.
					if (link_reference_id) {
						optionsOrderId = "";
					}

					const voucher = {
						code: giftCardList[i].egv.code,
						pin: giftCardList[i].egv.pin,
						price: giftCardList[i].egv.balance,
						currency: currency,
						gift_card: redeemed,
						product_code: giftCardList[i].egv.sku,
						order_id: optionsOrderId,
						vendor_order_id: giftCardList[i].egv.transactionId,
						vendors: vendorId,
						validity: validity,
						link_reference_id: link_reference_id,
						reference_code_otp: reference_code_otp,
						soft_link_order_id: options.soft_link_order_id || '',
						link_ledger_reference_id: link_reference_id ? options.reference_id : '',
						bulk_qty_status: success ? success:false,
						brand_name:brand_name,
						...extra,
					};

					vouchersToSave.push(voucher);

					// Add link_reference_id and reference_code_otp directly to the voucher object
					giftCardList[i].link_reference_id = link_reference_id;
					giftCardList[i].reference_code_otp = reference_code_otp;
				}

				VoucherList = giftCardList;
			}

			let keys = [];
			if (vouchersToSave.length !==0) {
				await new LogSys().log('PrevOrd Saving Vouchers to Inventory', false, reference_id, vendor_code);
				// keys = await set.vouchersToInventory(vouchersToSave);
				for (let i = 0; i < vouchersToSave.length; i++) {

				//vouchersToSave[i].vendor_order_id is transactionid, Before saving vouchers in inventory, verify that the code and pin exist and are the same. If there is a pin mismatch, update it because the redispatch API returns a new pin.
				const getExistingInventoryDetails = await get.getVendorTrasanctionDetails(vouchersToSave[i].vendor_order_id);
				
				//check getExistingInventoryDetails length
				if (getExistingInventoryDetails.length !==0) {
					
					if (getExistingInventoryDetails[0].code==vouchersToSave[i].code) {

						if (getExistingInventoryDetails[0].pin!==vouchersToSave[i].pin) {
							set.updateInventoryPin(getExistingInventoryDetails[0].id,vouchersToSave[i].pin)
						}
					}

					if (success && !getExistingInventoryDetails[0].bulk_qty_status) {

						set.updateBulkQuantityStatus(getExistingInventoryDetails[0].id,success)
					}

					keys.push(getExistingInventoryDetails[0].id);
				}else{
					const ids  = await set.vouchersToSingleInventory(vouchersToSave[i]);
					keys.push(ids);
				}

				}

				if (!keys) {
					await new LogSys().log('PrevOrd Retrieving Vouchers from Inventory', false, reference_id, vendor_code);
					keys = await get.voucherKeysFromInventory(
						vouchersToSave.map((obj) => {
							return obj.code;
						})
					);
				}
				await new LogSys().log(`PrevOrd Saved Voucher Keys: ${keys}`, false, reference_id, vendor_code);
			}


			return {
				keys, VoucherList
			};
		} catch (e) {
			await new LogSys().log(`Flipkart Inventory Error: ${e}`, false, reference_id, vendor_code);

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart PrevOrd storeToInventory Error',
			}, reference_id, vendor_code);
			return {
				giftCardList: null,
				keys: null,
				success: false,
				message: `${e}`,
				exception: false,
				orderId: null,
				vendorCode: vendor_code
			};
		}
	};


	async generateUniqueCode() {
		try {

			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			let link_reference_id = await this.generateRandomChars(16);
			const getInventoryData = await get.getVoucherFromInventory(link_reference_id);

			let checkExist = [];
			if (getInventoryData.length !== 0) {
				checkExist = getInventoryData.filter(item => item.link_reference_id == link_reference_id);

			}
			// Keep generating new codes until a unique one is found
			while (checkExist.length > 0) {
				link_reference_id = await this.generateRandomChars(16);
				const inventoryDataList = await get.getVoucherFromInventory(link_reference_id);
				if (inventoryDataList.length !== 0) {
					checkExist = inventoryDataList.filter(item => item.link_reference_id == link_reference_id);
				}
			}

			return link_reference_id;
		} catch (error) {
			await new LogSys().jsonError({
				exception: error,
				error: 'generate Unique Code error',
			}, null, null);
			return null;
		}
	}


	async generateRandomChars(length: any) {
		try {
			const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
			let randomChars = '';
			for (let i = 0; i < length; i++) {
				const randomIndex = Math.floor(Math.random() * chars.length);
				randomChars += chars.charAt(randomIndex);
			}
			return randomChars;
		} catch (error) {
			await new LogSys().jsonError({
				exception: error,
				error: 'generate Random Chars',
			}, null, null);
			return null;
		}

	}

	async generateOTP() {
		try {
			// Generate a random 4-digit number
			const otp = Math.floor(1000 + Math.random() * 9000);
			return otp.toString();
		} catch (error) {
			await new LogSys().jsonError({
				exception: error,
				error: 'generate OTP',
			}, null, null);
			return null;
		}

	}


}

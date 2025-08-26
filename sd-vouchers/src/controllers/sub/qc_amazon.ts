import LogSys from '../../helpers/logger';
import VendorVouchers from '../../vendors';
import Getters from '../../db/getters';
import Setters from '../../db/setters';
import { CONFIG } from '../../config';

/**
 * QC Amazon Controller Class:
 * Objective:
 * Handling all logic of DB Setters and Getters & retrieving Vouchers from Vendor Vouchers .
 * */
export default class QCAmazonController {
	get = null;
	set = null;
	services = null;
	accountabilitySchema = null;
	itemsService = null;

	constructor(ItemsService, accountabilitySchema) {
		this.itemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	async placeOrder(reference_id, quantity, brand_sku, options, vendorOrderId, isOrderComplete,vendor_code) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			/* Get Brand Details for a given SKU : returns empty array if brand is Inactive*/
			const brandDetails = await get.getBrandSkuMapping(brand_sku,reference_id,vendor_code);

			const amount = brandDetails ? brandDetails['amount'] : null;
			const currency = brandDetails ? brandDetails['currency'] : null;

			const checkBrandVendorMapping = await get.checkBrandVendorMapping(
				brand_sku,
				amount,
				currency,
				CONFIG.vendor_id_mapping.AMAZON_QC,reference_id,vendor_code
			);

			const vendorSkuMappingResponse = await get.mappedVendorActiveBrandSKU(brand_sku, CONFIG.vendor_id_mapping.AMAZON_QC,reference_id);

			if (
				amount &&
				currency &&
				checkBrandVendorMapping &&
				vendorSkuMappingResponse &&
				vendorSkuMappingResponse['vendor_sku']
			) {
				const vendorSKU = vendorSkuMappingResponse['vendor_sku'];
				const { vouchers, success, message, exception, orderId, status, statusCode, walletBalance } =
					await vendorVoucher.getQCAmazonVoucher(
						vendorSKU,
						quantity,
						reference_id,
						options.retrieveIfRedeemed,
						amount,
						currency,
						vendorOrderId,
						!!options.syncOnly,
						isOrderComplete,
						vendor_code
					);

				return {
					vouchers,
					success,
					message,
					exception,
					orderId,
					status,
					statusCode,
					walletBalance
				};
			} else {
					await new LogSys().log(`Either No Vendor Sku Mapping from Brand SKU:${brand_sku} or Incorrect Brand SKU Mapping or Brand Vendor Mapping Absent`, false,reference_id,vendor_code);

				return {
					vouchers: null,
					success: false,
					message: `Either No Vendor Sku Mapping from Brand SKU:${brand_sku} or Incorrect Brand SKU Mapping or Brand Vendor Mapping Absent`,
					exception: true,
					orderId: null,
					vendorCode: vendor_code,
				};
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error:  `QC placeNewWaOrder Error : ${e}`,
			},
			reference_id,
				vendor_code);
		}

		return {
			vouchers: null,
			success: false,
			message: `QC placeNewWaOrder Error :`,
			exception: true,
			orderId: null,
			vendorCode: vendor_code,
		};
	}

	async getOrderDetails(reference_id:any,vendorOrderId:any,vendor_code:any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			const { vouchers, success, message, exception, orderId, status } = await vendorVoucher.getQCAmazonOlderOrder(
				reference_id,
				vendorOrderId,vendor_code
			);

			return {
				vouchers,
				success,
				message,
				exception,
				orderId,
				status
			};
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC placeNewWaOrder Error',
			},
			reference_id,
				vendor_code);
		}
	}

	async checkOrderStatus(reference_id:any,vendor_code:any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			const response = await vendorVoucher.getQCAmazonOrderStatus(
				reference_id,
				vendor_code
			);

			return response;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: `QC checkOrderStatus Error : ${e}`,
			},
			reference_id,
			vendor_code);
		}
	}

	storeToInventory = async ({ vouchers, reference_id, orderId, options, brand_sku,vendor_code }) => {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);


			const sku = brand_sku? brand_sku: reference_id.split('-')[0];
	    	const brandDetails = await get.getBrandSkuMapping(sku,reference_id,vendor_code);

			const amount = brandDetails ? brandDetails['amount'] : null;
			const currency = brandDetails ? brandDetails['currency'] : null;
			const brand_name = brandDetails?.brand?.brand_name ?? null;

			const vendorDetails = await get.getVendorFromVendorCode(CONFIG.vendor_id_mapping.AMAZON_QC,reference_id);
			const vendorId = vendorDetails ? vendorDetails['id'] : null;

			/* Redeemed TRUE/FALSE to set in Giftcard inventory */
			let redeemed = options && options.redeemed && typeof options.redeemed == 'boolean' ? options.redeemed : false;
			const optionsOrderId = options && options.order_id ? options.order_id : null;
			const extra = options && options.extra ? options.extra : {};
			/* Step 1 - Save Vouchers inside inventory as Redeemed */

			const vouchersToSave = [];
            let VoucherList = [];

            if (vouchers) {

                    for (let i = 0; i < vouchers.length; i++) {

                    let voucher_order_type = '';
                    if (options && options.extra && options.extra.voucher_order_type) {
                        voucher_order_type = options.extra.voucher_order_type.toLowerCase();
                    } else {
                        // Handle the case where the property or its ancestors are missing
                    }
                    let link_reference_id:any = options.link_reference_id || '';
                    let reference_code_otp = options.reference_code_otp || '';

                    if (voucher_order_type === "link") {
                        link_reference_id = await this.generateUniqueCode();
                        reference_code_otp = await this.generateOTP();
						orderId = "";
						options.soft_link_order_id = !options.soft_link_order_id? brand_sku+ "-"+link_reference_id: ""
						redeemed=false;
                    }

                    const voucher = {
                        code: vouchers[i].cardnumber,
                        pin: vouchers[i].pin_or_url,
                        product_code: sku,
                        price: amount,
                        currency: currency,
                        gift_card: redeemed,
                        order_id: optionsOrderId,
                        vendor_order_id: orderId,
                        vendors: vendorId,
						validity: new Date(vouchers[i].expiry),
                        link_reference_id: link_reference_id,
                        reference_code_otp: reference_code_otp,
						soft_link_order_id: options.soft_link_order_id || '',
						link_ledger_reference_id:link_reference_id ? options.reference_id : '',
						brand_name:brand_name,
                        ...extra,
                    };

                    vouchersToSave.push(voucher);

                    // Add link_reference_id and reference_code_otp directly to the voucher object
                    vouchers[i].link_reference_id = link_reference_id;
                    vouchers[i].reference_code_otp = reference_code_otp;
                }

                VoucherList = vouchers;
            }
			let keys = [];
			if (vouchersToSave.length) {
				await new LogSys().log('PrevOrd Saving Vouchers to Inventory', false,reference_id,
				vendor_code);
				keys = await set.vouchersToInventory(vouchersToSave);
				if (!keys) {
					await new LogSys().log('PrevOrd Retrieving Vouchers from Inventory', false,reference_id,
					vendor_code);
					keys = await get.voucherKeysFromInventory(
						vouchersToSave.map((obj) => {
							return obj.code;
						})
					);
				}
				await new LogSys().log(`PrevOrd Saved Voucher Keys:${keys}`, false,reference_id,
				vendor_code);
			}

			return {
				keys, VoucherList
			};
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'PrevOrd storeToInventory Error',
				
			},
			 reference_id,
				vendor_code);
		}
	};

	async generateUniqueCode() {
        try {
            
        const get = new Getters(this.itemsService, this.accountabilitySchema);
        const set = new Setters(this.itemsService, this.accountabilitySchema);
        let link_reference_id = await this.generateRandomChars(16);
        const getInventoryData = await get.getVoucherFromInventory(link_reference_id);

        let checkExist = [];
        if (getInventoryData.length !==0) {
            checkExist = getInventoryData.filter(item => item.link_reference_id == link_reference_id);

        }
        // Keep generating new codes until a unique one is found
        while (checkExist.length > 0) {
            link_reference_id = await this.generateRandomChars(16);
            const inventoryDataList = await get.getVoucherFromInventory(link_reference_id);
            if (inventoryDataList.length !==0) {
            checkExist = inventoryDataList.filter(item => item.link_reference_id == link_reference_id);
            }
        }

        return link_reference_id;
    } catch (error) {
		await new LogSys().jsonError({
			exception: error,
			error: 'generate Unique Code Error',
			
		},
		 null,
		 null);
		return null
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
				error: 'generate Random Chars Error',
				
			},
			 null,
			 null);
			 return null

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
				error: 'generate OTP Error',
				
			},
			 null,
			 null);

			 return null

		}
      
    }
}

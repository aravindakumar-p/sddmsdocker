import helpers from '../../helpers/common';
import { Voucher, VoucherResponse } from '../../models/common';
import Getters from '../../db/getters';
import Setters from '../../db/setters';
import VendorVouchers from '../../vendors';
import LogSys from '../../helpers/logger';

export default async function workAdvantageController({
	voucherRequest,
	services,
	accountabilitySchema,
	bestVendorId,
	options,
}) {
	try {
		const { amt, qty, sku } = voucherRequest;

		/* Redeemed TRUE/FALSE to set in Giftcard inventory */
		const redeemed = options && options.redeemed && typeof options.redeemed == 'boolean' ? options.redeemed : false;
		const optionsOrderId = options && options.order_id ? options.order_id : null;
		const referenceId = options && options.reference_id ? options.reference_id : null;
		const extra = options && options.extra ? options.extra : {};
		const retrieveIfRedeemed = options && options.retrieveIfRedeemed != null ? options.retrieveIfRedeemed : true;

		const { ItemsService } = services;

		const get = new Getters(ItemsService, accountabilitySchema);
		const set = new Setters(ItemsService, accountabilitySchema);

		/* Step 1 - Get the Mapped Vendor SKU */
		const vendorSkuMappingResponse = await get.mappedVendorSKU(sku);

		if (!vendorSkuMappingResponse) {
			const workAdvResponse: VoucherResponse = {
				success: false,
				message: 'Vendor SKU Mapping Incorrect',
				response: [],
			};
			return workAdvResponse;
		}

		const vendorSKU = vendorSkuMappingResponse['vendor_sku'];

		/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
		const vendorVoucher = new VendorVouchers();

		/* Step 2 - from the Mapped SKU, use vendor voucher class to retrieve vouchers from WorkAdvantage */
		const { vouchers, success, message, exception, orderId } = await vendorVoucher.getWorkAdvantageVoucher(
			vendorSKU,
			qty,
			referenceId,
			retrieveIfRedeemed
		);

		/* Step 3 -if vouchers come from WorkAdvantage we shall save those vouchers
		 * if success is false:
		 * we send the error from the WorkAdvantage API, which could possibly be low wallet balance.
		 * */
		if (success) {
			/* Step 4 - Save Vouchers inside inventory as Redeemed */
			const vouchersToSave = [];
			if (vouchers) {
				vouchers.forEach(({ cardnumber, pin_or_url, expiry }) => {
					vouchersToSave.push({
						code: cardnumber,
						pin: pin_or_url,
						product_code: sku,
						price: amt,
						gift_card: redeemed,
						order_id: optionsOrderId,
						vendor_order_id: orderId,
						vendors: bestVendorId,
						validity: helpers.convertExpiryIstToTs(expiry),
						...extra,
					});
				});
			}

			let keys = [];
			if (vouchersToSave.length) {
				await new LogSys().log('Saving Vouchers to Inventory', false);
				keys = await set.vouchersToInventory(vouchersToSave);
				if (!keys) {
					await new LogSys().log('Retrieving Vouchers from Inventory', false);
					keys = await get.voucherKeysFromInventory(
						vouchersToSave.map((obj) => {
							return obj.code;
						})
					);
				}
				await new LogSys().log('Saved Voucher Keys:' + JSON.stringify(keys), false);
			}

			const workAdvResponse: VoucherResponse = {
				success,
				message,
				keys,
				exception,
				response: [],
			};

			/* Step 5 - We convert the vouchers from WorkAdvantage to our format as present in models */
			vouchers.forEach(({ cardnumber, pin_or_url, expiry }) => {
				const myVoucher: Voucher = {
					code: cardnumber,
					pin: pin_or_url,
					expiry: helpers.convertExpiryIstToTs(expiry),
				};
				workAdvResponse.response.push(myVoucher);
			});

			/* Step 6 - We send vouchers response */
			return workAdvResponse;
		} else {
			/* Failure Case: we send response with success:false and error message */
			const workAdvResponse: VoucherResponse = {
				success,
				message,
				exception,
				response: [],
			};
			return workAdvResponse;
		}
	} catch (e) {
		await new LogSys().jsonError({
			exception: e,
			error: 'workAdvantageController Error',
		});
		const workAdvResponse: VoucherResponse = {
			success: false,
			exception: true,
			message: 'Exception occurred: ' + e,
			response: [],
		};
		return workAdvResponse;
	}
}

import { VoucherResponse } from '../models/common';
import Getters from '../db/getters';
import Setters from '../db/setters';
import VendorVouchers from '../vendors';
import config from '../config.json';
import LogSys from '../helpers/logger';
import CoreController from './core-controller';

export default async function vouchersController({ voucherRequest, services, accountabilitySchema, options, env }) {
	let reference_id  = '';
	let vendor_code = '';
	try {
		/* Boiler Plate Code
		 * Request shall be received in a particular format:
		 * check models for VoucherRequest format.
		 * */

		const { amt, qty, sku } = voucherRequest;
		let { cur } = voucherRequest;


		if (!cur) cur = 'INR';

		/* Basic Checks on Request  */
		if (!(amt > 0 && qty > 0 && Number.isInteger(qty) && sku && typeof sku === 'string' && sku.trim().length)) {
			const invalidJsonResponse: VoucherResponse = {
				success: false,
				message: `Please send a valid request`,
				response: [],
				exception: undefined,
				orderStatusFromVendor: undefined,
				vendorCode: undefined,
				statusCodeFromVendor: undefined
			};

			return invalidJsonResponse;
		}

		const { ItemsService } = services;

		const get = new Getters(ItemsService, accountabilitySchema);
		const set = new Setters(ItemsService, accountabilitySchema);

		/*Check WORK ADVANTAGE,Amazon Referance Number is already exist or not, if it is exist assign the vendor   */
		let getOrderDetails: any = [];
		const vendorInfo: any = {};
		getOrderDetails = await get.getVendorOrderByReferenceId(options.reference_id,null);
		
		if (getOrderDetails.length !== 0) {
			vendorInfo.api_integration_id = getOrderDetails[0].vendor.api_integration_id || '';
		} else {
			const getRefId = options.reference_id + '-' + 1;

			getOrderDetails = await get.getVendorOrderByReferenceId(options.reference_id,null);
			
			if (getOrderDetails.length !== 0) {
				vendorInfo.api_integration_id = getOrderDetails[0].vendor.api_integration_id || '';
			}
		}
		/* Get Brand Details for a given SKU : returns empty array if brand is Inactive*/
		const brandStatus = await get.checkBrandStatus(sku, amt, cur,options.reference_id,null);
		/* No Need to go further in code if the brand itself is 'inactive' */
		if (brandStatus) {
			/* Get the Best Vendor for a Voucher */
			const brandVendorMappingResponse = await get.bestVendor(sku, amt, cur,options.reference_id,null);
			const bestVendor = brandVendorMappingResponse ? brandVendorMappingResponse['choose_a_vendor'] : null;
			const bestVendorId = brandVendorMappingResponse ? bestVendor['id'] : null;
			/* apiIntegrationID shall be the mapper between the Vendor in the vendor details collection and the integration here */
			let apiIntegrationID = brandVendorMappingResponse ? bestVendor['api_integration_id'] : null;
			const bestVendorName = brandVendorMappingResponse ? bestVendor['entity_name'] : null;

			/* Vendor Vouchers Class to handle all aspects of retrieving vouchers from 3rd party apis */
			const vendorVoucher = new VendorVouchers();

			/* New Introduction of Core Controller shall be used for all vendors instead of directly calling vendor vouchers */
			const coreController = new CoreController(services, accountabilitySchema);

			/* First we shall check if there is a valid Vendor
			 * if not response shall be send that no Vendor available.
			 *  */
			if ((bestVendor && bestVendorId) || vendorInfo.api_integration_id) {
				let finalResponse: any = {};
				if (vendorInfo.api_integration_id) {
					/* if we get api_integration_id from referance number will assign it here */
					apiIntegrationID = vendorInfo ? vendorInfo.api_integration_id : apiIntegrationID;
				}
				 reference_id  =  options.reference_id;
				 vendor_code = apiIntegrationID;
				switch (apiIntegrationID) {
					/* WorkAdvantage Integration */
					case config.vendor_id_mapping.WORK_ADVANTAGE:
						finalResponse = await coreController.placeNewOrderAndStoreVoucher({
							vendor_code: config.vendor_id_mapping.WORK_ADVANTAGE,
							reference_id: options.reference_id,
							options: options,
							brand_sku: sku,
							quantity: qty,
							env: env,
						});
						break;

					/* QC AMAZON */
					case config.vendor_id_mapping.AMAZON_QC:
						finalResponse = await coreController.placeNewOrderAndStoreVoucher({
							vendor_code: config.vendor_id_mapping.AMAZON_QC,
							reference_id: options.reference_id,
							options: options,
							brand_sku: sku,
							quantity: qty,
							env: env,
						});
						break;

					/* FLIP KART EGV */
					case config.vendor_id_mapping.FLIPKART_EGV:
						finalResponse = await coreController.placeNewOrderAndStoreVoucher({
							vendor_code: config.vendor_id_mapping.FLIPKART_EGV,
							reference_id: options.reference_id,
							options: options,
							brand_sku: sku,
							quantity: qty,
							env: env,
						});
						break;
					/* QUICK CILVER  */
					case config.vendor_id_mapping.QUICKCILVER_EGV:
						finalResponse = await coreController.placeNewOrderAndStoreVoucher({
							vendor_code: config.vendor_id_mapping.QUICKCILVER_EGV,
							reference_id: options.reference_id,
							options: options,
							brand_sku: sku,
							quantity: qty,
							env: env,
						});
						break;		
					/* Default Response when No Cases Satisfied */
					default:
						finalResponse = {
							success: false,
							message: `Selected Vendor: '${bestVendorName}', is not Integrated`,
							response: [],
						};
				}
				return finalResponse;
			} else {
			
				await new LogSys().log(`Vendor Not found, either vendor or brand or amount not mapped!!`, false,options.reference_id,vendor_code);
				/* Failure Case: When No Vendors are available in the Inventory */
				const noVendorAvailableResponse: VoucherResponse = {
					success: false,
					message: 'Vendor Not found, either vendor or brand or amount not mapped!!',
					response: [],
					exception: null,
					orderStatusFromVendor: null,
					vendorCode: vendor_code,
					statusCodeFromVendor: null
				};

				return noVendorAvailableResponse;
			}
		} else {
		
			await new LogSys().log(`Either brand for the given SKU is Inactive or SKU Not Mapped with given amount'`, false,options.reference_id,vendor_code);
			const brandInactive: VoucherResponse = {
				success: false,
				message: 'Either brand for the given SKU is Inactive or SKU Not Mapped with given amount',
				response: [],
				exception: null,
				orderStatusFromVendor: null,
				vendorCode: vendor_code,
				statusCodeFromVendor: null
			};

			return brandInactive;
		}
	} catch (e) {
		await new LogSys().jsonError({
			exception: e,
			error: `vouchersController: ${e}`,
		},
		options.reference_id,
		vendor_code
		);

		const exceptionResponse: VoucherResponse = {
			success: false,
			exception: true,
			message: `Exception Occurred: ${e}`,
			response: [],
			orderStatusFromVendor: null,
			vendorCode: vendor_code,
			statusCodeFromVendor: null
		};

		return exceptionResponse;
	}
}

import { Worker, Job } from 'bullmq';
import { connection } from './redis.config';
import LogSys from '../helpers/logger';
import Getters from '../db/getters';
import Setters from '../db/setters';
import { CONFIG } from '../config';

// // Store workers for different job types
// const workers: { [key: string]: Worker } = {};

// /**
//  * Initialize a worker node for processing voucher generation jobs
//  * @param jobName - The name of the job queue to process
//  */
// export const workerNode = (jobName: string) => {
// 	// Create worker if it doesn't exist
// 	if (!workers[jobName]) {
// 		workers[jobName] = new Worker(
// 			jobName, // Queue name
// 			async (job: Job) => {
// 				try {
// 					await new LogSys().log(`Processing voucher generation job: ${jobName}`, true, job.id, 'voucher-queue');
					
// 					const {
// 						sku,
// 						referenceId,
// 						campaignNameR,
// 						link_reference_id,
// 						reference_code_otp,
// 						soft_link_order_id,
// 						link_ledger_reference_id,
// 						deliveryMode,
// 						platform,
// 						itemsService,
// 						accountabilitySchema,
// 					} = job.data;

// 					await new LogSys().log(
// 						`Processing job with ID: ${job.id}, SKU: ${sku}, referenceId: ${referenceId}, campaignNameR: ${campaignNameR}, platform: ${platform}, link_reference_id: ${link_reference_id}`,
// 						true,
// 						referenceId,
// 						'voucher-queue'
// 					);

// 					// Initialize getters and setters
// 					const get = new Getters(itemsService, accountabilitySchema);
// 					const set = new Setters(itemsService, accountabilitySchema);

// 					// Try to get voucher from inventory first
// 					let voucherCodeResponse = await get.voucherCode(sku);

// 					// If no voucher in inventory, generate from vendor
// 					if (!voucherCodeResponse || Object.keys(voucherCodeResponse).length === 0) {
// 						await new LogSys().log(`No voucher in inventory for SKU: ${sku}, generating from vendor`, true, referenceId, 'voucher-queue');
						
// 						// Generate voucher from vendor
// 						const voucherValue = await get.voucherDetails(sku);
// 						const amount = voucherValue ? voucherValue.amount : 0;
						
// 						// Use internal voucher generation logic
// 						const isGenerated = await generateVoucherBySkuBestVendor(
// 							sku,
// 							amount,
// 							'best_vendor',
// 							1,
// 							referenceId,
// 							get,
// 							set
// 						);

// 						if (isGenerated) {
// 							// Try to get the generated voucher
// 							voucherCodeResponse = await get.voucherCode(sku);
// 						}
// 					}

// 					await new LogSys().log(`Voucher generation result: ${JSON.stringify(voucherCodeResponse)}`, true, referenceId, 'voucher-queue');

// 					// Check if we have valid voucher data
// 					if (voucherCodeResponse && Object.keys(voucherCodeResponse).length > 0 && voucherCodeResponse.id) {
// 						await new LogSys().log(`Voucher found: ${voucherCodeResponse.id}`, true, referenceId, 'voucher-queue');

// 						// Update voucher with redemption details if needed
// 						if (deliveryMode === 'link') {
// 							const updateVoucherResponse = await set.updateVoucherRedeemed(
// 								voucherCodeResponse.id,
// 								referenceId,
// 								campaignNameR,
// 								link_reference_id || '',
// 								reference_code_otp || '',
// 								false,
// 								soft_link_order_id || '',
// 								link_ledger_reference_id || ''
// 							);
// 							await new LogSys().log(`Voucher updated: ${JSON.stringify(updateVoucherResponse)}`, true, referenceId, 'voucher-queue');
// 						}

// 						return voucherCodeResponse;
// 					} else {
// 						await new LogSys().log(`No valid voucher found for SKU: ${sku}`, false, referenceId, 'voucher-queue');
// 						return {}; // Return empty object if no valid voucher
// 					}
// 				} catch (error) {
// 					await new LogSys().log(`Job processing failed for SKU: ${job.data.sku}, Error: ${error}`, false, job.id, 'voucher-queue');
// 					throw new Error(`Job processing failed for SKU: ${job.data.sku}`);
// 				}
// 			},
// 			{
// 				connection,
// 				concurrency: 1,
// 				removeOnComplete: { count: 0 },
// 				removeOnFail: { count: 0 },
// 			}
// 		);
// 	}
// 	return workers[jobName];
// };

// /**
//  * Internal voucher generation function (moved from controller)
//  * @param sku - SKU code
//  * @param voucherValue - Voucher value
//  * @param bestVendor - Vendor to use
//  * @param qty - Quantity to generate
//  * @param referenceId - Reference ID
//  * @param get - Getters instance
//  * @param set - Setters instance
//  * @returns Promise<boolean> - Success status
//  */
// async function generateVoucherBySkuBestVendor(
// 	sku: string,
// 	voucherValue: any,
// 	bestVendor: string,
// 	qty: number,
// 	referenceId: string,
// 	get: Getters,
// 	set: Setters
// ): Promise<boolean> {
// 	try {
// 		await new LogSys().log(
// 			`generateVoucherBySkuBestVendor: ${sku} voucherValue: ${voucherValue} qty: ${qty} referenceId: ${referenceId}`,
// 			true,
// 			referenceId,
// 			bestVendor
// 		);

// 		let voucherCodeFromVpp: any = {};

// 		if (bestVendor === 'best_vendor') {
// 			voucherCodeFromVpp = await get.generateMultipleVoucherCodeFromVpp(sku, voucherValue, '', referenceId, '', qty);
// 		} else {
// 			voucherCodeFromVpp = await get.placeMultipleVoucherNewOrderVpp(sku, '', referenceId, '', qty, bestVendor);
// 		}

// 		await new LogSys().log('Received Response from VPP', true, referenceId, bestVendor);
		
// 		const isVppVoucherSuccess = voucherCodeFromVpp && voucherCodeFromVpp['success'];
// 		const voucherMessage = voucherCodeFromVpp && voucherCodeFromVpp['message'];
// 		const vendorCode = voucherCodeFromVpp && voucherCodeFromVpp['vendorCode'];
		
// 		await new LogSys().log(`generateVoucherBySkuBestVendor: ${vendorCode} OrderStatus: ${isVppVoucherSuccess}`, true, referenceId, vendorCode);
// 		await new LogSys().log(`voucherMessage: ${voucherMessage} OrderStatus: ${isVppVoucherSuccess}`, true, referenceId, vendorCode);
// 		await new LogSys().log(`vendorCode: ${vendorCode}`, true, referenceId, vendorCode);

// 		return isVppVoucherSuccess;
// 	} catch (error) {
// 		await new LogSys().log(`generateVoucherBySkuBestVendor Error: ${error}`, false, referenceId, bestVendor);
// 		return false;
// 	}
// } 
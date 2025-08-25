import Getters from '../db/getters';
import Setters from '../db/setters';
import LogSys from '../helpers/logger';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import vouchersController from '../controllers';
import CoreController from '../controllers/core-controller';
import { voucherQueue, voucherQueueEvents, getQueueForClient, queueEvents } from '../queue/voucherQueue';
import { Worker, Job } from 'bullmq';
import { connection } from '../queue/redis.config';
import { CONFIG } from '../config';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';




let allServices: any = []


export default class campaignController {
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


    redeemVoucher = async (linkId: string, sku: string, token: string, env: any) => {
        try {
            await new LogSys().log(`start redeem voucher! LinkId ${linkId} sku: ${sku}`, false, linkId, null);

            const queue = getQueueForClient('voucher-fetch-queue')
            this.workerNode('voucher-fetch-queue')
            const job = await queue.add('redeem', { linkId, sku, token, env }, { removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } });

            const counts = await queue.getJobCounts();
            // Wait for job to complete
            const finallResult = await job.waitUntilFinished(queueEvents['voucher-fetch-queue']!);

            return finallResult;
        } catch (e) {
            await new LogSys().log(`redeemVoucher`, false, linkId, null);

            return {
                success: false,
                message: 'Please contact Administrator',
                err_code: 'EXC_ERR',
            };
        }
    };


    // Move workerNode implementation here (from previous code)
    private workers: { [key: string]: Worker } = {};

    async workerNode(jobName: string) {
        if (!this.workers[jobName]) {
            this.workers[jobName] = new Worker(
                jobName,
                async (job: any) => {
                    try {

                        switch (jobName) {
                            case 'voucher-fetch-queue':
                                await new LogSys().log(`workerNode! jobName ${jobName} job.data: ${JSON.stringify(job.data)}`, false, job.data.linkId, null);
                                const result = await this.processRedeemJob(job.data);
                                return result;
                            case 'soft-link-queue':
                                await new LogSys().log(` getSoftLinkVouchers soft-link-queue jobName : ${jobName} job.data: ${JSON.stringify(job.data)}`, false, job.data.link_reference_id, null);

                                const soft_link_result = await this.softLinkprocessRedeemJob(job.data);
                                return soft_link_result;
                            default:
                                return {
                                    success: false,
                                    message: 'Job processing failed',
                                    err_code: 'JOB_NOT_FOUND_ERROR',
                                };
                        }
                    } catch (error) {
                        return {
                            success: false,
                            message: 'Job processing failed',
                            err_code: 'JOB_PROCESSING_ERROR',
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
    }

    async processRedeemJob(params: any) {
        const { linkId, sku, token, env } = params;
        await new LogSys().log(`processRedeemJob!`, false, linkId, null);

        // Input validation
        if (!linkId || !sku || !token) {
            return {
                success: false,
                message: 'Missing required parameters: linkId, sku, or token',
                err_code: 'INVALID_INPUT',
            };
        }


        const get = new Getters(this.itemsService, this.accountabilitySchema);
        const set = new Setters(this.itemsService, this.accountabilitySchema);

        try {

            const linkDetailsArr = await get.getLinkDetailsFromId(linkId);

            if (!linkDetailsArr || linkDetailsArr.length === 0) {
                return {
                    success: false,
                    message: 'Invalid linkId: Link Details Not Found',
                    err_code: 'LINK_NOT_FOUND',
                };
            }


            await new LogSys().log(`processRedeemJob linkDetailsArr!`, false, linkId, null);

            const skuDetails = await get.getSkuBrandMapping(sku);
            if (!skuDetails || !skuDetails.id) {
                await new LogSys().log(`processRedeemJob SKU details Not Found!`, false, linkId, null);

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
                await new LogSys().log(`msg: 'Validation failed: Invalid voucher value for this SKU`, false, linkId, null);

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
                await new LogSys().log(`Fetched Link Details`, false, linkId, null);

                /* Verify Token Valid */
                const isTokenValid =
                    token == linkDetails['token'] &&
                    linkDetails['token_last_updated'] >= new Date(new Date().getTime() - 5 * 60 * 1000).toISOString();

                console.log(isTokenValid, 'isTokenValid')
                // if (isTokenValid) {
                await new LogSys().log(`Checked Token Valid`, false, referenceId, null);


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
                                    await new LogSys().log(`Brand Overall Limit Reached: ${matched_brand_name} - ${overall_limit} - Used: ${overall_limit_utilized_after_redeem}`, false, referenceId, null);

                                    return {
                                        success: false,
                                        message: matchedBrand['overall_error_message'] || 'Reached the maximum limit of this brand',
                                    };
                                }

                                if (monthly_limit > 0 && monthly_limit_utilized_after_redeem > monthly_limit) {
                                    await new LogSys().log(`Brand Monthly Limit Reached: ${matched_brand_name} - ${monthly_limit} - Used: ${monthly_limit_utilized_after_redeem}`, false, referenceId, null);

                                    return {
                                        success: false,
                                        message: matchedBrand['monthly_error_message'] || 'Reached the maximum limit of this brand for this month',
                                    };
                                }
                            }
                        }
                    }

                    let voucherList = await get.voucherCodeList(sku);
                    const inventoryQty: any = CONFIG.inventoryQty;
                    const soft_link_inventory_qty: any = CONFIG.softlLinkInventoryQty;
                    let isGenerated = true;

                    if (!voucherList) {
                        voucherList = [];
                    }

                    const baseRegion = linkDetailsArr[0]['reward_campaign']?.base_region
                    const skuRegion = skuDetails[0].brand.region
                    console.log(baseRegion, skuRegion, 'aaaaaaaaaaa')
                    ///Need to maintain the inventory in Zeus with the minimum configured quantity.
                    if (voucherList.length < inventoryQty && deliveryMode === 'direct_link') {
                        const qty = inventoryQty - (voucherList?.length ?? 0);
                        isGenerated = await this.generateVoucherBySkuBestVendor(sku, voucherValue, voucherVendor, qty, referenceId, env, skuRegion);
                        await new LogSys().log(`Voucher Generated direct_link:${deliveryMode} - ${isGenerated}`, false, referenceId, null);

                    }

                    ///Soft link Need to maintain the inventory in Zeus with the minimum configured quantity.
                    if (voucherList.length < soft_link_inventory_qty && deliveryMode === 'link') {
                        const qty = soft_link_inventory_qty - (voucherList?.length ?? 0);
                        isGenerated = await this.generateVoucherBySkuBestVendor(sku, voucherValue, voucherVendor, qty, referenceId, env, skuRegion);
                        await new LogSys().log(`Voucher Generated softlink:${deliveryMode} - ${isGenerated}`, false, referenceId, null);

                    }

                    await new LogSys().log(`Checked Balance Available`, false, referenceId, null);


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
                    let secretKey = CONFIG.secret_key;
                    let expiresIn = CONFIG.expiresIn;
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
                    const hoursToAdd = Number(CONFIG.expiresIn) || 0; // Default to 0 if invalid
                    const future = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
                    const token_expairy_on = this.expiryformatDate(future);
                    /*object for Email*/
                    let extra_params = {
                        other_site_domain: CONFIG.custom_domain,
                        link_reference_id: randomChars,
                        reference_code_otp: reference_code_otp,
                        type: 'link',
                        brand: skuDetails || [],
                        value: voucherValue,
                        valid_till: linkDetails['end_date'],
                        first_time_send: true,
                        image_url: CONFIG.defaults.asset_base_url || '',
                        soft_link_token: soft_link_token
                    };

                    if (voucherCode && Object.keys(voucherCode).length > 0 && voucherCode.id) {

                        await new LogSys().log(`Got Voucher from Gift Card Inventory`, false, referenceId, null);

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
                                            CONFIG.from_mail,
                                            to,
                                            reference_code_otp,
                                            rcEmailRegards,
                                            'reward-link-template',
                                            extra_params
                                        );
                                        new LogSys().log(`Email Notification sent`, false, referenceId, null);

                                    } else if (mode === 'whatsapp') {
                                        this.sendWhatsapp(mobile, reference_code_otp, 'reward-link-template', extra_params);
                                        new LogSys().log(`Whatsup Notification sent!`, false, referenceId, null);

                                    } else {
                                        this.sendEmail(
                                            CONFIG.from_mail,
                                            to,
                                            reference_code_otp,
                                            rcEmailRegards,
                                            'reward-link-template',
                                            extra_params
                                        );
                                        new LogSys().log(`Email Notification sent!`, false, referenceId, null);

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
                            new LogSys().log(`updateVoucherRedeemedResponse!`, false, referenceId, null);


                        }

                        /* Update Balance  and status redeemed */
                        const newLinkBalance = linkPendingValue - voucherValue;
                        new LogSys().log(`newLinkBalance ${newLinkBalance}`, false, referenceId, null);

                        const updateLinkBalanceResponse = await set.updateLinkBalance(linkId, newLinkBalance);
                        new LogSys().log(`updateLinkBalanceResponse ${updateLinkBalanceResponse}`, false, referenceId, null);


                        if (updateLinkBalanceResponse) {
                            /* Add to Link Ledger */
                            let addToLedgerId = {};
                            if (deliveryMode !== 'link') {
                                new LogSys().log(`Adding Direct redeem Transaction to Ledger!`, false, referenceId, null);

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
                                new LogSys().log(`Adding Soft link redeem Transaction to Ledger!`, false, referenceId, null);

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

                                new LogSys().log(`insertRedemptionResponse ${insertRedemptionResponse}`, false, referenceId, null);

                            }


                            if (brandLimitation.length > 0) {
                                if (currentMonthData && currentMonthData.length > 0) {
                                    //update the brand limitation details
                                    const updateBrandLimitationDetailsResponse = await set.updateBrandLimitationDetails(currentMonthData[0]['id'], monthly_limit_utilized_after_redeem, overall_limit_utilized_after_redeem);
                                    if (updateBrandLimitationDetailsResponse) {
                                        new LogSys().log(`Brand Limitation Details Updated:${updateBrandLimitationDetailsResponse}`, false, referenceId, null);

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
                                        new LogSys().log(`Brand Limitation Details Inserted:${insertBrandLimitationDetailsResponse}`, false, referenceId, null);
                                    }
                                }

                            }
                            /* Insert Redeemed Details */
                            if (addToLedgerId) {
                                /* Update Order Status */
                                new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:successful`, false, referenceId, null);

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
                                new LogSys().log(`Updating Ledger:${addToLedgerId} OrderStatus:failed`, false, referenceId, null);

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
                        await new LogSys().log(`Voucher Not Found In Inventory`, false, referenceId, null);

                        /* Update Balance */
                        const newLinkBalance = linkPendingValue - voucherValue;
                        const updateLinkBalanceResponse = await set.updateLinkBalance(linkId, newLinkBalance);

                        if (updateLinkBalanceResponse) {
                            await new LogSys().log(`Balance of link:${linkId} Updated To: ${newLinkBalance}`, false, referenceId, null);


                            /* Add to Link Ledger */

                            await new LogSys().log(`Adding Transaction to Ledger ${link_reference_id}${reference_code_otp}${soft_link_token}`, false, referenceId, null);

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
                            await new LogSys().log(`Getting Voucher from VPP`, false, referenceId, null);

                            let voucherCodeFromVpp: any = [];
                            const voucherRequest = {
                                sku: sku, qty: 1, amt: voucherValue
                            }
                            const options = {
                                syncOnly: true,/* Sync Only will be useful for QC Amazon */
                                redeemed: false,
                                retrieveIfRedeemed: true,
                                reference_id: referenceId,
                                order_id: '',
                                extra: { client: campaignNameR },
                                link_reference_id: '',
                                reference_code_otp: '',
                                soft_link_order_id: '',
                            }

                            /* Get Voucher from VPP API */
                            if (voucherVendor === 'best_vendor') {

                                if (deliveryMode == 'link') {
                                    options.redeemed = false;
                                    soft_link_order_id = sku + '-' + randomChars;

                                    voucherCodeFromVpp = await vouchersController({
                                        voucherRequest: voucherRequest,
                                        services: this.services,
                                        accountabilitySchema: this.accountabilitySchema,
                                        options,
                                        env,
                                    })

                                } else {
                                    giftcard_status = true;
                                    options.redeemed = true;
                                    options.order_id = referenceId;
                                    voucherCodeFromVpp = await vouchersController({
                                        voucherRequest: voucherRequest,
                                        services: this.services,
                                        accountabilitySchema: this.accountabilitySchema,
                                        options,
                                        env,
                                    })

                                }
                            } else {
                                const detailsController = new CoreController(this.services, this.accountabilitySchema);

                                if (deliveryMode == 'link') {
                                    soft_link_order_id = sku + '-' + randomChars;
                                    voucherCodeFromVpp = await detailsController.placeNewOrderAndStoreVoucher({
                                        vendor_code: voucherVendor,
                                        reference_id: referenceId,
                                        options,
                                        brand_sku: sku,
                                        quantity: 1,
                                        env,
                                    });

                                } else {
                                    giftcard_status = true;
                                    options.redeemed = true;
                                    options.order_id = referenceId;
                                    voucherCodeFromVpp = await detailsController.placeNewOrderAndStoreVoucher({
                                        vendor_code: voucherVendor,
                                        reference_id: referenceId,
                                        options,
                                        brand_sku: sku,
                                        quantity: 1,
                                        env,
                                    });
                                }
                            }

                            await new LogSys().log(`msg: Received Response from VPP`, false, referenceId, null);

                            const isVppVoucherSuccess = voucherCodeFromVpp && voucherCodeFromVpp['success'];
                            const voucherMessage = voucherCodeFromVpp && voucherCodeFromVpp['message'];
                            const vendorCode = voucherCodeFromVpp && voucherCodeFromVpp['vendorCode'];
                            /* Update Order Status */
                            await new LogSys().log(`Updating Ledger:${vendorCode} OrderStatus:${isVppVoucherSuccess}`, false, referenceId, null);
                            await new LogSys().log(`Updating vendorCode:${vendorCode} OrderStatus:${isVppVoucherSuccess}`, false, referenceId, null);
                            await new LogSys().log(`Updating voucherMessage:${voucherMessage} OrderStatus:${isVppVoucherSuccess}`, false, referenceId, null);

                            const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(
                                addToLedgerId,
                                isVppVoucherSuccess ? 'successful' : 'failed',
                                vendorCode,
                                voucherMessage
                            );
                            if (brandLimitation.length > 0) {
                                await new LogSys().log(`VPP API CALL-Brand Limitation Details`, false, referenceId, null);

                                if (currentMonthData && currentMonthData.length > 0) {
                                    //update the brand limitation details
                                    const updateBrandLimitationDetailsResponse = await set.updateBrandLimitationDetails(currentMonthData[0]['id'], monthly_limit_utilized_after_redeem, overall_limit_utilized_after_redeem);
                                    if (updateBrandLimitationDetailsResponse) {
                                        await new LogSys().log(`VPP API CALL-Brand Limitation Details Updated:${updateBrandLimitationDetailsResponse}`, false, referenceId, null);
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
                                        await new LogSys().log(`VPP API CALL-Brand Limitation Details Inserted:${insertBrandLimitationDetailsResponse}`, false, referenceId, null);
                                    }
                                }

                            }
                            console.log(isVppVoucherSuccess, 'aravoind')
                            if (isVppVoucherSuccess) {
                                if (deliveryMode == 'link') {

                                    if (softLinkDeliveryMode.length !== 0) {
                                        softLinkDeliveryMode.forEach((mode) => {
                                            if (mode === 'email') {
                                                this.sendEmail(
                                                    CONFIG.from_mail,
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
                                                    CONFIG.from_mail,
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
                                await new LogSys().log(`Inserted Redemption Response`, false, referenceId, null);

                                return {
                                    success: true,
                                    amount: voucherValue,
                                    message: 'Voucher Successfully Fetched!',
                                    voucher: deliveryMode === 'link' ? '' : voucherCore.code,
                                    pin: deliveryMode === 'link' ? '' : voucherCore.pin,
                                    valid_till: deliveryMode === 'link' ? '' : voucherCore.valid_till,
                                };
                            } else {


                                await new LogSys().log(`VPP Failure`, false, referenceId, null);

                                return {
                                    success: false,
                                    message: 'Please contact Administrator',
                                    err_code: 'VPP_FAIL_ERR',
                                };
                            }
                        } else {
                            await new LogSys().log(`Balance Updatation Failure'`, false, referenceId, null);

                            return {
                                success: false,
                                message: 'Voucher Redemption Error',
                                err_code: 'VPP_UPD_BAL_ERR',
                            };
                        }
                    }
                } else {
                    await new LogSys().log(`Balance Unavailable'`, false, referenceId, null);

                    /* Balance Not Available */
                    return {
                        success: false,
                        message: 'Balance Not Available',
                        err_code: 'NO_BAL_ERR',
                    };
                }
                // } 

                // else {
                //     await new LogSys().log(`Token Expired'`, false, referenceId, null);

                //     return {
                //         success: false,
                //         message: "Link Expired",
                //         error_tag: "LINK_EXPIRED",
                //         err_code: "EXP_LNK_ERR"
                //     };
                // }
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
            await new LogSys().log(`redeemVoucherError: ${e} }`, false, linkId, null);
            return {
                success: false,
                message: 'Please contact Administrator',
                err_code: 'EXC_ERR',
            };
        }
    }


    async softLinkprocessRedeemJob(params: any) {
        const { link_reference_id, reference_code_otp, soft_link_token, env, itemsService, accountabilitySchema } = params;
        const get = new Getters(this.itemsService, this.accountabilitySchema);
        const set = new Setters(this.itemsService, this.accountabilitySchema);

        try {
            const isValid = await this.verifyToken(
                soft_link_token,
                env.SOFT_LINK_SECRET_KEY,
                env.SOFT_LINK_TOKEN_EXPIRE_INPUT,
                link_reference_id
            );

            await new LogSys().log(` getLinkVouchers  verifyToken status : ${isValid}`, false, link_reference_id, null);


            if (isValid) {
                //get vouchers from LINK_REWARD_REDEMPTIONS_TABLE
                let getResponse = await get.softLinkOtpVerification(link_reference_id, reference_code_otp);
                await new LogSys().log(`getLinkVouchers redemption data : ${getResponse.length}`, false, link_reference_id, null);

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
                    await new LogSys().log(`getLinkVouchers Already Redeemed Voucher redemption_id : ${getResponse[0].redemption_id}`, false, link_reference_id, null);

                    const id = getResponse[0].redemption_id;
                    const sku_id = getResponse[0].brand_sku.id;
                    getResponse[0].brand_sku.brand.brand_name = getResponse[0].brand_sku.brand.brand_name;
                    getResponse[0].brand_sku.brand.brand_image = getResponse[0].brand_sku.brand.brand_image;

                    let voucherDetails = await get.getZeusVoucherCode(id);

                    if (voucherDetails.pin) {
                        await new LogSys().log(`getLinkVouchers return voucher : ${getResponse[0].redemption_id}`, false, link_reference_id, null);
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
                        await new LogSys().log(`getLinkVouchers getLedger reference_id : ${getLedger[0].reference_id}`, false, link_reference_id, null);

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
                            await new LogSys().log(`getLinkVouchers ledgerId ${ledgerId}  voucherSku ${voucherSku} amount: ${amount}`, false, link_reference_id, null);

                            const skudetails = await get.voucherDetails(voucherSku);

                            const getLinkredemptions = ledgerId ? await get.getLinkredemptionsFromLedgerId(ledgerId) : {};

                            await new LogSys().log(`getLinkVouchers getLinkredemptionsFromLedgerId ${JSON.stringify(getLinkredemptions)}`, false, link_reference_id, null);

                            if (!getLinkredemptions) {
                                const getZeusVoucherCodeByLedgeDetails = await get.getZeusVoucherCodeByLedgerReferenceId(
                                    getLedger[0].reference_id
                                );

                                if (!getZeusVoucherCodeByLedgeDetails?.id) {
                                    //fetch inventory from zeus
                                    let voucherDetails = await get.voucherCode(sku);
                                    if (voucherDetails && Object.keys(voucherDetails).length > 0 && voucherDetails.id) {

                                        new LogSys().log(`getLinkVouchers voucherDetails id ${voucherDetails.id} gift_card sttaus ${voucherDetails.gift_card} `, false, link_reference_id, null);

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

                                        new LogSys().log(`getLinkVouchers updateVoucherRedeemedResponse id ${JSON.stringify(updateVoucherRedeemedResponse)}`, false, link_reference_id, null);

                                        const getredemptions = await get.getLinkredemptionsFromId(voucherDetails.id);

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
                                            new LogSys().log(`getLinkVouchers insertRedemptionResponse ${JSON.stringify(insertRedemptionResponse)}`, false, link_reference_id, null);

                                        }

                                        if (voucherDetails.pin && insertRedemptionResponse) {
                                            newVouchersResponse.voucher = voucherDetails.code;
                                            newVouchersResponse.pin = voucherDetails.pin;
                                            newVouchersResponse.valid_till = voucherDetails.validity;
                                            newVouchersResponse.amount = amount;
                                            newVouchersResponse.brand_details = skudetails.brand || {};
                                            newVouchersResponse.message = 'Voucher Fetched successfully!';
                                            newVouchersResponse.success = true;
                                            new LogSys().log(`getLinkVouchers Voucher Return successfully`, false, link_reference_id, null);


                                            return newVouchersResponse;
                                        } else {
                                            return newVouchersResponse;
                                        }
                                    } else {

                                        new LogSys().log(`voucher Details Not Found`, false, link_reference_id, null);

                                        let voucherCodeFromVpp: any = await this.fetchVoucherCode(
                                            ledgerVendorCode,
                                            voucherSku,
                                            amount,
                                            getLedger[0].reference_id,
                                            campaignNameR,
                                            '',
                                            '',
                                            '',
                                            itemsService,
                                            accountabilitySchema, env
                                        );


                                        await this.logResponse(voucherCodeFromVpp);

                                        if (!voucherCodeFromVpp?.success) {
                                            new LogSys().log(`voucherCodeFromVpp?.success ${voucherCodeFromVpp?.success}`, false, link_reference_id, null);

                                            return await this.createErrorResponse(link_reference_id);
                                        }

                                        const voucherCodeId = voucherCodeFromVpp.keys?.[0];
                                        new LogSys().log(`voucherCodeId ${voucherCodeId}`, false, link_reference_id, null);

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
                                                getLedger[0].reference_id,
                                                itemsService,
                                                accountabilitySchema
                                            );
                                        } else if (!(await this.containsSL(getLedger[0].reference_id))) {

                                            new LogSys().log(`if inventory Details Not Found ${getLedger[0].reference_id}`, false, link_reference_id, null);

                                            const refId = await this.appendSL(getLedger[0].reference_id);
                                            const updateRes = await set.updateSoftReferenceId(getLedger[0].id, refId);
                                            new LogSys().log(`if inventory Details Not Found ${getLedger[0].reference_id}if inventory Details Not Found ${refId} updateRes: ${JSON.stringify(updateRes)}`, false, link_reference_id, null);

                                            if (updateRes) {
                                                new LogSys().log(`New Request refId: ${refId}`, false, link_reference_id, null);

                                                voucherCodeFromVpp = await this.fetchVoucherCode(
                                                    ledgerVendorCode,
                                                    voucherSku,
                                                    amount,
                                                    refId,
                                                    campaignNameR,
                                                    '',
                                                    '',
                                                    '',
                                                    itemsService,
                                                    accountabilitySchema, env
                                                );
                                                const voucherCodeId = voucherCodeFromVpp.keys?.[0];


                                                const inventoryDetails = await get.getVoucherCodeById(voucherCodeId);
                                                await this.logResponse(voucherCodeFromVpp);

                                                if (!voucherCodeFromVpp?.success) {
                                                    return await this.createErrorResponse(link_reference_id);
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
                                                    getLedger[0].reference_id,
                                                    itemsService,
                                                    accountabilitySchema
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


                                new LogSys().log(`Data Fetching From Redeemption List`, false, link_reference_id, null);

                                const id = getLinkredemptions.redemption_id;
                                let voucherDetails = await get.getZeusVoucherCode(id);

                                new LogSys().log(`Data Fetching From getZeusVoucherCode`, false, link_reference_id, null);

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
                new LogSys().log(`Invalid Token!. Please Contact Administrator.`, false, link_reference_id, null);

                return {
                    success: false,
                    message: 'Invalid Token!. Please Contact Administrator.',
                };
            }



        } catch (e) {
            new LogSys().log(`Softlink Redeem Voucher Error ${JSON.stringify(e)}`, false, link_reference_id, null);

            return {
                success: false,
                message: 'Please contact Administrator',
                err_code: 'EXC_ERR',
            };
        }
    }

    async verifyToken(token: any, secretKey: any, expiry: number, link_reference_id: any) {
        try {
            const decoded: any = jwt.verify(token, secretKey, { ignoreExpiration: true });
            if (!decoded.iat) {
                return false;
            }

            const iat = decoded.iat; // issued at (in seconds)
            const expiryTimestamp = iat + (expiry * 3600);
            const currentTimestamp = Math.floor(Date.now() / 1000);

            new LogSys().log(`verifyToken expiryTimestamp: ${expiryTimestamp} currentTimestamp: ${currentTimestamp}`, false, link_reference_id, null);

            if (currentTimestamp > expiryTimestamp) {
                new LogSys().log(`verifyToken- Token Expaired`, false, link_reference_id, null);

                return false
            } else {
                new LogSys().log(`verifyToken- Token valid`, false, link_reference_id, null);

                return true
            }

            return false;
        } catch (err) {
            new LogSys().log(`verifyToken- Error ${JSON.stringify(err)}`, false, link_reference_id, null);

            return false;
        }
    }

    // Helper functions							
    async generateUniqueCode() {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);

            let randomChars = await this.generateRandomChars(CONFIG.max_random_chars);
            let checkExist = await get.checkRandomChars(randomChars);

            // Keep generating new codes until a unique one is found
            while (checkExist && checkExist.length > 0) {
                randomChars = await this.generateRandomChars(CONFIG.max_random_chars);
                checkExist = await get.checkRandomChars(randomChars);
            }
            return randomChars;
        } catch (error) {
            await new LogSys().log(`generateUniqueCode Error: ${error}`, false, null, null);
            return 'ERROR' + Date.now();
        }
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

    /**
     * Generate voucher by SKU using best vendor (full version from campaigns-reward-links)
     * @param sku - SKU code
     * @param voucherValue - Voucher value
     * @param bestVendor - Vendor to use
     * @param qty - Quantity to generate
     * @param referenceId - Reference ID
     * @param get - Getters instance
     * @param set - Setters instance
     * @returns Promise<boolean> - Success status
     */
    async generateVoucherBySkuBestVendor(
        sku: string,
        voucherValue: any,
        bestVendor: any,
        qty: any,
        referenceId: any,
        env: any,
        skuRegion?: any
    ) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);
            const detailsController = new CoreController(this.services, this.accountabilitySchema);


            const voucherRequest = {
                sku: sku, qty: qty, amt: voucherValue
            }
            const options = {
                syncOnly: true,/* Sync Only will be useful for QC Amazon */
                redeemed: false,
                retrieveIfRedeemed: true,
                reference_id: referenceId,
                order_id: '',
                extra: { client: '' }
            }


            let voucherCodeFromVpp: any = {};

            if (skuRegion.id == env.INDIAN_REGION) {
                if (bestVendor === 'best_vendor') {
                    voucherCodeFromVpp = await vouchersController({
                        voucherRequest: voucherRequest,
                        services: this.services,
                        accountabilitySchema: this.accountabilitySchema,
                        options,
                        env,
                    })
                } else {
                    voucherCodeFromVpp = await detailsController.placeNewOrderAndStoreVoucher({
                        vendor_code: bestVendor,
                        reference_id: referenceId,
                        options,
                        brand_sku: sku,
                        quantity: qty,
                        env,
                    });

                }
            } else {
                voucherCodeFromVpp = await detailsController.placeNewOrderAndStoreVoucher({
                    vendor_code: 'REWARD_ST',
                    reference_id: referenceId,
                    options,
                    brand_sku: sku,
                    quantity: qty,
                    env,
                });
            }



            const isVppVoucherSuccess = voucherCodeFromVpp && voucherCodeFromVpp['success'];
            const voucherMessage = voucherCodeFromVpp && voucherCodeFromVpp['message'];
            const vendorCode = voucherCodeFromVpp && voucherCodeFromVpp['vendorCode'];
            /* Update Order Status */
            new LogSys().log(`generateVoucherBySkuBestVendor:${vendorCode} OrderStatus:${isVppVoucherSuccess}`, false, referenceId, null);
            new LogSys().log(`voucherMessage:${voucherMessage} OrderStatus:${isVppVoucherSuccess}`, false, referenceId, null);


            return isVppVoucherSuccess;
        } catch (error) {
            return false;
        }
    }

    async generateToken(user: any, secretKey: any, expiresIn: any) {
        try {
            const expireTime = 3600 * expiresIn;
            return jwt.sign(user, secretKey, { expiresIn: expireTime });
        } catch (error) {
            new LogSys().log(`generateToken Error:${error}`, false, null, null);

        }

    }

    async expiryformatDate(date: any) {
        const pad = (n: any) => n.toString().padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    async sendEmail(
        from: string,
        to: string,
        otp: string,
        email_regards: string,
        template?: string,
        extra_params?: { [key: string]: any }
    ) {
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

            const sendEmailResponse = await axios.post(`${CONFIG.workflows.base_url}/webhook/sd-notifications`, requestBody, {
                headers: {
                    Authorization: CONFIG.workflows.sd_notifications_auth || '',
                },
            });

            return sendEmailResponse.data;
        } catch (error) {
            await new LogSys().log(`sendEmail Error: ${error}`, false, null, null);
            return false;
        }
    }
    async sendWhatsapp(
        mobile: string,
        otp: string,
        template?: string,
        extra_params?: { [key: string]: any }
    ) {
        try {
            const requestBody = {
                template_name: template || 'reward-template',
                template_params: [otp],
                phone: mobile,
                otp_mode: 'whatsapp',
                type: extra_params && extra_params.type ? extra_params.type : '',
                extra_params: extra_params || {},
            };

            const sendSMSResponse = await axios.post(`${CONFIG.workflows.base_url}/webhook/sd-notifications`, requestBody, {
                headers: {
                    Authorization: CONFIG.workflows.sd_notifications_auth || '',
                },
            });

            return sendSMSResponse.data;
        } catch (e) {
            await new LogSys().log(`sendWhatsapp Error: ${e}`, false, null, null);
            return false;
        }
    }

    async appendSL(code: any) {
        return `${code}-SL`;
    }

    async containsSL(code: any) {
        return code.includes('-SL');
    }

    async createErrorResponse(link_reference_id: any) {
        new LogSys().log(`Failed to fetch voucher,Please Contact Administrator!`, false, link_reference_id, null);

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
        soft_link_order_id: any,
        itemsService: any,
        accountabilitySchema: any,
        env: any
    ) {
        const get = new Getters(this.itemsService, this.accountabilitySchema);
        const set = new Setters(this.itemsService, this.accountabilitySchema);
        const apiVendorList: any = CONFIG.apiVendorList || [];

        const detailsController = new CoreController(this.services, this.accountabilitySchema);

        new LogSys().log(`generateVoucherBySkuBestVendor:${voucherSku}, voucherValue:${amount} , referenceId:${referenceId}`, false, link_reference_id, null);


        const voucherRequest = {
            sku: voucherSku, qty: 1, amt: amount
        }
        const options = {
            syncOnly: true,/* Sync Only will be useful for QC Amazon */
            redeemed: false,
            retrieveIfRedeemed: true,
            reference_id: referenceId,
            order_id: referenceId,
            extra: { client: campaignNameR },
            link_reference_id: '',
            reference_code_otp: '',
            soft_link_order_id: ''

        }

        if (!ledgerVendorCode || ledgerVendorCode === 'ZEUS_INVENTORY' || ledgerVendorCode === 'best_vendor') {

            options.link_reference_id = link_reference_id;
            options.reference_code_otp = reference_code_otp;
            options.soft_link_order_id = soft_link_order_id;

            new LogSys().log(`fetchVoucherCode ZEUS_INVENTORY/best_vendor: referenceId:${referenceId}`, false, link_reference_id, null);

            return await vouchersController({
                voucherRequest: voucherRequest,
                services: this.services,
                accountabilitySchema: this.accountabilitySchema,
                options,
                env,
            });
        }

        if (apiVendorList.length !== 0) {
            if (apiVendorList.includes(ledgerVendorCode)) {
                new LogSys().log(`fetchVoucherCode vendor_code: ${ledgerVendorCode} referenceId:${referenceId}`, false, link_reference_id, null);

                return await detailsController.placeNewOrderAndStoreVoucher({
                    vendor_code: ledgerVendorCode,
                    reference_id: referenceId,
                    options,
                    brand_sku: voucherSku,
                    quantity: 1,
                    env,
                });
            }
        }
    }

    async logResponse(voucherCodeFromVpp: any) {
        new LogSys().log(`vendorCode:${voucherCodeFromVpp?.vendorCode} OrderStatus:${voucherCodeFromVpp?.success}`, false, null, null);
        new LogSys().log(`voucherMessage:${voucherCodeFromVpp?.message} OrderStatus:${voucherCodeFromVpp?.success}`, false, null, null);

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
        referenceId: any,
        itemsService: any,
        accountabilitySchema: any
    ) {
        new LogSys().log(`handleVoucherRedemption`, false, link_reference_id, null);

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


        new LogSys().log(`UpdateSoftlinkVoucherRedeemedStatus ${JSON.stringify(updateRes)}`, false, link_reference_id, null);

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

        new LogSys().log(`insertRedemptionResponse:${insertRedemptionResponse}`, false, link_reference_id, null);

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

        return await this.createErrorResponse(link_reference_id);
    }


    async getSoftLinkVouchers(link_reference_id: any, reference_code_otp: any, soft_link_token: any, env: any) {
        try {

            await new LogSys().log(`getSoftLinkVouchers link_reference_id${link_reference_id},reference_code_otp: ${reference_code_otp} }`, false, link_reference_id, null);

            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);
            // Add job to queue for processing
            const queue = getQueueForClient('soft-link-queue');
            this.workerNode('soft-link-queue');
            const job = await queue.add('redeem', { link_reference_id, reference_code_otp, soft_link_token, env }, { removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } });
            // const worker = this.workerNode()

            const counts = await queue.getJobCounts();
            // Wait for job to complete
            const finallResult = await job.waitUntilFinished(queueEvents['soft-link-queue']!);

            return finallResult;

        } catch (e) {

            await new LogSys().log(`getSoftLinkVouchers Error${JSON.stringify(e)}`, false, link_reference_id, null);

            return {
                success: false,
                message: 'Record Not Found!.  Please Contact Administrator.',
            };
        }
    }

    async retryFailedVouchers() {
        try {
            await new LogSys().log(`retryFailedVouchers`, false, null, null);

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

                    new LogSys().log(`ref : ${ledgerReferenceId},ctr: ${ledgerAttempts},res: ${JSON.stringify(failedLedResponse)} `, false, ledgerReferenceId, null);


                    allLedgerResponses.push(failedLedResponse);
                }
            }

            return {
                response: allLedgerResponses,
            };
        } catch (e) {

            new LogSys().log(`retryFailedVouchers error: ${JSON.stringify(e)}`, false, null, null);

            return {
                success: false,
                message: 'Server Error, Please try later',
                err_code: 'RETRY_EXC_ERR',
            };
        }
    }

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
    }: any) {
        try {
            new LogSys().log(`Retrying RefId:${ledgerReferenceId} | ctr:${ledgerAttempts}`, false, ledgerReferenceId, null);

            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            const voucherSku = ledgerReferenceId ? ledgerReferenceId.split('-')[0] : null;
            let link_reference_id = '';
            let soft_link_order_id = '';
            let soft_link_token = '';
            const user = {
                email: failedLedger['reward_link']['email'] || '',
                date: Date.now(),
            };
            let secretKey = CONFIG.secret_key;
            let expiresIn = CONFIG.expiresIn;
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
            new LogSys().log(`increaseAttemptsResponse:${JSON.stringify(increaseAttemptsResponse)}`, false, ledgerReferenceId, null);

            if (ledgerVendorCode != 'ZEUS_INVENTORY') {

                new LogSys().log(`Requesting VPP Old Order Api RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

                /* REQUEST VPP API FOR OLD VOUCHERS */

                const options = {
                    store_to_inventory: true,
                    redeemed: link_reference_id ? false : true,
                    reference_id: ledgerReferenceId,
                    order_id: link_reference_id ? "" : ledgerReferenceId,
                    extra: {
                        client: ledgerLinkCampaign + ' - (R)',
                    },
                    link_reference_id: link_reference_id,
                    reference_code_otp: reference_code_otp,
                    soft_link_order_id: soft_link_order_id,
                    voucherSku: voucherSku,
                }
                const vendor_code = ledgerVendorCode;
                const reference_id = ledgerReferenceId;
                const detailsController = new CoreController(this.services, this.accountabilitySchema);

                const getOrderHistoryResponse = await detailsController.getAndStoreOldVouchers({ vendor_code, reference_id, options });


                const orderHistorySuccess =
                    getOrderHistoryResponse != '' && getOrderHistoryResponse && getOrderHistoryResponse['success'];

                new LogSys().log(`VPP Response RefId:${ledgerReferenceId} | suc:${orderHistorySuccess}`, false, ledgerReferenceId, null);

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
                    new LogSys().log(`VPP Place New Order RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

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

                    new LogSys().log(`VPP New Order Response RefId:${ledgerReferenceId} | suc:${orderHistorySuccess}`, false, ledgerReferenceId, null);

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
                            new LogSys().log(`getLinkVouchers updateRes ${JSON.stringify(updateRes)}`, false, ledgerReferenceId, null);

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
                new LogSys().log(`Inventory Failed Order, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

                if (!ledgerReferenceId.includes('inventory')) {

                    new LogSys().log(`Bypassing VPP - Redeeming from Inventory, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

                    /* Get Voucher Code */
                    const campaignName = ledgerLinkCampaign;
                    const campaignNameR = campaignName + ' - (R)';
                    if (deliveryMode == 'link') {
                        let softlinkvoucherCode = await get.voucherCodeByOrerId(voucherSku, ledgerReferenceId);

                        if (!softlinkvoucherCode) {
                            softlinkvoucherCode = await get.voucherCode(voucherSku);
                        }

                        if (softlinkvoucherCode) {
                            new LogSys().log(`Got Voucher from Gift Card Inventory, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

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

                            new LogSys().log(`Updated Voucher Redeemed at Zeus Inventory, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

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
                            new LogSys().log(`Got Voucher from Gift Card Inventory, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

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
                            new LogSys().log(`Got Voucher from Gift Card Inventory, RefId:${ledgerReferenceId}Updated Voucher Redeemed at Zeus Inventory, RefId:${ledgerReferenceId}`, false, ledgerReferenceId, null);

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
            new LogSys().log(`handleFailedLedgerError:${JSON.stringify(e)}`, false, ledgerReferenceId, null);

        }
    }

    insertRedemptionAndUpdateLedger = async (
        orderResponse: any,
        ledgerReferenceId: any,
        ledgerLinkId: any,
        sku_id: any,
        ledgerId: any,
        newOrder: any,
        link_reference_id: any,
        reference_code_otp: any,
        redeemed_mode: any,
        link_ledger_id: any,
        soft_link_token: any
    ) => {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            const { keys } = orderResponse;
            new LogSys().log(`VPP NEW:${newOrder} Keys RefId:${ledgerReferenceId} | keys:${keys}`, false, ledgerReferenceId, null);

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

                new LogSys().log(`VPP NEW:${newOrder} isInsertRedemptionSuc RefId:${ledgerReferenceId} | suc:${isInsertRedemptionSuc}`, false, ledgerReferenceId, null);

                if (isInsertRedemptionSuc) {
                    const updateLedgerResponse = await set.updateLedgerTransactionOrderStatus(ledgerId, 'successful', null, null);
                    new LogSys().log(`updateLedgerResponse: ${JSON.stringify(updateLedgerResponse)}`, false, ledgerReferenceId, null);

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
            new LogSys().log(`insertRedemptionAndUpdateLedgerError${JSON.stringify(e)}`, false, ledgerReferenceId, null);
        }
    };


    async VoucherActivationMail(vouchers: any[]) {
        try {
            // 1. Prepare data
            const data = vouchers.map(voucher => ({
                Order_Id: voucher.order_id,
                sku: voucher.sku,
                Brand_Name: voucher.brand_name,
                Code: voucher.code,
                PIN: voucher.pin,
                voucher_status: voucher.voucher_status,
            }));

            if (!data.length) {
                return {
                    success: false,
                    data: null,
                    message: 'No voucher data to export.',
                };
            }

            // 2. Convert to Excel buffer
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Vouchers');

            const buffer = XLSX.write(workbook, {
                bookType: 'xlsx',
                type: 'buffer',
            });

            const fileName = `vouchers_activation_${Date.now()}.xlsx`;

            // 3. Upload file
            const uploadResult = await this.uploadFileBuffer(buffer, fileName);

            // 4. Validate upload response
            if (uploadResult?.data?.id) {
                return {
                    success: true,
                    data: uploadResult,
                    message: 'Voucher Excel file uploaded successfully.',
                };
            } else {
                return {
                    success: false,
                    data: uploadResult,
                    message: 'Upload failed: Invalid response from server.',
                };
            }
        } catch (error) {
            return {
                success: false,
                data: error,
                message: 'Voucher upload failed. Please contact administrator.',
            };
        }
    }


    // ✅ Upload Excel file using axios
    async uploadFileBuffer(buffer: Buffer, fileName: string) {
        const form = new FormData();
        form.append('file', buffer, {
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        try {
            const response = await axios.post(`${CONFIG.zeus.base_url}/files`, form, {
                headers: {
                    Authorization: CONFIG.zeus.auth,
                    ...form.getHeaders(),
                },
                maxBodyLength: Infinity,
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                data: error,
                message: 'Voucher upload failed. Please contact administrator.',
            };
        }
    }


}
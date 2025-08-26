/* eslint-disable prefer-const */
import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }, { services, getSchema, exceptions }) => {
	const { ItemsService, UsersService } = services;
	const { ServiceUnavailableException,InvalidPayloadException } = exceptions;

	action('sp_reconciliation.items.create', async (input, { schema, accountability }) => {
		try {
			const usersService = new UsersService({ schema: await getSchema(), accountability: { admin: true } });

			const spReconciliationService = new ItemsService('sp_reconciliation', {
				schema: await getSchema(),
				accountability: { admin: true },
			});

			const getSigleUserData = await spReconciliationService.readByQuery({
				filter: { id: { _eq: input.key } },
				fields: ['role'],
			});

			input.payload.role = getSigleUserData[0].role;

			let getId = await usersService.createOne(input.payload);
			await spReconciliationService.updateOne(input.key, {
				user_details: getId,
			});
		} catch (error) {
			logError(error, schema, accountability);
		}
	});

	action('sp_reconciliation.items.update', async (input: any, { schema, accountability }) => {
		try {
			const usersService = new UsersService({ schema: await getSchema(), accountability: { admin: true } });
			const spReconciliationService = new ItemsService('sp_reconciliation', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const getSigleUserData = await spReconciliationService.readByQuery({
				filter: { id: { _eq: input.keys[0] } },
				fields: ['user_details'],
			});

			await usersService.updateOne(getSigleUserData[0].user_details, input.payload);
		} catch (error) {
			logError(error, schema, accountability);
		}
	});

	filter('sp_reconciliation.items.delete', async (input: any, { collection }, { schema, accountability }) => {
		try {
			const spReconciliationService = new ItemsService('sp_reconciliation', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			const usersService = new UsersService({ schema: await getSchema(), accountability: { admin: true } });

			let getSigleUserData = await spReconciliationService.readByQuery({
				filter: { id: { _eq: input[0] } },
				fields: ['user_details'],
			});

			let userId = getSigleUserData[0].user_details;
			await usersService.deleteOne(userId);
		} catch (error) {
			logError(error, schema, accountability);
		}
	});

	filter('sp_reward_campaigns.items.update', async (input: any, { keys, collection }, { schema, accountability }) => {
		try {
			if (input.soft_link_delivery_mode !== undefined && (input.soft_link_delivery_mode === null || input.soft_link_delivery_mode.length === 0)) {
				throw new InvalidPayloadException('Please Enter the Soft Link Delivery Mode');
			}

			if( (input.mobile_custom_field && input.mobile_custom_field.length === 0) && (input.email_custom_field && input.email_custom_field.length === 0)){
				throw new InvalidPayloadException('Please select email or mobile custom field');
			}

			let customized_link_fields = [];
			if (input.mobile_custom_field && input.mobile_custom_field.length > 1) {
				throw new InvalidPayloadException('Select any one of the mobile custom field');
			}

			if (input.email_custom_field && input.email_custom_field.length > 1) {
				throw new InvalidPayloadException('Select any one of the email custom field');
			}

			let is_email_empty = 0;
			let is_mobile_empty = 0;

			if (input.campaign_type && input.campaign_type == 'pdf') {
			} else {
				if (input.otp_mode || input.email_custom_field || input.mobile_custom_field || input.delivery_mode || input.soft_link_delivery_mode) {
					let otp_mode = input.otp_mode;

					const campaignService = new ItemsService('sp_reward_campaigns', {
						schema: await getSchema(),
						accountability: { admin: true },
					});

					let campaignData = await campaignService.readByQuery({
						filter: { id: { _eq: keys[0] } },
						fields: ['*'],
					});

					if (input.otp_mode) {
						otp_mode = input.otp_mode;
					} else {
						otp_mode = campaignData[0].otp_mode;
					}

					if(input.mobile_custom_field && input.mobile_custom_field.length > 0){
						customized_link_fields.push("mobile");
					}else if(input.mobile_custom_field && input.mobile_custom_field.length == 0){
						is_mobile_empty = 1;
					}else{
						if (campaignData[0].mobile_custom_field && campaignData[0].mobile_custom_field.length > 0) {
							customized_link_fields.push("mobile");
						}else{
							is_mobile_empty = 1;
						}
					}
					if(input.email_custom_field && input.email_custom_field.length > 0){
						customized_link_fields.push("email");
					}else if(input.email_custom_field && input.email_custom_field.length == 0){
						is_email_empty = 1;
					}else{
						if (campaignData[0].email_custom_field && campaignData[0].email_custom_field.length > 0) {
							customized_link_fields.push("email");
						}else{
							is_email_empty = 1;
						}
					}

					if(is_mobile_empty == 1 && is_email_empty == 1){
						throw new InvalidPayloadException('Please select email or mobile custom field');
					}

					if ((otp_mode == 'sms' || otp_mode == 'whatsapp' || otp_mode == 'code') && customized_link_fields.includes('mobile')) {
					} else if (otp_mode == 'email' && customized_link_fields.includes('email')) {
					} else {
						throw new InvalidPayloadException("OTP mode dosen't match with the custom fields");
					}
					/* Add Smart Link Validation */
					let delivery_mode = input.delivery_mode;
					if (!input.delivery_mode) {
						delivery_mode = campaignData[0].delivery_mode;
					}

					let soft_link_delivery_modes = input.soft_link_delivery_mode;
					if (!input.soft_link_delivery_mode) {
						soft_link_delivery_modes = campaignData[0].soft_link_delivery_mode;
					}

					if(delivery_mode == 'link'){
						if(soft_link_delivery_modes.includes('email')){
							if(!customized_link_fields.includes('email')){
								throw new InvalidPayloadException("Soft link delivery mode email dosen't match with the custom fields");
							}
						}
	
						if(soft_link_delivery_modes.includes('whatsapp')){
							if(!customized_link_fields.includes('mobile')){
								throw new InvalidPayloadException("Soft link delivery mode mobile dosen't match with the custom fields");
							}
						}
					}
					/* End */
				}
			}
		} catch (error) {
			throw new InvalidPayloadException(error);

		}
	});

	filter('sp_reward_campaigns.items.create', async (input: any, { schema, accountability }) => {
		try {
			if( (!input.mobile_custom_field || input.mobile_custom_field.length === 0) && (!input.email_custom_field || input.email_custom_field.length === 0)){
				throw new InvalidPayloadException('Please select email or mobile custom field');
			}

			let customized_link_fields = [];
			if (input.mobile_custom_field && input.mobile_custom_field.length > 1) {
				throw new InvalidPayloadException('Select any one of the mobile custom field');
			}else{
				if (input.mobile_custom_field && input.mobile_custom_field.length == 1) {
					customized_link_fields.push("mobile");
				}
			}

			if (input.email_custom_field && input.email_custom_field.length > 1) {
				throw new InvalidPayloadException('Select any one of the email custom field');
			}else{
				if (input.email_custom_field && input.email_custom_field.length == 1) {
					customized_link_fields.push("email");
				}
			}
			
			if (input.campaign_type && input.campaign_type == 'pdf') {
			} else {
				if(!input.otp_mode){
					input.otp_mode = 'sms';
				}
				if ((input.otp_mode == 'sms' || input.otp_mode == 'whatsapp'  || input.otp_mode == 'code') && customized_link_fields.includes('mobile')) {
				} else if (input.otp_mode == 'email' && customized_link_fields.includes('email')) {
				} else {
					throw new InvalidPayloadException("OTP mode dosen't match with the custom fields");
				}

				/* Add Smart Link Validation */
				if(input.delivery_mode == 'link'){
					let soft_link_delivery_modes = input.soft_link_delivery_mode;

					if(soft_link_delivery_modes.includes('email')){
						if(!customized_link_fields.includes('email')){
							throw new InvalidPayloadException("Soft link delivery mode email dosen't match with the custom fields");
						}
					}

					if(soft_link_delivery_modes.includes('whatsapp')){
						if(!customized_link_fields.includes('mobile')){
							throw new InvalidPayloadException("Soft link delivery mode mobile dosen't match with the custom fields");
						}
					}
				}
				/* End */
			}
		} catch (error) {
            throw new InvalidPayloadException(error);
		}
	});

	

	async function logError(error, schema, accountability) {
		try {
			let error_log = {};
			const errorLogService = new ItemsService('backend_logs', {
				schema: await getSchema(),
				accountability: { admin: true },
			});

			error_log.log = error;
			await errorLogService.createOne({ log: error_log });
		} catch (error) {}
	}
});

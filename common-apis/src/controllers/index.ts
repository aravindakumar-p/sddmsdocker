import Getters from "../db/getters";
import Setters from "../db/setters";
import helper from "../helpers/common";
import LogSys from "../helpers/logger";
import config from "../config.ts";
import fetch from 'node-fetch';

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
	}

	async sendOtp(mobile: any, otp: any, source: any, recordSenderId: any, params, order_id) {
		try {

			let checkMobile = await this.validateMobileNumber(mobile)
			if (checkMobile) {
				
			
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			let template_id = config.ids[recordSenderId].template_id;
			let sender_id = config.ids[recordSenderId].sender_id;

			if (!template_id || !sender_id) {
				template_id = config.ids.default.template_id;
				sender_id = config.ids.default.sender_id;
			}

			let otpSendingResponse = null;

			if (recordSenderId == config.defaults.sp_card_dist_id) {
				otpSendingResponse = await fetch(config.msg91.url  + "?" + params, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						accept: 'application/json',
						authkey: config.msg91.auth
					},
					body: JSON.stringify({
						template_id: template_id,
						sender: sender_id,
						short_url: 0,
						mobiles: mobile,
						amount: `${ params[0] }`,
						refno: `${ params[1] }`
					})
				});
			} else {
				const params = new URLSearchParams({
					template_id: template_id,
					mobile: mobile
				}).toString();

				otpSendingResponse = await fetch(config.msg91.otp_url + "?" + params, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						accept: 'application/json',
						authkey: config.msg91.auth
					},
					body: JSON.stringify({
						OTP: otp
					})
				});
			}

			const otpResponse = await otpSendingResponse.json()

			let message_id = "";
			let template = "";
			const event_type = config.defaults.event_type;
			const recipient = mobile;
			const status = otpResponse.type=="error"? "Error" : "Send" ;

			if (otpResponse.type=="error") {
				await new LogSys().jsonError({
					mob: mobile, src: source,
					msg: otpResponse.message,
					err: "msg91"
				});
			}

			if (recordSenderId == config.defaults.sp_card_dist_id) {
				message_id = otpResponse.message;
				template = config.defaults.sp_card_dist_template;
			} else {
				message_id = otpResponse.request_id;
				template = config.defaults.template;
			}

			const insertSesLogs = await set.insertSesLog(order_id, message_id, recipient, event_type, template, source, status);

			return {
				"success": otpResponse.type != "error",
				"message": otpResponse.type=="error"? config.defaults.messages.msg_send_failed : config.defaults.messages.msg_send_success
			}

		}else{
			await new LogSys().jsonError({
				exception: "",
				error: "Mobile Number Invalid"
			});
			return {
				"success": false,
				"message": "Mobile Number Invalid",
				"error": "Mobile Number Invalid"
			}
		}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e + "",
				error: "sendOtpError"
			});

			return {
				"success": false,
				"message": config.defaults.messages.msg_send_init_failure,
				"error": e
			}
		}
	}

	async verifyCaptcha(client_id: any, requestCaptchaResponse: any) {
		try {
			const recaptchaSecretKeysJson = JSON.parse(config.recaptchaSecretKeys);
			/* Secret Key Based on Client ID */
			const secretKey = recaptchaSecretKeysJson[client_id];

			if (!secretKey) {
				return {
					success: false,
					message: config.defaults.messages.inv_client_id
				};
			}

			const googleReCaptchaUrl = config.recaptcha.url;
			const captchaVerifyUrl = `${googleReCaptchaUrl}?secret=${secretKey}&response=${requestCaptchaResponse}`;

			const reCaptchaResponse = await fetch(captchaVerifyUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json'
				}
			});

			const jsonResponse = await reCaptchaResponse.json();

			/* Note this success below is the success that we have received a response from google recaptcha
			* It does not mean that the captcha is verified as valid.
			* */
			return {
				success: true,
				response: jsonResponse
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e + "",
				error: "verifyCaptchaError"
			});

			return {
				success: false,
				message: config.defaults.messages.captcha_ver_failed,
				response: null
			}
		}
	}

	async validateMobileNumber(mobileNumber:any) {
		try {
		// Remove any spaces, dashes, or other non-numeric characters

		if (mobileNumber.length === 10) {
			mobileNumber = '91' + mobileNumber;
		  }
		const cleanedNumber = mobileNumber.replace(/\D/g, '');
		
		// Check if the cleaned number starts with '91' and has more than 10 digits
		if (cleanedNumber.startsWith('91') && cleanedNumber.length > 10) {
		  return true;
		} else {
		  return false;
		}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e + "",
				error: "validateMobileNumber"
			});

			
		}
	}

}

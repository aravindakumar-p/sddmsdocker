export default {
	collection: {
		LOG_TABLE: 'sd_error_log',
		SES_LOGS_TABLE: 'sd_delivery_logs',
	},
	logging_system: {
		save_normal_logs: true,
		save_error_logs: true,
	},
	recaptcha: {
		url: process.env.CO_RECAPTCHA_URL,
	},
	msg91: {
		url: process.env.CO_MSG91_URL,
		auth: process.env.CO_MSG91_AUTH,
		otp_url: process.env.CO_MSG91_OTP_URL,
	},
	auth: {
		'send-otp': process.env.CO_SEND_OTP_AUTH,
		'captcha-verify': process.env.CO_CAPTCHA_VERIFY_AUTH,
	},
	recaptchaSecretKeys: process.env.CO_CAPTCHA_SECRET_KEYS,
	defaults: {
		sp_card_dist_id: 'SHAKPE-Card-Distribution',
		sp_card_dist_template: 'Loading Gift Card',
		template: 'otp',
		event_type: 'SMS',
		messages: {
			msg_send_failed: 'Message Sending Process Failed',
			msg_send_success: 'Message Sending Process Initiated',
			msg_send_init_failure: 'Message Sending Process Initiation Failure',
			captcha_ver_failed: 'Captcha Verification Error',
			server_err: 'Server Error, Please try later.',
			inv_req: 'Invalid Request',
			no_cred: 'No credentials sent!',
			acc_forbidden: 'Access Forbidden',
			inv_client_id: 'Invalid Client Id',
		},
	},
	ids: {
		SHAKDL: {
			template_id: process.env.SHAKDL_TEMPLATE_ID,
			sender_id: process.env.SHAKDL_TEMPLATE_SENDER_ID,
		},
		'SHAKPE-IVR-Card-Activation': {
			template_id: process.env.SHAKPE_IVR_CARD_ACTIVATION_TEMPLATE_ID,
			sender_id: process.env.SHAKPE_IVR_CARD_ACTIVATION_SENDER_ID,
		},
		'SHAKPE-Card-Distribution': {
			template_id: process.env.SHAKPE_CARD_DISTRIBUTION_TEMPLATE_ID,
			sender_id: process.env.SHAKPE_CARD_DISTRIBUTION_SENDER_ID,
		},
		'SHAKPE-OTP': {
			template_id: process.env.SHAKPE_OTP_TEMPLATE_ID,
			sender_id: process.env.SHAKPE_OTP_SENDER_ID,
		},
		'SHAKPE-Links-OTP': {
            "template_id": process.env.SHAKPE_LINKS_OTP_TEMPLATE_ID,
            "sender_id": process.env.SHAKPE_LINKS_OTP_SENDER_ID
        },
		'default': {
			"template_id": process.env.SHAKDL_TEMPLATE_ID,
			"sender_id": process.env.SHAKDL_TEMPLATE_SENDER_ID
		}
	}
}

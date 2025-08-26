export default {
	collection: {
		LOG_TABLE: 'backend_logs',
		REWARD_LINKS_TABLE: 'sp_reward_links',
		REWARD_SKU_TABLE: 'sd_brand_sku_mapping',
		REWARD_REDEMPTIONS_TABLE: 'sp_reward_redemptions',
		LINK_LEDGER: 'sp_link_ledger',
		ZEUS_GIFT_CARD_INVENTORY: 'sd_gift_card_inventory',
		TEMP_ZEUS_CODE_DETAILS: 'temp_zeus_code_details',
		LINK_REWARD_REDEMPTIONS_TABLE: 'sp_link_reward_redemptions',
		SKU_BRAND_MAPPING: 'sd_brand_sku_mapping',
		USER_BRAND_WISE_REDEMPTIONS: 'user_brand_wise_redemptions',
		REGIONS: 'countries',
		CONVERSION_RATES: "conversion_rates"
	},
	logging_system: {
		save_normal_logs: true,
		save_error_logs: true,
	},
	defaults: {
		asset_base_url: process.env.ASSETS_BASE_URL,
		auto_logout_time_mins: process.env.AUTO_LOGOUT_TIME_MINS,
		max_retry_attempts: process.env.MAX_RETRY_ATTEMPTS_FAILED_ORDERS ? process.env.MAX_RETRY_ATTEMPTS_FAILED_ORDERS : 5,
	},
	zeus: {
		base_url: process.env.ZEUS_BASE_URL,
		auth: process.env.ZEUS_AUTH,
	},
	workflows: {
		base_url: process.env.WORKFLOW_BASE_URL,
		sd_notifications_auth: process.env.WORKFLOW_AUTH,
	},
	auth: {
		extension: process.env.REWARD_LINKS_AUTH,
		zeus_send_otp_api: process.env.ZEUS_SEND_OTP_AUTH,
	},
	custom_domain: process.env.CUSTOM_DOMAIN,
	from_mail: process.env.NOTIFICATION_FROM_MAIL,
	max_link_resend: process.env.MAX_LINK_RESEND_COUNT,
	max_random_chars: process.env.MAX_RANDOM_CHAR,
	secret_key: process.env.SOFT_LINK_SECRET_KEY,
	expiresIn: process.env.SOFT_LINK_TOKEN_EXPIRE_INPUT,
	inventoryQty: process.env.INVENTORY_QTY,
	fetchDate: process.env.SOFTLINK_FETCH_DATE,
	softlLinkInventoryQty: process.env.SOFTLINK_INVENTORY_QTY,
	apiVendorList: process.env.API_VENDOR_LIST,
	forexCharges: process.env.FOREX_CHARGES_PERCENTAGE,
	redis_config: {
		CACHE_ENABLED: process.env.CACHE_ENABLED,
		CACHE_STORE: process.env.CACHE_STORE,
		CACHE_REDIS_PORT: process.env.CACHE_REDIS_PORT,
		CACHE_REDIS_HOST: process.env.CACHE_REDIS_HOST,
		CACHE_REDIS_PASSWORD: process.env.CACHE_PASSWORD
	},
};

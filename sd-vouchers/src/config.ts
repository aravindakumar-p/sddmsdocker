export const CONFIG = {
	collection: {
		BRAND_VENDOR_MAPPING: 'sd_brand_vendor_mapping',
		VENDOR_SKU_MAPPING: 'sd_vendor_sku_mapping',
		BRAND_DETAILS: 'sd_brand_details',
		VENDOR_DETAILS: 'sd_vendor_details',
		BRAND_SKU_MAPPING: 'sd_brand_sku_mapping',
		GIFT_CARD_INVENTORY: 'sd_gift_card_inventory',
		VENDOR_ORDERS: 'sd_vendor_orders',
		LOG_TABLE: 'sd_error_log',
		INVENTORY_BALANCE_REPORT: 'sd_giftcard_inventory_balance_report',
		ZEUS_GIFT_CARD_INVENTORY: 'sd_gift_card_inventory',
		LINK_LEDGER: 'sp_link_ledger',
		LINK_REWARD_REDEMPTIONS_TABLE: 'sp_link_reward_redemptions',
		REWARD_LINKS_TABLE: 'sp_reward_links',
		USER_BRAND_WISE_REDEMPTIONS: 'user_brand_wise_redemptions',
		SKU_BRAND_MAPPING: 'sd_brand_sku_mapping',
		VENDOR_CATALOGUE: 'sd_vendor_catalogue'
	},
	logging_system: {
		save_normal_logs: true,
		save_error_logs: true
	},
	vendor_id_mapping: {
		WORK_ADVANTAGE: 'WK_ADV',
		AMAZON_QC: 'QC_AMZN',
		FLIPKART_EGV: 'FK_EGV',
		QUICKCILVER_EGV: 'QC_EGV',
		REWARD_STORE: 'REWARD_ST'
	},
	inventoryQty: process.env.INVENTORY_QTY ? parseInt(process.env.INVENTORY_QTY) : 1,
	softlLinkInventoryQty: process.env.SOFTLINK_INVENTORY_QTY ? parseInt(process.env.SOFTLINK_INVENTORY_QTY) : 1,
	secret_key: process.env.SOFT_LINK_SECRET_KEY || 'your-secret-key-here',
	expiresIn: process.env.SOFT_LINK_TOKEN_EXPIRE_INPUT ? parseInt(process.env.SOFT_LINK_TOKEN_EXPIRE_INPUT) : 24,
	from_mail: process.env.NOTIFICATION_FROM_MAIL || 'noreply@example.com',
	custom_domain: process.env.CUSTOM_DOMAIN || 'https://example.com',
	max_random_chars: process.env.MAX_RANDOM_CHAR ? parseInt(process.env.MAX_RANDOM_CHAR) : 16,
	zeus: {
		base_url: process.env.ZEUS_BASE_URL || 'https://zeus-api.example.com',
		auth: process.env.ZEUS_AUTH || 'Bearer your-zeus-token',
		zeus_api_access:process.env.ZEUS_API_AUTH
	},
	defaults: {
		asset_base_url: process.env.ASSETS_BASE_URL || 'https://example.com/assets',
		auto_logout_time_mins: process.env.AUTO_LOGOUT_TIME_MINS,
		max_retry_attempts: process.env.MAX_RETRY_ATTEMPTS_FAILED_ORDERS ? process.env.MAX_RETRY_ATTEMPTS_FAILED_ORDERS : 5,

	},
	workflows: {
		base_url: process.env.WORKFLOW_BASE_URL,
		sd_notifications_auth: process.env.WORKFLOW_AUTH,
	},
	auth: {
		extension: process.env.REWARD_LINKS_AUTH,
		zeus_send_otp_api: process.env.ZEUS_SEND_OTP_AUTH,
	},
	apiVendorList: process.env.API_VENDOR_LIST
	
};

export default CONFIG; 
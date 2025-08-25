const workAdvantageConfig = {
	client_id: process.env.WA_CLIENT_ID,
	client_secret: process.env.WA_CLIENT_SECRET,
	redirect_uri: process.env.WA_REDIRECT_URI,
	authorization: process.env.WA_AUTHORIZATION,
	base_url: process.env.WA_BASE_URL,
	place_order_config: {
		billing_name: process.env.WA_BILLING_NAME,
		billing_email: process.env.WA_BILLING_EMAIL,
		contact: process.env.WA_CONTACT,
		postal_code: process.env.WA_POSTAL_CODE,
		city: process.env.WA_CITY,
		address_line1: process.env.WA_ADDRESS_LINE,
		state: process.env.WA_STATE,
		country: process.env.WA_COUNTRY,
		reference_id: process.env.WA_RF_ID
	},
	code_validity_time: (process.env.WA_AUTH_CODE_VALIDITY_TIME) ? process.env.WA_AUTH_CODE_VALIDITY_TIME : 21600 /* Default 6 Hours */
}

const qcAmazonConfig = {
	client_id: process.env.QC_AMZN_CLIENT_ID,
	username: process.env.QC_AMZN_USERNAME,
	password: process.env.QC_AMZN_PASSWORD,
	client_secret: process.env.QC_AMZN_CLIENT_SECRET,
	authorization: process.env.QC_AMZN_AUTHORIZATION,
	order_history_retrieval_sleep_time: (process.env.QC_AMZN_HISTORY_RETRIEVAL_SLEEP_TIME) ? process.env.QC_AMZN_HISTORY_RETRIEVAL_SLEEP_TIME : 500 /* Default 500ms */,
	base_url: process.env.QC_AMZN_BASE_URL,
	code_validity_time: (process.env.QC_AMZN_AUTH_CODE_VALIDITY_TIME) ? process.env.QC_AMZN_AUTH_CODE_VALIDITY_TIME : 21600 /* Default 6 Hours */,
	place_order_config: {
		firstname: process.env.QC_AMZN_FIRSTNAME,
		lastname: process.env.QC_AMZN_LASTNAME,
		email: process.env.QC_AMZN_EMAIL,
		telephone: process.env.QC_AMZN_TELEPHONE,
		line1: process.env.QC_AMZN_ADR_LINE1,
		line2: process.env.QC_AMZN_ADR_LINE2,
		city: process.env.QC_AMZN_CITY,
		region: process.env.QC_AMZN_REGION,
		country: process.env.QC_AMZN_COUNTRY,
		postcode: process.env.QC_AMZN_POSTALCODE,
		company: process.env.QC_AMZN_COMPANYNAME
	},
	error_code: {
		DUPLICATE_ORDER_ERROR: 5313
	}
}

const quickcilverConfig = {
	client_id: process.env.QUICK_CILVER_CLIENT_ID,
	username: process.env.QUICK_CILVER_USERNAME,
	password: process.env.QUICK_CILVER_PASSWORD,
	client_secret: process.env.QUICK_CILVER_CLIENT_SECRET,
	authorization: process.env.QUICK_CILVER_AUTHORIZATION,
	order_history_retrieval_sleep_time: (process.env.QUICK_CILVER_HISTORY_RETRIEVAL_SLEEP_TIME) ? process.env.QUICK_CILVER_HISTORY_RETRIEVAL_SLEEP_TIME : 500 /* Default 500ms */,
	base_url: process.env.QUICK_CILVER_BASE_URL,
	code_validity_time: (process.env.QUICK_CILVER_AUTH_CODE_VALIDITY_TIME) ? process.env.QUICK_CILVER_AUTH_CODE_VALIDITY_TIME : 21600 /* Default 6 Hours */,
	place_order_config: {
		firstname: process.env.QUICK_CILVER_FIRSTNAME,
		lastname: process.env.QUICK_CILVER_LASTNAME,
		email: process.env.QUICK_CILVER_EMAIL,
		telephone: process.env.QUICK_CILVER_TELEPHONE,
		line1: process.env.QUICK_CILVER_ADR_LINE1,
		line2: process.env.QUICK_CILVER_ADR_LINE2,
		city: process.env.QUICK_CILVER_CITY,
		region: process.env.QUICK_CILVER_REGION,
		country: process.env.QUICK_CILVER_COUNTRY,
		postcode: process.env.QUICK_CILVER_POSTALCODE,
		company: process.env.QUICK_CILVER_COMPANYNAME
	},
	error_code: {
		DUPLICATE_ORDER_ERROR: 5313
	},
	cardNumber: process.env.QC_CARDNUMBER
}

const flipkartConfig = {
	headers: {
		'Content-Type': 'application/json;charset=UTF-8',
		'Flipkart-Gifting-Client-Id': process.env.FLIPKART_GIFTING_API_CLIENT_ID,
		'Flipkart-Gifting-Client-Token': process.env.FLIPKART_GIFTING_API_CLIENT_TOKEN,
	},
	baseUrl: process.env.FLIPKART_GIFTING_BASE_URL
}

const rewardStoreConfig = {
	base_url: process.env.REWARD_ST_BASE_URL,
	client_id: process.env.REWARD_ST_CLIENT_ID,
	client_secret: process.env.REWARD_ST_CLIENT_SECRET,
}
export default {
	workAdvantageConfig,
	qcAmazonConfig,
	flipkartConfig,
	quickcilverConfig,
	rewardStoreConfig
}














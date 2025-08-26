import axios from 'axios';
import LogSys from '../../helpers/logger';
import store from './store';
import hmacSHA512 from 'crypto-js/hmac-sha512';
import fetch from 'node-fetch';

/**
 * QC Amazon Vendor Class:
 * Objective:
 * To handle API requests and integration with QC Amazon
 * */
export default class QCAmazon {
	client_id;
	client_secret;
	redirect_uri;
	authorization;
	base_url;
	place_order_config;
	username;
	password;

	constructor({
		client_id,
		client_secret,
		redirect_uri,
		authorization,
		base_url,
		place_order_config,
		username,
		password,
	}) {
		this.client_id = client_id;
		this.client_secret = client_secret;
		this.redirect_uri = redirect_uri;
		this.authorization = authorization;
		this.base_url = base_url;
		this.place_order_config = place_order_config;
		this.username = username;
		this.password = password;
	}

	generateSignature = async (api_url, reqBody, reqMethod) => {
		try {
			var requestBody = reqBody;
			var requestHttpMethod = (reqMethod + '').toUpperCase();
			var absApiUrl = api_url;
			var clientSecret = this.client_secret;


			let sortObject = (object) => {
				if (object instanceof Array) {
					var sortedObj = [],
						keys = Object.keys(object);
				} else {
					(sortedObj = {}), (keys = Object.keys(object));
				}

				keys.sort(function (key1, key2) {
					if (key1 < key2) return -1;
					if (key1 > key2) return 1;
					return 0;
				});

				for (var index in keys) {
					var key = keys[index];
					if (typeof object[key] == 'object') {
						if (object[key] instanceof Array) {
							sortedObj[key] = sortObject(object[key]);
						}
						sortedObj[key] = sortObject(object[key]);
					} else {
						sortedObj[key] = object[key];
					}
				}
				return sortedObj;
			};

			let sortQueryParams = () => {
				var url = absApiUrl.split('?'),
					baseUrl = url[0],
					queryParam = url[1].split('&');

				absApiUrl = baseUrl + '?' + queryParam.sort().join('&');

				return fixedEncodeURIComponent(absApiUrl);
			};

			let getConcatenateBaseString = () => {
				var baseArray = [];
				baseArray.push(requestHttpMethod.toUpperCase());

				if (absApiUrl.indexOf('?') >= 0) {
					baseArray.push(sortQueryParams());
				} else {
					baseArray.push(fixedEncodeURIComponent(absApiUrl));
				}
				if (requestBody && Object.keys(requestBody).length) {
					baseArray.push(fixedEncodeURIComponent(JSON.stringify(sortObject(requestBody))));
				}

				return baseArray.join('&');
			};

			let fixedEncodeURIComponent = (str) => {
				return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
					return '%' + c.charCodeAt(0).toString(16).toUpperCase();
				});
			};

			return hmacSHA512(getConcatenateBaseString(), clientSecret).toString();
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC generateSignature Error',
			});
		}
	};

	getAuthCode = async (referenceId,vendor_code) => {
		try {
			const response = await axios.post(this.base_url + '/oauth2/verify', {
				clientId: this.client_id,
				username: this.username,
				password: this.password,
			});

			const { authorizationCode } = response.data;

			store.qc_amazon.AUTH_CODE = authorizationCode;
			store.qc_amazon.AUTH_CODE_LAST_UPDATED = new Date().getTime();

			return { code: authorizationCode };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getAuthCode Error',				
			},referenceId,vendor_code);
			return { codeException: true };
		}
	};

	getOAuthToken = async (code,referenceId,vendor_code) => {
		try {
			const response = await axios.post(this.base_url + '/oauth2/token', {
				clientId: this.client_id,
				clientSecret: this.client_secret,
				authorizationCode: code,
			});

			const { token } = response.data;

			store.qc_amazon.OAUTH_CODE = token;
			store.qc_amazon.OAUTH_CODE_LAST_UPDATED = new Date().getTime();


			return { access_token: token };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getOAuthToken Error',
			},	referenceId,
			vendor_code);
			return { oAuthException: true };
		}
	};

	getOrderStatus = async (reference_id, access_token,vendor_code) => {
		try {
			const apiUrl = this.base_url + `/rest/v3/order/${reference_id}/status`;

			const headers = {
				connection: 'close',
				'content-type': 'application/json',
				dateatclient: new Date().toISOString() + '',
				signature: await this.generateSignature(apiUrl, null, 'GET'),
				'accept-encoding': 'gzip, deflate, br',
				Authorization: !apiUrl.includes('zeus') ? `Bearer ${access_token}` : '',
			};

			if (apiUrl.includes("zeus")) {
				headers["sp-qc-auth"] = `Bearer ${access_token}`;
			}



			const response = await fetch(apiUrl, {
				headers: headers,
				method: 'GET',
			});

			const responseJson = await response.json();
			await new LogSys().log(`get Order Status${response}`, false, reference_id,vendor_code);
			return { response: responseJson };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getOrderStatus Error',
			},
			reference_id,
			vendor_code);
			return { oAuthException: true };
		}
	};

	placeVouchersOrder = async ({ qty, vendorSku, access_token, referenceId, price, currencyISOCode, syncOnly,vendor_code }) => {
		try {
			const reqBody = {
				address: {
					firstname: this.place_order_config.firstname,
					lastname: this.place_order_config.lastname,
					email: this.place_order_config.email,
					telephone: this.place_order_config.telephone,
					line1: this.place_order_config.line1,
					line2: this.place_order_config.line2,
					city: this.place_order_config.city,
					region: this.place_order_config.region,
					country: this.place_order_config.country,
					postcode: this.place_order_config.postcode,
					company: this.place_order_config.company,
					billToThis: true,
				},
				payments: [
					{
						code: 'svc',
						amount: price*qty,
					},
				],
				refno: referenceId,
				syncOnly: syncOnly,
				deliveryMode: 'API',
				products: [
					{
						sku: vendorSku,
						price: price,
						qty: qty,
						currency: currencyISOCode,
						theme: '',
					},
				],
			};

			await new LogSys().log(`QC-AMAZON Body:${JSON.stringify(reqBody)}`, null,referenceId,vendor_code);
			await new LogSys().log(`QC-AMAZON access_token:${access_token}`, null,referenceId,vendor_code);
			const apiUrl = this.base_url + '/rest/v3/orders';

			const headers = {
				connection: 'close',
				'content-type': 'application/json',
				dateatclient: new Date().toISOString() + '',
				signature: await this.generateSignature(apiUrl, reqBody, 'POST'),
				'accept-encoding': 'gzip, deflate, br',
				Authorization: !apiUrl.includes('zeus') ? `Bearer ${access_token}` : '',
			};

			if (apiUrl.includes("zeus")) {
				headers["sp-qc-auth"] = `Bearer ${access_token}`;
			}


			const response = await fetch(apiUrl, {
				headers: headers,
				body: JSON.stringify(reqBody),
				method: 'POST',
			});

			const responseJson = await response.json();
			let { status, message, cards, orderId, code } = responseJson;

			let vouchers = null;
			let walletBalance = null;
			let success = status == 'COMPLETE' || status == 'PROCESSING';

			try {
				vouchers = cards.map((card) => {
					return {
						cardnumber: card['cardNumber'],
						pin_or_url: card['cardPin'],
						expiry: card['validity'],
					};
				});
			} catch (e) {
				success = false;
			}

			try {
				walletBalance = responseJson["payments"][0]["balance"];

			} catch (e) {
				await new LogSys().jsonError({
					exception: e,
					error: 'Wallet balance retrieval Error',
				},
				referenceId, 
				vendor_code);
			}

			return { vouchers, success, message, orderId, status, statusCode: code, walletBalance };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC placeVouchersOrder Error',
			},
			referenceId, 
				vendor_code);
			return { orderException: true };
		}
	};

	async getOlderOrderDetails(vendorOrderId:any, access_token: any,referenceId:any,vendor_code:any) {
		try {
			const apiUrl = this.base_url + `/rest/v3/order/${vendorOrderId}/cards/?limit=400`;

			const headers = {
				connection: 'close',
				'content-type': 'application/json',
				dateatclient: new Date().toISOString() + '',
				signature: await this.generateSignature(apiUrl, null, 'GET'),
				'accept-encoding': 'gzip, deflate, br',
				Authorization: !apiUrl.includes('zeus') ? `Bearer ${access_token}` : '',
			};

			if (apiUrl.includes("zeus")) {
				headers["sp-qc-auth"] = `Bearer ${access_token}`;
			}

			const response = await fetch(apiUrl, {
				headers: headers,
				method: 'GET',
			});

			const responseJson = await response.json();


			let { cards } = responseJson;
			let success = false;
			let vouchers = null;

			try {
				vouchers = cards.map((card) => {
					return {
						cardnumber: card['cardNumber'],
						pin_or_url: card['cardPin'],
						expiry: card['validity'],
					};
				});
				success = true;
			} catch (e) {
				success = false;
			}

			return { vouchers, success, message: '' };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getOlderOrderDetails Error',
			},
			referenceId,vendor_code);
			return { oldOrderException: true,vendorCode:vendor_code };
		}
	}

	async getCategory(access_token: any) {
		try {
			const apiUrl = this.base_url + `/rest/v3/catalog/categories`;

			const headers = {
				connection: 'close',
				'content-type': 'application/json',
				dateatclient: new Date().toISOString() + '',
				signature: await this.generateSignature(apiUrl, null, 'GET'),
				'accept-encoding': 'gzip, deflate, br',
				Authorization: !apiUrl.includes('zeus') ? `Bearer ${access_token}` : '',
			};

			if (apiUrl.includes("zeus")) {
				headers["sp-qc-auth"] = `Bearer ${access_token}`;
			}

			const response = await fetch(apiUrl, {
				headers: headers,
				method: 'GET',
			});

			const responseJson = await response.json();
			const categoryId = responseJson["id"];

			return {
				categoryId
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getCategory Error',
			});
			return null;
		}
	}

	async getProducts(categoryId: any, access_token:any) {
		try {
			await new LogSys().log(`categoryId ${categoryId}`, false, null,null);

			const apiUrl = this.base_url + `/rest/v3/catalog/categories/${categoryId}/products`;

			const headers = {
				connection: 'close',
				'content-type': 'application/json',
				dateatclient: new Date().toISOString() + '',
				signature: await this.generateSignature(apiUrl, null, 'GET'),
				'accept-encoding': 'gzip, deflate, br',
				Authorization: !apiUrl.includes('zeus') ? `Bearer ${access_token}` : '',
			};

			if (apiUrl.includes("zeus")) {
				headers["sp-qc-auth"] = `Bearer ${access_token}`;
			}

			const response = await fetch(apiUrl, {
				headers: headers,
				method: 'GET',
			});

			const responseJson = await response.json();
			const productList = responseJson["products"];
			await new LogSys().log(`productList ${productList}`, false, null,null);

			return {
				productList
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'QC getCategory Error',
			},null,null);
			return null;
		}
	}


}

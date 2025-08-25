import axios from 'axios';
import LogSys from '../../helpers/logger';
import store from './store';

/**
 * WorkAdvantage Vendor Class:
 * Objective:
 * To handle API requests and integration with WorkAdvantage
 * */
export default class WorkAdvantage {
	client_id;
	client_secret;
	redirect_uri;
	authorization;
	base_url;
	place_order_config;

	constructor({ client_id, client_secret, redirect_uri, authorization, base_url, place_order_config }) {
		this.client_id = client_id;
		this.client_secret = client_secret;
		this.redirect_uri = redirect_uri;
		this.authorization = authorization;
		this.base_url = base_url;
		this.place_order_config = place_order_config;
	}

	getAuthCode = async () => {
		try {
			const response = await axios.get(
				this.base_url +
					'/fetch_authorization_code?client_id=' +
					this.client_id +
					'&client_secret=' +
					this.client_secret +
					'&redirect_uri=' +
					this.redirect_uri,
				{
					headers: {
						Authorization: this.authorization,
					},
				}
			);

			const { success, code } = response.data;

			store.work_advantage.AUTH_CODE = code;
			store.work_advantage.AUTH_CODE_LAST_UPDATED = new Date().getTime();

			return { code };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getAuthCode Error',
			},null,null);
			return { codeException: true };
		}
	};

	getOAuthToken = async (code,referenceId,vendor_code) => {
		try {
			const response = await axios.post(
				this.base_url + '/oauth/token',
				{
					client_id: this.client_id,
					client_secret: this.client_secret,
					redirect_uri: this.redirect_uri,
					grant_type: 'authorization_code',
					code,
				},
				{
					headers: {
						Authorization: this.authorization,
					},
				}
			);

			return response.data;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getOAuthToken Error',
			},
			referenceId,
			vendor_code);
			return { oAuthException: true };
		}
	};

	getCatalog = async (authCode, countryCode) => {
		try {
			const response = await axios.get(
				this.base_url + `/api/v1/catalogs?iso3_code=${countryCode}&page=0&limit=10000000`,
				{
					headers: {
						Authorization: authCode,
					},
				}
			);

			return response.data;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getCatalog Error',
			},null,null);
			return { exception: true };
		}
	};

	placeVouchersOrder = async ({ qty, upc_id, access_token, referenceId , vendor_code }) => {
		try {

			let bodyparams = {
				type: 'Web',
				quantity: qty,
				billing_name: this.place_order_config.billing_name,
				billing_email: this.place_order_config.billing_email,
				contact: this.place_order_config.contact,
				postal_code: this.place_order_config.postal_code,
				city: this.place_order_config.city,
				address_line1: this.place_order_config.address_line1,
				state: this.place_order_config.state,
				country: this.place_order_config.country,
				reference_id: referenceId,
				upc_id: upc_id,
			}
			await new LogSys().log(`WORK ADVANTAGE Body:${JSON.stringify(bodyparams)}`, null,referenceId,vendor_code);

			await new LogSys().log(`WORK ADVANTAGE  access_token:${access_token}`, null,referenceId,vendor_code);
			const response = await axios.post(this.base_url + '/external_order_place', null, {
				params: bodyparams,
				headers: {
					Authorization: access_token,
				},
			});

			let vouchers = null;
			let orderId = null;
			let success = true;
			let message = '';

			try {
				vouchers = response.data.result.codes;
				orderId = response.data.result.order_id;
			} catch (e) {
				success = false;
				message = response.data.info;
			}

			return { vouchers, success, message, orderId,vendorCode:vendor_code };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'placeVouchersOrder Error'
			},
			referenceId , 
				vendor_code);
			return { orderException: true };
		}
	};

	getBalance = async (token) => {
		try {
			const response = await axios.get(this.base_url + '/balenq', {
				headers: {
					Authorization: token,
				},
			});

			return response.data;
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getBalance Error',
			},null,null);
			return { exception: true };
		}
	};

	getOlderOrderDetails = async (referenceId, token,vendor_code) => {
		try {
			const orderDetailsResponse = await axios.get(`https://secure.workadvantage.in/external_orders`, {
				params: {
					reference_id: referenceId,
				},
				headers: {
					Authorization: token,
				},
			});

			const { result, message } = orderDetailsResponse.data;

			let vouchers = null;
			let orderId = null;
			let success = true;

			try {
				const { codes, order_id } = result;
				vouchers = codes;
				orderId = order_id;
			} catch (e) {
				success = false;
			}

			return { vouchers, success, message: message ? message : '', orderId,vendorCode:vendor_code };
		} catch (e) {
			await new LogSys().jsonError({
				exception: e,
				error: 'getOlderOrderDetails Error',
			},
			referenceId,
			vendor_code);
			return { oldOrderException: true };
		}
	};
}

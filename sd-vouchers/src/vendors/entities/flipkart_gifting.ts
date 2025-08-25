import axios from 'axios';
import LogSys from '../../helpers/logger';
import store from './store';
import { compress } from '@directus/shared/utils';

/**
 * Flipkart Vendor Class:
 * Objective:
 * To handle API requests and integration with Flipkart
 * */
// flipkartGiftingApi.ts

class FlipkartGiftingApi {
	transactionId;
	denomination;
	qty;
	code;
	baseUrl;
	headers;

	constructor({ transactionId, denomination, qty, code, baseUrl, headers }) {
		this.transactionId = transactionId;
		this.denomination = denomination;
		this.qty = qty;
		this.code = code;
		this.baseUrl = baseUrl;
		this.headers = headers;
	}

	async getTrasactionId() {
		try {
			const response = await axios.post(this.baseUrl + '/gcms/api/1.0/transaction', null, {
				headers: this.headers,
			});

			return response.data;
		} catch (e:any) {
			await new LogSys().jsonError({
				exception: e,
				error: 'Transaction Id Generation Error',
			},null,null);
			return { codeException: true,message:e.response.data.statusCode,success:false  };
		}
	}

	async generateFlipkartVoucher({ transactionId, denomination }) {
		try {

			const getBaseUrl: string = this.baseUrl + '/gcms/api/1.0/egv/v2';

			let data = {
				transactionId: transactionId,
				denomination: denomination,
				recipient: {
					medium: 'INLINE',
					format: 'JSON',
				},
			};
			const response = await axios.post(getBaseUrl, data, {
				headers: this.headers,
			});
			return response.data;
		} catch (e:any) {
			await new LogSys().log('Flipkart EGV Generation Error : '+e.response.data.statusCode, e.response.data,null,'FK_EGV');

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart EGV Generation Error',
			},null,null);

			return { codeException: true,message:e.response.data.statusCode,success:false};
		}
	}


	async activateFlipkartVoucher(transactionId:any,code:any) {
		try {

			const getBaseUrl: string = this.baseUrl + '/gcms/api/1.0/egv/activate';

			let data = {
				transactionId: transactionId,
				code: code
			};
			const response = await axios.post(getBaseUrl, data, {
				headers: this.headers,
			});
			return response.data;
		} catch (e:any) {
			await new LogSys().log('Flipkart EGV Activation Error Error : '+e.response.data.statusCode, e.response.data,null,'FK_EGV');
			await new LogSys().log('Flipkart EGV Activation Error : '+e.response.data.statusMessage, e.response.data,null,'FK_EGV');

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart EGV Activation Error',
			},null,null);

			return { codeException: true,message:e.response.data.statusCode,success:false};
		}
	}

	async deactivateFlipkartVoucher(transactionId:any,code:any) {
		try {

			const getBaseUrl: string = this.baseUrl + '/gcms/api/1.0/egv/deactivate';

			let data = {
				transactionId: transactionId,
				code: code,
				comment : "deactivate"
			};
			const response = await axios.post(getBaseUrl, data, {
				headers: this.headers,
			});
			return response.data;
		} catch (e:any) {
			await new LogSys().log('Flipkart EGV Deativation Error Error : '+e.response.data.statusCode, e.response.data,null,'FK_EGV');
			await new LogSys().log('Flipkart EGV Deativation Error : '+e.response.data.statusMessage, e.response.data,null,'FK_EGV');

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart EGV Deativation Error',
			},null,null);

			return { codeException: true,message:e.response.data.statusCode,success:false};
		}
	}

	async CancelFlipkartVoucher(transactionId:any,code:any) {
		try {

			const getBaseUrl: string = this.baseUrl + '/gcms/api/1.0/egv/cancel';

			let data = {
				transactionId: transactionId,
				code: code,
				comment : "Cancel"
			};
			const response = await axios.post(getBaseUrl, data, {
				headers: this.headers,
			});
			return response.data;
		} catch (e:any) {
			await new LogSys().log('Flipkart EGV Cancel Error Error : '+e.response.data.statusCode, e.response.data,null,'FK_EGV');
			await new LogSys().log('Flipkart EGV Cancel Error : '+e.response.data.statusMessage, e.response.data,null,'FK_EGV');

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart EGV Cancel Error',
			},null,null);

			return { codeException: true,message:e.response.data.statusCode,success:false};
		}
	}

	async redispatchFlipkartVoucher(transactionId:any) {
		try {

			const getBaseUrl: string = this.baseUrl + '/gcms/api/1.0/egv/redispatch';

			let data = {
				transactionId: transactionId,
				comment : "redispatch",
				recipientList : [
					{
					"medium" : "INLINE",
					"format" : "JSON"
					}
					]
			};
			const response = await axios.post(getBaseUrl, data, {
				headers: this.headers,
			});
			return response.data;
		} catch (e:any) {
			await new LogSys().log('Flipkart EGV redispatch Error Error : '+e.response.data.statusCode, e.response.data,null,'FK_EGV');
			await new LogSys().log('Flipkart EGV redispatch Error : '+e.response.data.statusMessage, e.response.data,null,'FK_EGV');

			await new LogSys().jsonError({
				exception: e,
				error: 'Flipkart EGV redispatch Error',
			},null,null);

			return { codeException: true,message:e.response.data.statusCode,success:false};
		}
	}

	async getFlipkartBalance() {
		try {
			await new LogSys().log('get Flipkart Balance',null,null,'FK_EGV');
			const response:any = await axios.get(this.baseUrl + '/gcms/api/1.0/client/balance',{
				headers: this.headers,
			});
			let balance =0 
			balance = response.data.clients.length !==0 ? response.data.clients[0].balance  : 0;
			let success = balance > 0 ? true : false;
			let message = response.data.statusMessage;
			return { success, balance ,message}
		} catch (e:any) {
			await new LogSys().log('get Flipkart Balance Error :'+e.response.data.statusCode, e.response.data,null,'FK_EGV');
			await new LogSys().jsonError({
				exception: e,
				error: 'get Flipkart Balance Error',
			},null,null);
			return { codeException: true,message:e.response.data.statusCode,success:false };
		}
	}
}

export default FlipkartGiftingApi;

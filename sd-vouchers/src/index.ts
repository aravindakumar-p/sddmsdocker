import { defineEndpoint } from '@directus/extensions-sdk';
import { CatalogRequest, ParentRequest, Voucher, VoucherRequest, VoucherResponse } from './models/common';
import vouchersController from './controllers';
import CoreController from './controllers/core-controller';
import LogSys from './helpers/logger';
import helpers from './helpers/common';
import fetch from 'node-fetch';
import vendorConfig from './vendors/vendor-config';
import hmacSHA512 from 'crypto-js/hmac-sha512';
import campaignController from './controllers/campaigns-controller';
import CONFIG from './config';

let CRON_RUNNING = false;


/**
 * Multi - Vendor Voucher API:
 * An Integration of multiple vendor's apis into one single api [ Directus Endpoints Extension ].
 * - Shall select the best vendor for a particular request.
 * - Use that particular selected vendor's apis for retrieving vouchers
 * - save vouchers into SD Gift Card Inventory
 * */
export default defineEndpoint(async (router, { services, getSchema, env, database }) => {
	const logSys = new LogSys();

	const loggerMiddleware = async (req, res, next) => {
		try {


			logSys.createLoggerInstance(
				services.ItemsService,
				{
					accountability: req.accountability,
					schema: req.schema,
				},
				req.body
			);

			if (req.headers['sp-qc-auth']) {
				req.headers.authorization = req.headers['sp-qc-auth'];
				delete req.headers['sp-qc-auth'];
			}

			next();
		} catch (e) {
			res.send({
				success: false,
				message: 'Server Error, Please try later.',
			});
			// next();
		}
	};

	const authMiddleware = async (req, res, next) => {
		try {

			if (!req.headers.authorization) {
				return res.status(403).json({ error: 'No credentials sent!' });

			} else if (req.headers.authorization == CONFIG.auth.extension) {

				req.headers.authorization = CONFIG.zeus.zeus_api_access || '';
				const userDetails = await database
					.select(
						'directus_users.id as user_id',
						'directus_users.role as role_id',
						'directus_roles.admin_access',
						'directus_roles.app_access'
					)
					.from('directus_users')
					.leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
					.where({
						'directus_users.token': CONFIG.zeus.zeus_api_access,
						'directus_users.status': 'active',
					})
					.first();
				

				if (!userDetails) {
					res.send({
						success: false,
						message: 'Server Error, Please try later.',
					});
				}

				const permissions = await database
					.select('*')
					.from('directus_permissions')
					.where('role', userDetails.role_id);


				// Set accountability object
				req.accountability = {
					user: userDetails.user_id,
					role: userDetails.role_id,
					admin: userDetails.admin_access,
					app: userDetails.app_access,
					permissions: permissions || [],
				};

				logSys.createLoggerInstance(
					services.ItemsService,
					{
						accountability: req.accountability,
						schema: req.schema,
					},
					req.body
				);

				if (req.headers['sp-qc-auth']) {
					req.headers.authorization = req.headers['sp-qc-auth'];
					delete req.headers['sp-qc-auth'];
				}
				next();
			} else {
				return res.status(403).json({ error: 'Access Forbidden' });
			}
		} catch (e) {
			res.send({
				success: false,
				message: 'Server Error, Please try later.',
			});
		}
	};

	const getSignatureMiddleWare = async (req, res, next) => {
		try {
			const api_url = req.originalUrl.split('/vpp/yh').join('');
			const api = vendorConfig.qcAmazonConfig.base_url + api_url;

			const requestBody = req.body;
			const requestHttpMethod = (req.method + '').toUpperCase();
			let absApiUrl = api;
			const clientSecret = vendorConfig.qcAmazonConfig.client_secret;

			const sortObject = (object) => {
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

				for (const index in keys) {
					const key = keys[index];
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

			const sortQueryParams = () => {
				const url = absApiUrl.split('?'),
					baseUrl = url[0],
					queryParam = url[1].split('&');

				absApiUrl = baseUrl + '?' + queryParam.sort().join('&');

				return fixedEncodeURIComponent(absApiUrl);
			};

			const getConcatenateBaseString = () => {
				const baseArray = [];
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

			const fixedEncodeURIComponent = (str) => {
				return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
					return '%' + c.charCodeAt(0).toString(16).toUpperCase();
				});
			};

			req.headers.signature = hmacSHA512(getConcatenateBaseString(), clientSecret).toString();
		} catch (e) { }
		next();
	};

	router.post('/get-vouchers', loggerMiddleware, async (req, res) => {
		try {
			/* Boiler Plate Code
			 * Request shall be received in a particular format:
			 * check models for VoucherRequest format.
			 * */
			const parentRequest: ParentRequest = req.body;
			const { required_vouchers, options } = parentRequest;

			if (!(required_vouchers && Array.isArray(required_vouchers) && required_vouchers.length)) {
				const invalidJsonResponse: VoucherResponse = {
					success: false,
					message: `'required_vouchers' is invalid or null or has no items`,
					response: [],
				};
				res.send([invalidJsonResponse]);
				return;
			}

			const voucherRequest: VoucherRequest[] = required_vouchers;
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const allVoucherRequestPromises: any = [];
			voucherRequest.forEach((vReq, i) => {
				const promise = new Promise((resolve, reject) => {
					vouchersController({
						voucherRequest: vReq,
						accountabilitySchema,
						services,
						options,
						env,
					}).then((response) => {
						resolve(response);
					});
				});
				allVoucherRequestPromises.push(promise);
			});

			Promise.all(allVoucherRequestPromises).then((responses) => {
				res.send(responses);
			});
		} catch (e) {
			await new LogSys().jsonError(
				{
					exception: e,
					error: 'get-vouchers-error',
				},
				null,
				null
			);
			res.send({
				success: false,
				exception: true,
				message: 'Exception Occurred: ' + e,
				response: [],
			});

		}
	});

	router.post('/get-old-vouchers', loggerMiddleware, async (req, res) => {
		try {
			/** AIM: Takes in Vendor API Int Id aka vendor_code and reference id and fetched the order details and saving the Voucher to inventory */
			const { vendor_code, reference_id, options } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.getAndStoreOldVouchers({ vendor_code, reference_id, options });

			res.send(vouchersResponse);
		} catch (error) {
			res.send({
				success: false,
				error,
				exception: true,
			});
			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-catalog-error',
				},
				null,
				null
			);
		}
	});

	router.post('/place-new-order', loggerMiddleware, async (req, res) => {
		try {
			/** AIM: To place order from a specific vendor and not by ranking. */
			let { vendor_code, brand_sku, reference_id, options, quantity } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.placeNewOrderAndStoreVoucher({
				vendor_code,
				reference_id,
				options,
				brand_sku,
				quantity,
				env,
			});

			res.send(vouchersResponse);
		} catch (error) {
			res.send({
				success: false,
				error,
				exception: true,
			});
			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-catalog-error',
				},
				null,
				null
			);
		}
	});

	router.get('/get-catalog/:id/:countryCode', loggerMiddleware, async (req, res) => {
		try {
			/** AIM: Takes in Vendor API Int Id and gets its catalog and convert to xls and send as response */
			const vendorApiIntId = req.params.id;
			const countryCode = req.params.countryCode;
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			await new LogSys().log(`get-catalog vendorApiIntId : ${vendorApiIntId}`, false, null, null);
			const detailsController = new CoreController(services, accountabilitySchema);
			const { success, catalog, error } = await detailsController.getCatalog({ vendorApiIntId, countryCode });
			await new LogSys().log(`success  : ${success}`, false, null, null);

			 await new LogSys().log(`catalog  : ${JSON.stringify(catalog)}`, false, null, null);

			if (success) {
				const workbook = await detailsController.catalogToExcel({ vendorApiIntId, catalog });
				if (workbook) {
					res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

					res.setHeader('Content-Disposition', 'attachment; filename=' + `catalog.xlsx`);
					res.status(200).send(workbook);
				} else {
					res.send({
						success: false,
						error: 'Excel creation error',
					});
				}
			} else {
				res.send({
					success: false,
					error,
				});
			}
		} catch (error) {
			res.send({
				success: false,
				error,
				exception: true,
			});
			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-catalog-error',
				},
				null,
				null
			);
		}
	});

	router.get('/get-balance/:id', loggerMiddleware, async (req, res) => {
		try {
			/** AIM: Takes in Vendor API Int Id and gets its catalog and convert to xls and send as response */
			const vendorApiIntId = req.params.id;
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const detailsController = new CoreController(services, accountabilitySchema);

			const { success, balance, error, currency } = await detailsController.getBalance({ vendorApiIntId });

			if (success) {
				res.send({
					success: true,
					balance: balance,
					currency: currency ? currency : 'INR'
				});
			} else {
				res.send({
					success: false,
					error,
				});
			}
		} catch (error) {
			res.send({
				success: false,
				error,
				exception: true,
			});
			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-balance-error',
				},
				null,
				null
			);
		}
	});

	/* ============================================================================================================== */
	/* GET Proxy. */
	router.get('/yh/*', [loggerMiddleware, getSignatureMiddleWare], function (req, res, next) {
		try {
			if (process.env.VOUCHERS_PROXY_ENABLED != 'true') {
				res.send({
					message: 'Proxy Disabled',
				});
				return;
			}
			const api_url = req.originalUrl.split('/vpp/yh').join('');
			const api = vendorConfig.qcAmazonConfig.base_url + api_url;

			req.headers['Authorization'] = req.headers.authorization;
			delete req.headers['authorization'];

			delete req.headers['host'];

			const headers = {
				...req.headers,
				Authorization: req.headers['Authorization'],
			};

			fetch(api, {
				headers: headers,
				method: 'GET',
			})
				.catch((e) => {
					res.send({
						error: 'GET Error:' + e,
					});
				})
				.then(async (response) => {
					try {
						const json = await response.json();
						res.send(json);
					} catch (e) {
						new LogSys().jsonError(
							{
								exception: e,
								error: 'get-proxy-error-1',
							},
							null,
							null
						);
					}
				});
		} catch (e) {
			new LogSys().jsonError(
				{
					exception: e,
					error: 'get-proxy-error-2',
				},
				null,
				null
			);
		}
	});

	/* POST Proxy. */
	router.post('/yh/*', [loggerMiddleware, getSignatureMiddleWare], function (req, res, next) {
		try {
			if (process.env.VOUCHERS_PROXY_ENABLED != 'true') {
				res.send({
					message: 'Proxy Disabled',
				});
				return;
			}
			const api_url = req.originalUrl.split('/vpp/yh').join('');
			const api = vendorConfig.qcAmazonConfig.base_url + api_url;
			const requestBody = req.body ? req.body : {};

			req.headers['Authorization'] = req.headers.authorization;
			delete req.headers['authorization'];
			delete req.headers['host'];

			const headers = {
				...req.headers,
				Authorization: req.headers['Authorization'],
			};

			fetch(api, {
				headers: headers,
				body: JSON.stringify(requestBody),
				method: 'POST',
			})
				.catch((e) => {
					res.send({
						error: 'POST Error:' + e,
					});
				})
				.then(async (response) => {
					try {
						const json = await response.json();
						res.send(json);
					} catch (e) {
						new LogSys().jsonError(
							{
								exception: e,
								error: 'post-catalog-error-1',
							},
							null,
							null
						);
					}
				});
		} catch (e) {
			new LogSys().jsonError(
				{
					exception: e,
					error: 'post-catalog-error-2',
				},
				null,
				null
			);
		}
	});


	router.post('/linkverifyotp', loggerMiddleware, async (req, res) => {
		try {
			const { link_reference_id, reference_code_otp } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.otpVerification({ link_reference_id, reference_code_otp });
			res.send(vouchersResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-link-voucher-error',
				},
				null,
				null
			);

			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.post('/otpupdate', loggerMiddleware, async (req, res) => {
		try {
			const { link_reference_id, reference_code_otp, old_reference_code_otp } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.otpUpdate({
				link_reference_id,
				reference_code_otp,
				old_reference_code_otp,
			});
			res.send(vouchersResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-link-voucher-error',
				},
				null,
				null
			);

			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.post('/getonevoucher', loggerMiddleware, async (req, res) => {
		try {
			const { id } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.getOneVocher(id);
			res.send(vouchersResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-link-voucher-error',
				},
				null,
				null
			);
			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.post('/referenceupdate', loggerMiddleware, async (req, res) => {
		try {
			const { id } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			const detailsController = new CoreController(services, accountabilitySchema);

			const vouchersResponse = await detailsController.referenceUpdate(id);
			res.send(vouchersResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-link-voucher-error',
				},
				null,
				null
			);

			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.get('/update-catalog/:id/:countryCode', loggerMiddleware, async (req, res) => {
		try {
			/** AIM: Takes in Vendor API Int Id and gets its catalog and convert to xls and send as response */
			const vendorApiIntId = req.params.id;
			const countryCode = req.params.countryCode;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			await new LogSys().log(`udpate-catalog vendorApiIntId : ${vendorApiIntId}`, false, null, null);
			const detailsController = new CoreController(services, accountabilitySchema);

			const catalogResponse = await detailsController.updateCatalog({ vendorApiIntId, countryCode });
			await new LogSys().log(`catalogResponse  : ${catalogResponse}`, false, null, null);

			res.send(catalogResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'get-catalog-error',
				},
				null,
				null
			);

			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.post('/cardbalance', loggerMiddleware, async (req, res) => {
		try {
			const { cardNumber, pin } = req.body;

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};
			const detailsController = new CoreController(services, accountabilitySchema);

			const cardbalanceResponse = await detailsController.getQCBalance(cardNumber, pin);
			res.send(cardbalanceResponse);
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'cardbalance-error',
				},
				null,
				null
			);

			res.send({
				success: false,
				error,
				exception: true,
			});
		}
	});

	router.post('/card-balace-report', loggerMiddleware, async (req, res) => {
		try {
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const { start_date, end_date, limit } = req.body;
			const detailsController = new CoreController(services, accountabilitySchema);
			const { success, inventoryList, error } = await detailsController.inventoryReport(start_date, end_date, limit);
			await new LogSys().log(`success  : ${success}`, false, null, null);

			res.send({
				success: success,
				inventoryList: inventoryList,
			});
		} catch (error) {

			res.send({
				success: false,
				error,
				exception: true,
			});

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'card-balace-report-error',
				},
				null,
				null
			);

		}
	});

	router.post('/revalidate-card-balace', loggerMiddleware, async (req, res) => {
		try {
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const { start_date, end_date } = req.body;

			const detailsController = new CoreController(services, accountabilitySchema);

			const { success, inventoryList, error } = await detailsController.revalidateInventoryReport(start_date, end_date);
			await new LogSys().log(`success  : ${success}`, false, null, null);

			res.send({
				success: success,
				inventoryList: inventoryList,
			});
		} catch (error) {
			await new LogSys().jsonError(
				{
					exception: error,
					error: 'card-balace-report-error',
				},
				null,
				null
			);
			res.send({
				success: false,
				error,
				exception: true,
			});

		}
	});

	router.post('/redeemvoucher', authMiddleware, async (req, res) => {
		try {
			const { id, sku, token } = req.body;
			await new LogSys().log(`start redeem voucher! LinkId ${id} sku: ${id}`, false, id, null);

		
			if (!id || !sku || !token) {
				await new LogSys().log(`Missing required fields: id, sku, token`, false, id, null);

				return res.status(400).send({
					success: false,
					message: 'Missing required fields: id, sku, token'
				});
			}
			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			const campController = new campaignController(services, accountabilitySchema);



			const result = await campController.redeemVoucher(id, sku, token, env);

			res.send(result);
		} catch (err) {
			await new LogSys().jsonError(
				{
					exception: err,
					error: 'links-redeem',
				},
				null,
				null
			);

			res.status(500).send({
				success: false,
				message: 'Server Error',
				error: err
			});

		}
	});

	router.post('/linkredeemvoucher', authMiddleware, async (req, res) => {
		try {


			const { link_reference_id, reference_code_otp, token } = req.body;
			const soft_link_token = token;
			await new LogSys().log(`Softlink started: link_reference_id${link_reference_id},reference_code_otp: ${reference_code_otp} }`, false, link_reference_id, null);

			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			if (soft_link_token && link_reference_id && reference_code_otp) {

				const campController = new campaignController(services, accountabilitySchema);

				const vouchersResponse = await campController.getSoftLinkVouchers(link_reference_id,
					reference_code_otp,
					soft_link_token,
					env);

				res.send(vouchersResponse);
			} else {
				await new LogSys().log(`Please Enter Valid Input: link_reference_id${link_reference_id},reference_code_otp: ${reference_code_otp} }`, false, link_reference_id, null);

				res.send({
					success: false,
					message: 'Please Enter Valid Input!',
				});
			}
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'sotlink-redeem',
				},
				null,
				null
			);
			res.send({
				success: false,
				error,
				exception: true,
			});

		}
	});

	/* INTERNAL CRON API - VOUCHER RETRY */
	router.post('/retry-failed-vouchers', loggerMiddleware, async (req, res) => {
		try {
			await new LogSys().log(`Retry Voucher invoked`, false, null, null);

			if (!CRON_RUNNING) {
				CRON_RUNNING = true;

				const startTime = new Date().getTime();
				const accountabilitySchema = {
					accountability: req.accountability,
					schema: req.schema,
				};

				const campController = new campaignController(services, accountabilitySchema);

				const { response } = await campController.retryFailedVouchers();
				const endTime = new Date().getTime();
				CRON_RUNNING = false;
				res.send({
					response,
				});
			} else {
				res.send({
					CRON_RUNNING,
				});
			}
		} catch (err) {

			await new LogSys().jsonError(
				{
					exception: err,
					error: 'retry-failed-vouchers',
				},
				null,
				null
			);
			CRON_RUNNING = false;
			res.send({
				success: false,
				message: 'Server Error, Please try later.',
			});
		}
	});


	router.post('/voucher-activation-mail', async (req, res) => {
		try {


			const { vouchers } = req.body;


			const accountabilitySchema = {
				accountability: req.accountability,
				schema: req.schema,
			};

			if (vouchers.length > 0) {

				const campController = new campaignController(services, accountabilitySchema);

				const vouchersResponse = await campController.VoucherActivationMail(vouchers);

				res.send(vouchersResponse);
			} else {

				res.send({
					success: false,
					message: 'Please Enter Valid Input!',
				});
			}
		} catch (error) {

			await new LogSys().jsonError(
				{
					exception: error,
					error: 'sotlink-redeem',
				},
				null,
				null
			);
			res.send({
				success: false,
				error,
				exception: true,
			});

		}
	});
});

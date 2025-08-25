import { defineEndpoint } from '@directus/extensions-sdk';
import LogSys from "./helpers/logger";
import Controller from "./controllers";
import config from "./config.ts";

/**
 * Common APIs to be useful for all projects
 * - SMS API
 * - Captcha API
 * NOTE: Before changing the API End point, modify the config `config.auth[apiEndpoint]` as well, else access will be forbidden
 * */
export default defineEndpoint(async (router, { services, getSchema }) => {

	const accountabilitySchema = {
		accountability: { admin: true },
		schema: await getSchema() // function is provided in the extension context
	};

	const controller = new Controller(services, accountabilitySchema);
	const logSys = new LogSys();
	await logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

	const authMiddleware = async (req, res, next) => {
		try {
			if (!req.headers.authorization) {
				return res.status(403).json({ error: config.defaults.messages.no_cred });
			} else if (req.headers.authorization) {

				const apiEndpoint = req.path.split("/")[1];

				/* Getting Correct Token for the API hit */
				const correctAuthToken = config.auth[apiEndpoint];

				/* Proceed only if request Auth is equal to correct Auth */
				if (req.headers.authorization == correctAuthToken) {
					const newAccountabilitySchema = {
						accountability: { admin: true },
						schema: await getSchema()
					};

					controller.updateAccountabilitySchema(newAccountabilitySchema);
					await logSys.updateAccountabilitySchema(newAccountabilitySchema);

					next();
				} else {
					return res.status(403).json({ error: config.defaults.messages.acc_forbidden });
				}
			} else {
				return res.status(403).json({ error: config.defaults.messages.acc_forbidden });
			}
		} catch (e) {
			res.send({
				success: false,
				message: config.defaults.messages.server_err
			});
		}
	}

	/* NOTE: Before changing the API End point, modify the config `config.auth[apiEndpoint]` as well, else access will be forbidden */
	router.post('/send-otp', authMiddleware, async (req, res) => {
		try {
			const {
				mobile,
				otp,
				source,
				sender_id,
				order_id,
				params
			} = req.body;

			const { success, message } = await controller.sendOtp(mobile, otp, source, sender_id, params, order_id);

			res.send({
				success,
				message
			});
 		} catch (e) {
			await new LogSys().jsonError({
				exception: e + "",
				error: "send-otp-error"
			});
			res.send({
				success: false,
				message: config.defaults.messages.server_err
			});
		}
	});

	/* NOTE: Before changing the API End point, modify the config `config.auth[apiEndpoint]` as well, else access will be forbidden */
	router.post('/captcha-verify', authMiddleware, async (req, res) => {
		try {
			const {
				client_id
			} = req.body;

			const requestCaptchaResponse = req.query["response"];

			if (!client_id || !requestCaptchaResponse) {
				res.send({
					success: false,
					message: config.defaults.messages.inv_req
				});
				return;
			}

			const { success, message, response } = await controller.verifyCaptcha(client_id, requestCaptchaResponse);

			if (success) {
				res.send(response);
			} else {
				res.send({
					success: false,
					message: message
				});
			}
		} catch (e) {
			await new LogSys().jsonError({
				exception: e + "",
				error: "captcha-verify-error"
			});
			res.send({
				success: false,
				message: config.defaults.messages.server_err
			});
		}
	});

});

import { defineEndpoint } from '@directus/extensions-sdk';
import Controller from "./controllers";
import LogSys from "./helpers/logger";
import config from "./config";
import Busboy from 'busboy'

export default defineEndpoint(async (router, { services, getSchema, database }) => {

	const { ItemsService } = services;
	const accountabilitySchema = {
		accountability: { admin: true },
		schema: await getSchema() // function is provided in the extension context
	};

	const controller = new Controller(services, accountabilitySchema, database);
	const logSys = new LogSys();

	const authCheck = async (req, res, next) => {
		try {
			if (!req.headers.authorization) {
				return res.status(403).json({ error: 'No credentials sent!' });
			} else if (req.headers.authorization == config.auth.extension) {
				const newAccountabilitySchema = {
					accountability: { admin: true },
					schema: await getSchema()
				};

				const {
					user_id
				} = req.body;

				logSys.createLoggerInstance(services.ItemsService, accountabilitySchema, { user_id: user_id });
				controller.updateAccountabilitySchema(newAccountabilitySchema);
				logSys.updateAccountabilitySchema(newAccountabilitySchema);

				next();
			} else {
				return res.status(403).json({ error: 'Access Forbidden' });
			}
		} catch (e) {
			res.send({
				success: false,
				message: "Server Error, Please try later."
			})
		}
	}

	const authMiddleware = async (req, res, next) => {
		try {
			let apiKey = req.headers["sp-api-key"];
			let clientId = req.headers["sp-client-id"];

			if (!apiKey || !clientId) {
				return res.status(403).json({ error: 'Access Forbidden' });
			}

			const accountabilitySchema = {
				accountability: { admin: true },
				schema: await getSchema()
			};

			const controller = new Controller(services, accountabilitySchema);

			const { success, projectId, projectCode } = await controller.getProjectIdForClient(apiKey, clientId);
			if (success) {
				req.body["project_id"] = projectId;
				req.body["project_code"] = projectCode;

				const logSys = new LogSys();
				logSys.createLoggerInstance(services.ItemsService, accountabilitySchema, { "QR-Campaign": req.body["project_id"], "User ID": req.body["user_id"] });

				next();
			} else {
				res.status(403).json({ error: 'Access Forbidden' });
			}
		} catch (e) {
			res.status(403).json({ error: 'Access Forbidden' });
		}
	}

	router.post('/get-client', authCheck, async (req, res) => {
		try {
			const {
				project_id,
				campaign_id
			} = req.body;

			const { success, message, data } = await controller.getProjectCampDetails(project_id, campaign_id);

			res.send({
				success, message, data
			});
		} catch (err) {
			await logSys.error({ "get-client-error": err });
			res.send({
				success: false,
				message: "Server Error, Please try later."
			})
		}
	});

	router.post('/save-user-details', authMiddleware, async (req, res) => {
		try {

			const busboy = Busboy({ headers: req.headers });

			let { project_id, project_code, campaign_id, form_request_id } = req.body;

			/* File Upload */
			let filePromises = [];
			busboy.on('file', async (fieldName, fileStream, { filename, mimeType }) => {
				const data = {
					filename_download: filename,
					type: mimeType,
					storage: 'local',
				};
				filePromises.push(uploadFile(fieldName, fileStream, data));
			});

			async function uploadFile(fieldName, fileStream, data) {
				try {
					const newAccountabilitySchema = {
						accountability: { admin: true },
						schema: await getSchema(),
					};

					const { FilesService } = services;
					const upload_service = new FilesService(newAccountabilitySchema);
					const primaryKey = await upload_service.uploadOne(fileStream, data);
					return {
						title: fieldName,
						id: primaryKey,
					};
				} catch (error) {
					throw error;
				}
			}

			let input_fields = {};
			busboy.on('field', (fieldname, val) => {
				console.log(`Field [${fieldname}]: value: ${val}`);
				if (fieldname == 'campaign_id') {
					campaign_id = val;
				} else if (fieldname == 'request_id') {
					form_request_id = val;
				} else {
					input_fields[fieldname] = val;
				}
			});

			busboy.on('finish', async () => {
				try {
					const primaryKeys = await Promise.all(filePromises);

					if (!campaign_id) {
						return res.send({
							success: false,
							message: "Invalid Campaign",
						});
					}

					// Validate Mandatory Fields
					let name_valid = false;
					let email_valid = false;
					let mobile_valid = false;

					for (let field in input_fields) {
						if (input_fields.hasOwnProperty(field)) {
							let value = input_fields[field];
							if (field == "Name") {
								name_valid = true;
							} else if (field == "Mobile") {
								const regex = /^(?:\+?(\d{1,3}))?[-.\s]?(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})$/;
								if (regex.test(value)) {
									mobile_valid = true;
								}
							} else if (field == "Email") {
								// Validate Email
								if (validateEmail(value)) {
									email_valid = true;
								}
							}
						}
					}

					if (!name_valid || !email_valid || !mobile_valid) {
						return res.send({
							success: false,
							message: "User information is missing. Please fill the values",
						});
					}

					const { success, message, data } = await controller.saveUserMainFormDetails(project_id, project_code, campaign_id, input_fields, primaryKeys, form_request_id);

					res.send({
						success, message, data
					});
				} catch (error) {
					console.error("Error processing files:", error);
					res.writeHead(500, { 'Connection': 'close' });
					res.end('Error processing files!');
				}
			});

			busboy.on('error', (error) => {
				console.error("Busboy error:", error);
				res.writeHead(500, { 'Connection': 'close' });
				res.end('Error processing request!');
			});

			req.pipe(busboy);

			function validateEmail(email) {
				const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				return regex.test(email);
			}
		} catch (e) {
			await logSys.error({ "send-otp-error": e });
			res.send({
				"success": false,
				"message": "Something went wrong on the server. Please try again later!"
			});
		}
	});

	router.post('/resend-otp', authMiddleware, async (req, res) => {
		try {
			let {
				user_id,
				campaign_id,
				project_code
			} = req.body;

			if (!user_id) {
				res.send({
					"success": false,
					"message": "Invalid User ID"
				});
			}

			const { success, message, data } = await controller.resendOTP(user_id, campaign_id, project_code);

			res.send({
				success, message, data
			});
		} catch (e) {
			await logSys.error({ "send-otp-error": e });
		}
	});

	router.post('/verify-otp', authMiddleware, async (req, res) => {
		try {
			let {
				user_id,
				campaign_id,
				project_code,
				otp,
				request_id
			} = req.body;

			if (!user_id) {
				res.send({
					"success": false,
					"message": "Invalid User ID"
				});
			}

			if (!otp || isNaN(otp) || otp.length > 4) {
				res.send({
					"success": false,
					"message": "Invalid OTP"
				});
			}

			const { success, message, data } = await controller.verifyOTP(user_id, campaign_id, project_code, otp, request_id);

			res.send({
				success, message, data
			});
		} catch (e) {
			await logSys.error({ "send-otp-error": e });
		}
	});

	router.post('/save-wizard-details', authMiddleware, async (req, res) => {
		try {

			const busboy = Busboy({ headers: req.headers });

			let { project_id, project_code, campaign_id, user_id, form_request_id } = req.body;

			/* File Upload */
			let filePromises = [];
			busboy.on('file', async (fieldName, fileStream, { filename, mimeType }) => {
				const data = {
					filename_download: filename,
					type: mimeType,
					storage: 'local',
				};
				filePromises.push(uploadFile(fieldName, fileStream, data));
			});

			async function uploadFile(fieldName, fileStream, data) {
				try {
					const newAccountabilitySchema = {
						accountability: { admin: true },
						schema: await getSchema(),
					};

					const { FilesService } = services;
					const upload_service = new FilesService(newAccountabilitySchema);
					const primaryKey = await upload_service.uploadOne(fileStream, data);
					return {
						title: fieldName,
						id: primaryKey,
					};
				} catch (error) {
					throw error;
				}
			}

			let input_fields = {};
			busboy.on('field', (fieldname, val) => {
				console.log(`Field [${fieldname}]: value: ${val}`);
				if (fieldname == 'campaign_id') {
					campaign_id = val;
				} else if (fieldname == 'user_id') {
					user_id = val;
				} else if (fieldname == 'request_id') {
					form_request_id = val;
				} else {
					input_fields[fieldname] = val;
				}
			});

			busboy.on('finish', async () => {
				try {
					const primaryKeys = await Promise.all(filePromises);

					if (!campaign_id) {
						return res.send({
							success: false,
							message: "Invalid Campaign",
						});
					}

					const { success, message, data } = await controller.saveUserWizardFormDetails(project_id, project_code, campaign_id, user_id, input_fields, primaryKeys, form_request_id);

					res.send({
						success, message, data
					});
				} catch (error) {
					console.error("Error processing files:", error);
					res.writeHead(500, { 'Connection': 'close' });
					res.end('Error processing files!');
				}
			});

			busboy.on('error', (error) => {
				console.error("Busboy error:", error);
				res.writeHead(500, { 'Connection': 'close' });
				res.end('Error processing request!');
			});

			req.pipe(busboy);
		} catch (e) {
			await logSys.error({ "wizard-form-error": e });

			res.send({
				"success": false,
				"message": "Something went wrong on the server. Please try again later!!"
			});
		}
	});
});

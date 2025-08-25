import { defineEndpoint } from '@directus/extensions-sdk';
import Controller from "./controllers";
import LogSys from "./helpers/logger";
import config from "./config.json";

const fs = require("fs");

export default defineEndpoint((router, { services, getSchema }) => {

	const authMiddleware = async (req, res, next) => {
		try {
			const apiKey = req.headers["sp-api-key"];
			const clientId = req.headers["sp-client-id"];

			if (!apiKey || !clientId) {
				return res.status(403).json({ error: 'Access Forbidden' });
			}

			const accountabilitySchema = {
				accountability: { admin: true },
				schema: await getSchema()
			};

			const controller = new Controller(services, accountabilitySchema);

			const { success, projectId } = await controller.getProjectIdForClient(apiKey, clientId);

			if (success) {
				req.body["project_id"] = projectId;

                const logSys = new LogSys();
                logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

				next();
			} else {
				res.status(403).json({ error: 'Access Forbidden' });
			}
		} catch (e) {
			res.status(403).json({ error: 'Access Forbidden' });
		}
	}

	router.post('/check-offers', authMiddleware, async (req, res) => {
		try {
			let {
				project_id,
				campaign_id,
				product_id
			} = req.body;

			if (!campaign_id) campaign_id = config.defaults.campaign_id;
			if (!product_id) product_id = config.defaults.product_id;

			const accountabilitySchema = {
				accountability: { admin: true },
				schema: await getSchema()
			};

			const controller = new Controller(services, accountabilitySchema);

			const logSys = new LogSys();
			logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

			const { success, error } = await controller.checkOfferExists(campaign_id, product_id, project_id);

			if (success) {
				res.send({
					success: true,
					message: "Product Offer Mappings Exist",
					error
				});
			} else {
				res.send({
					success: false,
					message: "Product Offer Mappings Donot exist",
					error
				});
			}
		} catch (err) {
			res.send({
				success: false,
				message: "Error Occured",
				error: err
			});
		}
	});

    router.post('/get-user-from-email-phn', authMiddleware, async (req, res) => {
        try {
            const {
                email_id,
                phone_number,
                project_id
            } = req.body;

            await new LogSys().log({ email_id, phone_number, project_id });

            const accountabilitySchema = {
                accountability: { admin: true },
                schema: await getSchema()
            };

            const controller = new Controller(services, accountabilitySchema);
            const { success, error, response } = await controller.getUserforEmailAndPassword(email_id, phone_number, project_id);

            await new LogSys().log({ success, error, response });

            if (success) {
                res.send({
                    success: success,
                    message: "Fetched User Id",
                    error: null,
                    response: response
                });
            } else {
                res.send({
                    success: success,
                    message: "Error Occured",
                    error: error,
                    response: null
                });
            }
        } catch (err) {
            res.send({
                success: false,
                message: "Error Occured",
                error: err,
                response: null
            });
        }
    });

	router.post('/generate-card', authMiddleware, async (req, res) => {
		try {
			let {
				user_id,
				project_id,
                campaign_id,
				product_id,
                unredeemed
			} = req.body;

			/* Storing Headers so that the Prepared HTML Fetch will have the same Auth Token
			* - Obsolete (Auth Middle ware taking care from apikey and client id)
			* */
			const authorizationHeader = req.headers.authorization;

            if (!campaign_id) campaign_id = config.defaults.campaign_id;
            if (!product_id) product_id = config.defaults.product_id;

			const accountabilitySchema = {
				accountability: { admin: true },
				schema: await getSchema()
			};

			const controller = new Controller(services, accountabilitySchema);

            const logSys = new LogSys();
            logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

			const { success, offer, error } = await controller.getOfferForUserIdAndCampaignId(user_id, campaign_id, product_id, project_id, unredeemed);

			if (success) {
				const { err, html } = await controller.prepareScratchCardHtmlForProject(project_id, offer, authorizationHeader);
				if (err) {
					res.send({
						success: false,
						message: "Please contact ShakePe support at: <a href='mailto:support@shakepe.com'><u>support@shakepe.com</u></a>",
						error: err,
						response: null
					});
				} else {
					res.send({
						success: true,
						message: "Offer Sent",
						response: {
							offer: offer,
							html: html
						}
					});
				}
			} else {
				res.send({
					success: success,
					message: "Please contact ShakePe support at: <a href='mailto:support@shakepe.com'><u>support@shakepe.com</u></a>",
					error: error,
					response: null
				});
			}
		} catch (err) {
			res.send({
				success: false,
				message: "Please contact ShakePe support at: <a href='mailto:support@shakepe.com'><u>support@shakepe.com</u></a>",
				error: err,
				response: null
			});
		}
	});

	router.post('/update-card-status', authMiddleware, async (req, res) => {
		try {
			let {
				card_id,
				status,
				project_id
			} = req.body;

			const accountabilitySchema = {
				accountability: { admin: true },
				schema: await getSchema()
			};

			const controller = new Controller(services, accountabilitySchema);

			const logSys = new LogSys();
			logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

			const { success, response } = await controller.updateCardStatus(card_id, status, project_id);

			res.send({
				success: success,
				message: "Successfully Updated Status"
			});
		} catch (err) {
			res.send({
				success: false,
				message: "Error Occured",
				error: err,
				response: null
			});
		}
	});

    /* AceMoney - App */
    const getActionsProductsForCampaign = async (req, res) => {
        try {
            let {
                project_id,
                campaign_id
            } = req.body;

            const accountabilitySchema = {
                accountability: { admin: true },
                schema: await getSchema()
            };

            const controller = new Controller(services, accountabilitySchema);

            const logSys = new LogSys();
            logSys.createLoggerInstance(services.ItemsService, accountabilitySchema);

            const { success, response } = await controller.getActions(campaign_id, project_id);

            res.send({
                success: success,
                message: "Actions Fetched",
                response: response
            });
        } catch (err) {
            res.send({
                success: false,
                message: "Please contact ShakePe support at: support@shakepe.com",
                error: err,
                response: null
            });
        }
    };
    router.post('/get-actions-for-campaign', authMiddleware, getActionsProductsForCampaign);
    router.post('/get-products-for-campaign', authMiddleware, getActionsProductsForCampaign);
});

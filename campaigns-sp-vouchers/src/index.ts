import { defineEndpoint } from '@directus/extensions-sdk';
import {
	BaseException,
} from "./exceptions";

export default defineEndpoint(async (router, { services }) => {

	router.post("/verify-link", async (req, res) => {
		const accountability = req.accountability;
		const payload = req.body;
		const { ItemsService } = services;
		try {
			if (!payload.code) {
				// throw new InvalidPayloadException(`"code" is required`);
				res.send({
					success: false,
					message: "code is required",
					error: "code is required"
				});
			} else {
				const vouchersService = new ItemsService("sp_voucher_details", {
					accountability: accountability,
					schema: req.schema,
				});

				const voucherDetails = await vouchersService.readByQuery({
					fields: ["id"],
					filter: { code: payload.code },
				});
				if (
					!voucherDetails ||
					voucherDetails.length <= 0 ||
					voucherDetails.length > 1
				) {
					// throw new InvalidPayloadException(`Invalid Code`);
					res.send({
						success: false,
						message: "Invalid Code",
						error: "Invalid Code"
					});
				} else {
					res.send({ id: voucherDetails[0].id });
				}
			}
		} catch (err) {
			if (err instanceof BaseException) {
				res.status(err.status);
				res.send({
					success: false,
					message: err.message,
					extensions: {
						code: err.code,
						...err.extensions,
					},
				});
			} else if (err.status == 403) {
				res.status(403);
				res.send({
					success: false,
					message: "You don't have permission to access this",
					code: "ForbiddenException",
					...err.extensions,
				});
			} else {
				res.status(500);
				res.send({
					success: false,
					message: "Unknown Error Occurred",
					code: "INTERNAL_SERVER_ERROR",
					...err.extensions,
				});
			}
		}
	});

	router.post("/verify-pin", async (req, res) => {
		const accountability = req.accountability;
		const payload = req.body;
		const { ItemsService } = services;
		try {
			if (!payload.pin || !payload.id) {
				// throw new InvalidPayloadException(`"pin/id" is required`);
				res.send({
					success: false,
					message: "pin/id required",
					error: "pin/id required"
				});
			} else {
				const vouchersService = new ItemsService("sp_voucher_details", {
					accountability,
					schema: req.schema,
				});
				const voucherDetails = await vouchersService.readOne(payload.id, {
					fields: ["*", "brand.*"],
				});

				if (!voucherDetails) {
					res.send({
						success: false,
						message: "Invalid ID",
						error: "Invalid ID"
					});
				} else {
					if (payload.pin !== voucherDetails.pin) {
						res.send({
							success: false,
							message: "Invalid PIN",
							error: "Invalid PIN"
						});
					} else {
						const {
							code,
							voucher_code,
							voucher_pin,
							pin,
							expiry_date,
							value,
							brand,
						} = voucherDetails;

						res.send({
							code,
							voucher_code,
							voucher_pin,
							pin,
							expiry_date,
							value,
							brand
						});
					}
				}
			}
		} catch (err) {
			if (err instanceof BaseException) {
				res.status(err.status);
				res.send({
					success: false,
					message: err.message,
					extensions: {
						code: err.code,
						...err.extensions,
					},
				});
			} else if (err.status == 403) {
				res.status(403);
				res.send({
					success: false,
					message: "You don't have permission to access this",
					code: "ForbiddenException",
					...err.extensions,
				});
			} else {
				res.status(500);
				res.send({
					success: false,
					message: "Unknown Error Occurred",
					code: "INTERNAL_SERVER_ERROR",
					...err.extensions,
				});
			}
		}
	});
});

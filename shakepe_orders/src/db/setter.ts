import nodemailer from 'nodemailer';
import { env } from 'process';

export const email = async (req: any, res: any, next: any, services: any) => {
	try {
		const { to, bcc, cc, subject, attachments, html } = req.body;

		let auth: boolean | { user?: string; pass?: string } = false;
		auth = {
			user: env.EMAIL_FROM,
			pass: env.EMAIL_SMTP_PASSWORD,
		};
		const modifyAttachement = attachments?.map((mailContent: any) => {
			return {
				...mailContent,
				path: env.CURRENT_URL,
			};
		});

		const transporter = nodemailer.createTransport({
			host: env.EMAIL_SMTP_HOST,
			port: env.EMAIL_SMTP_PORT,
			auth,
		} as Record<string, unknown>);
		transporter.sendMail({
			from: env.EMAIL_FROM,
			to: to,
			cc: cc,
			bcc: bcc,
			subject: subject,
			html: html,
			attachments: modifyAttachement,
		});
		res.status(200).json({ email: 'Email as been  Successfully send' });
	} catch (error) {}
};

export const createOne = async (services: any, collection: any, data: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		await createOneService.createOne(data, { emitEvents: false });
	} catch (error) {
		return error;
	}
};

export const updateOne = async (
	payload: any,
	collection: any,
	services: any,
	primary: any,
	schema: any,
	accountability: any
) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		await createOneService.updateOne(primary, payload, { emitEvents: false });
	} catch (error) {
		return error;
	}
};

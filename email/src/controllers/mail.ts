import path from 'path';
import { assetServices, getDataFromCollection } from '../db/getter';
import { env } from 'process';
import { Liquid } from 'liquidjs';
import { Readable } from 'stream';
import { createOne, notificationsServices } from '../db/setter';

export const gettingOfEmailContent = async (req: any, res: any, next: any, services: any, schema: any) => {
	try {
		const email = await getDataFromCollection(
			services,
			{
				id: req.params.id,
			},
			['*', 'attachments.directus_files_id.*'],
			schema,
			'email'
		);
		const liquidEngine = new Liquid({
			root: [path.resolve(env.EXTENSIONS_PATH, 'templates'), path.resolve(__dirname, 'templates')],
			extname: '.liquid',
		});
		const subject = await liquidEngine.parseAndRender(email[0].subject, req.body.subject_data);
		const body = await liquidEngine.parseAndRender(email[0].liquid_template, req.body.body_data);
		const emailCC = email[0].cc?.length > 0 ? email[0].cc : [];
		const emailBCC = email[0].bcc?.length > 0 ? email[0].bcc : [];
		const emailTO = email[0].to?.length > 0 ? email[0].to : [];
		const cc = Array.from(new Set(req?.body?.cc?.length > 0 ? [...emailCC, ...req.body.cc] : emailCC));
		const bcc = Array.from(new Set(req?.body?.bcc?.length > 0 ? [...emailBCC, ...req.body.bcc] : emailBCC));
		const to = Array.from(new Set(req?.body?.to?.length > 0 ? [...emailTO, ...req.body.to] : emailTO));

		const email_attachments =
			email[0].attachments.length > 0
				? (
						await Promise.allSettled(
							email[0].attachments.map(async (files: any) => {
								return {
									content: await assetServices(files.directus_files_id.id, services, schema),
									filename: files.directus_files_id.filename_download,
								};
							})
						)
				  ).map((data) => data.value)
				: [];
		const bodyAttachments: any =
			req?.body?.attachments?.length > 0
				? (
						await Promise.allSettled(
							req?.body?.attachments.map(async (files: any) => {
								if (files.id) {
									return {
										content: await assetServices(files.id, services, schema),
										filename: files.filename,
									};
								} else {
									return {
										content: base64ToStream(files.content),
										filename: files.filename,
									};
								}
							})
						)
				  ).map((data) => data.value)
				: [];
		const attachments = [...email_attachments, ...bodyAttachments];
		req.email = {
			body: body,
			subject: subject,
			cc: cc,
			bcc: bcc,
			to: to,
			from: email[0].from,
			attachments: attachments,
		};
		next();
	} catch (error) {
		res.status(404).send({ message: 'Something Went Worng', error: error });
	}
};

export const mail = async (req: any, res: any, mailService: any, schema: any, accountability: any, services: any) => {
	try {
		const { to, cc, bcc, subject, body, data, attachments, from } = req.email;
		const response = await mailService.send({
			from: from,
			to: to,
			cc: cc ?? [],
			bcc: bcc ?? [],
			subject: subject,
			html: body,
			attachments: attachments ? attachments : null,
		});

		createOne(
			services,
			'email_logs',
			{
				email_log: {
					...response,
					raw: response?.raw?.toString(),
				},
				payload: {
					...req.email,
					attachments: null,
				},
				status: 'Delivered',
				email_details: req.params.id,
			},
			schema,
			accountability
		);
		res.status(200).send({ message: 'Email is Send Successfully' });
	} catch (error: any) {
		createOne(
			services,
			'email_logs',
			{
				email_log: {
					...error,
					payload: {
						...req.email,
						attachments: null,
					},
				},
				status: 'Rejected',
				email_details: req.params.id,
			},
			schema,
			accountability
		);
		res.status(404).send({ message: 'Something Went Worng', error: error });
	}
};

function base64ToStream(base64: any) {
	const buffer = Buffer.from(base64, 'base64');
	const readableStream = new Readable({
		read() {
			this.push(buffer);
			this.push(null); // Signal the end of the stream
		},
	});
	return readableStream;
}

export const gettingNotification = async (req: any, res: any, next: any, services: any, schema: any) => {
	try {
		const data = req.body;
		const notification = await getDataFromCollection(
			services,
			{
				id: {
					_eq: req.params.id,
				},
			},
			['*', 'users.directus_users_id'],
			schema,
			'notification'
		);
		if (notification?.length) {
			const notificationName =
				notification[0].users?.length > 0 ? notification[0].users.map((user: any) => user.directus_users_id) : [];
			const users = Array.from(
				new Set(data?.users?.length > 0 ? [...notificationName, ...data.users] : notification[0].users)
			);

			const liquidEngine = new Liquid({
				root: [path.resolve(env.EXTENSIONS_PATH, 'templates'), path.resolve(__dirname, 'templates')],
				extname: '.liquid',
			});

			const subject = await liquidEngine.parseAndRender(notification[0].subject, data.subject_data);

			const message = notification[0].message
				? await liquidEngine.parseAndRender(notification[0].message, data.message)
				: null;

			const collection = data.collection
				? data.collection
				: notification[0].collection
				? notification[0].collection
				: null;
			const item = data.item ? data.item : null;

			const sender = data.sender ? data.sender : null;
			await notificationsServices(services, schema, users, subject, message, collection, item, sender);
			res.status(201).send({ message: 'Notification is Send to Users', users: users });
		} else {
			throw {
				error: 'Notifications is not there',
			};
		}
	} catch (error) {
		res.status(404).send({ message: 'Something Went Worng', error: error });
	}
};

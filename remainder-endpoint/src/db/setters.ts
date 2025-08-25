import constant from '../constant.json';
import { env } from 'process'
export const logGenerator = async (
	error: any,
	log_type: any,
	collection: any,
	schema: any,
	accountability: any,
	services: any
) => {
	try {
		await createOne(
			services,
			collection,
			{
				error: JSON.stringify(error),
				log_type: log_type,
			},
			schema,
			accountability
		);
	} catch (error) {}
};

export const createOne = async (services: any, collection: any, data: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});

		await createOneService.createOne(data);
	} catch (error) {}
};
export const mail = async (payload: any, mailService: any, schema: any, accountability: any, services: any) => {
	try {
		const { to, cc, bcc, subject, liquidTemplate, data, attachments } = payload;
		const response = await mailService.send({
			from: env.EMAIL_FROM,
			to: to,
			cc: cc ?? [],
			bcc: bcc ?? [],
			subject: subject,
			template: {
				name: liquidTemplate,
				data: data,
			},
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
					...payload,
					attachments: null,
				},
				status: constant.status.Delivered,
			},
			schema,
			accountability
		);
		return true;
	} catch (error: any) {
		createOne(
			services,
			'email_logs',
			{
				email_log: {
					...error,
					payload: {
						...payload,
						attachments: null,
					},
				},
				status: constant.status.Rejected,
			},
			schema,
			accountability
		);
		return false;
	}
};

export const updateBatch = async (payload: any, collection: any, services: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const updateBatchService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		await updateBatchService.updateBatch(payload);
		return true;
	} catch (error) {}
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
		await createOneService.updateOne(primary, payload);
	} catch (error) {}
};

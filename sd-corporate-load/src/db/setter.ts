import { env } from 'process';
import constant from '../constant.json';
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
				status: constant.STATUS.DELIVERED,
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
				status: constant.STATUS.REJECTED,
			},
			schema,
			accountability
		);
		return false;
	}
};

export const logError = async (error: any, collection: any, schema: any, accountability: any, services: any) => {
	try {
		const error_log: any = {};

		error_log.error = String(error);
		await createOne(services, collection, JSON.stringify(error_log), schema, accountability);
	} catch (error) {}
};

export const createOne = async (services: any, collection: any, data: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		return await createOneService.createOne(data);
	} catch (error) {
	}
};

export const createOneNoEmit = async (services: any, collection: any, data: any, schema: any, accountability?: any) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		const created = await createOneService.createOne(data, {
			emitEvents: false,
		});
		return created;
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
	} catch (error) {
		logError(
			{
				error: error,
				payload: payload,
				collection: collection,
			},
			'error_log_zeus',
			schema,
			accountability,
			services
		);
	}
};

export const updateOneNoEmit = async (
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

		await createOneService.updateOne(primary, payload, {
			emitEvents: false,
		});
	} catch (error) {
		logError(
			{
				error: error,
				payload: payload,
				collection: collection,
			},
			'error_log_zeus',
			schema,
			accountability,
			services
		);
	}
};

export const updateMany = async (
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
		await createOneService.updateMany(primary, payload);
	} catch (error) {
		logError(
			{
				error: error,
				payload: payload,
				collection: collection,
			},
			'error_log_zeus',
			schema,
			accountability,
			services
		);
	}
};

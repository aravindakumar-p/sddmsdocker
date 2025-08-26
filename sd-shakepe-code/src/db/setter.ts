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
	const { ItemsService } = services;
	const createOneService = new ItemsService(collection, {
		schema: schema,
		accountability: accountability ?? { admin: true },
	});
	await createOneService.createOne(data, { emitEvents: false });
};

export const updateOne = async (
	payload: any,
	collection: any,
	services: any,
	primary: any,
	schema: any,
	accountability: any
) => {
	const { ItemsService } = services;
	const createOneService = new ItemsService(collection, {
		schema: schema,
		accountability: accountability ?? { admin: true },
	});
	await createOneService.updateOne(primary, payload);
};

export const updateOneNoEmit = async (
	payload: any,
	collection: any,
	services: any,
	primary: any,
	schema: any,
	accountability: any
) => {
	const { ItemsService } = services;
	const createOneService = new ItemsService(collection, {
		schema: schema,
		accountability: accountability ?? { admin: true },
	});
	return await createOneService.updateOne(primary, payload, { emitEvents: false });
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
		return true;
	} catch (error) {}
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

export const createMany = async (payload: any, collection: any, services: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const createOneService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		await createOneService.createMany(payload);
	} catch (error) {}
};

export const deleteMany = async (ids: any, collection: any, services: any, schema: any, accountability: any) => {
	try {
		const { ItemsService } = services;
		const deleteManyService = new ItemsService(collection, {
			schema: schema,
			accountability: accountability ?? { admin: true },
		});
		await deleteManyService.deleteMany(ids);
	} catch (error) {}
};

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

export const getDataFromCollection = async (services: any, filter: any, fields: any, req: any, collection: any) => {
	try {
		const { ItemsService } = services;
		const collectionData = new ItemsService(collection, { schema: req, accountability: { admin: true } });
		const itemsData = await collectionData.readByQuery({ filter: filter, fields: fields });
		return itemsData;
	} catch (error) {
		return error;
	}
};
export const assetServices = async (key: any, services: any, schema: any) => {
	try {
		const { AssetsService } = services;

		const service = new AssetsService({
			accountability: {
				admin: true,
			},
			schema: schema,
		});
		const { stream } = await service.getAsset(key, {});

		return stream;
	} catch (error) {
		return {
			error: 'File is Not there',
		};
	}
};

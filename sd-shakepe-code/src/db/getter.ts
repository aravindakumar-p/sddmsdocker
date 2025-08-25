import { useApi } from '@directus/extensions-sdk';
export const getDataFromCollection = async (
	services: any,
	filter: any,
	fields: any,
	limit: any,
	schema: any,
	collection: any,
	sort?: any
) => {
	try {
		const { ItemsService } = services;
		const collectionData = new ItemsService(collection, { schema: schema, accountability: { admin: true } });
		const itemsData = await collectionData.readByQuery({
			filter: filter,
			fields: fields,
			sort: sort ?? [],
			limit: parseInt(limit),
		});
		return itemsData;
	} catch (error) {}
};

export const assetServices = async (key: any, services: any, schema: any, accountability: any) => {
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

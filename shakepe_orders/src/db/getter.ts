export const getDataFromCollection = async (services: any, filter: any, fields: any, req: any, collection: any) => {
	try {
		const { ItemsService } = services;
		const collectionData = new ItemsService(collection, { schema: req.schema, accountability: { admin: true } });
		const itemsData = await collectionData.readByQuery({ filter: filter, fields: fields });
		return itemsData;
	} catch (error) {
		return error;
	}
};

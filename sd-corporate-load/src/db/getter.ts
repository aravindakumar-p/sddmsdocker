export const getDataFromCollection = async (services: any, filter: any, fields: any, schema: any, collection: any) => {
	try {
		const { ItemsService } = services;
		const collectionData = new ItemsService(collection, { schema: schema, accountability: { admin: true } });
		const itemsData = await collectionData.readByQuery({ filter: filter, fields: fields  });
		return itemsData;
	} catch (error) {
	}
};

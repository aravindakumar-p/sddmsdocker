import config from '../config.json';
export const errorLoggingPost = async (services: any, body: any, req: any) => {
	const { ItemsService } = services;
	const getShakeOrder = new ItemsService(config.collections.error_log_zeus, {
		schema: req.schema,
		accountability: { admin: true },
	});
	return await getShakeOrder.createOne(body);
};

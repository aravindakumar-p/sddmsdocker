import config from "../config.ts";
import LogSys from "../helpers/logger";

/**
 * Setters Class
 * */
export default class Setters {
	ItemsService;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	addLog = async (collection_name, error) => {
		try {
			const logService = new this.ItemsService(config.collection.LOG_TABLE, this.accountabilitySchema);
			const response = await logService.createMany([ {
				collection_name,
				error
			} ]);
			return response;
		} catch (e) {
			return null;
		}
	}

	async insertSesLog(order_id, message_id, recipient, event_type, template, source, status) {
		try {
			const insertLogService = new this.ItemsService(config.collection.SES_LOGS_TABLE, this.accountabilitySchema);
			const response = await insertLogService.createOne({
				order_id, message_id, recipient, event_type, template, source, status
			});
			return response;
		} catch (e) {
			return null;
		}
	}
}

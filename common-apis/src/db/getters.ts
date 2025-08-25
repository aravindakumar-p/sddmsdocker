import config from "../config.ts";
import LogSys from "../helpers/logger";

/**
 * Getters Class
 * */
export default class Getters {
	ItemsService;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

}

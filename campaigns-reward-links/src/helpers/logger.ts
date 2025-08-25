import Setters from '../db/setters';
import config from '../config';

let logger = null;
/**
 * logs into a table of Directus
 * */
class Logger {
	get = null;
	accountabilitySchema = null;
	itemsService = null;
	prependJson = null;

	constructor(itemsService: any, accountabilitySchema: any, prependJson: any) {
		this.accountabilitySchema = accountabilitySchema;
		this.itemsService = itemsService;
		this.prependJson = prependJson;
	}

	log = async (json: any) => {
		const set = new Setters(this.itemsService, this.accountabilitySchema);
		await set.addLog({ info: { ...this.prependJson }, ...json });
	};

	updateAccountabilitySchema = (accountabilitySchema: any) => {
		this.accountabilitySchema = accountabilitySchema;
	};
}

export default class LogSys {
	createLoggerInstance = async (itemsService: any, accountabilitySchema: any, prependJson: any) => {
		logger = new Logger(itemsService, accountabilitySchema, prependJson);
	};

	updateAccountabilitySchema = (accountabilitySchema: any) => {
		try {
			logger.updateAccountabilitySchema(accountabilitySchema);
		} catch (e) {}
	};

	log = async (json: any) => {
		if (config.logging_system.save_normal_logs) {
			await logger.log({ log: json });
		}
	};

	error = async (json) => {
		if (config.logging_system.save_error_logs) {
			await logger.log({ log: json, error: true });
		}
	};
}

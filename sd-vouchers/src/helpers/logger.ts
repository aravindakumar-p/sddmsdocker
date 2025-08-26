import Setters from '../db/setters';
import { CONFIG } from '../config';

let logger:any = null;
/**
 * logs into a table of Directus
 * */
class Logger {
	get = null;
	accountabilitySchema = null;
	itemsService = null;
	prependText = '';

	constructor(itemsService, accountabilitySchema, prependText) {
		this.accountabilitySchema = accountabilitySchema;
		this.itemsService = itemsService;
		this.prependText = prependText;
	}

	log = async (collection_name:any, error:any, addPrepend:any, referenceId:any, vendor_code:any) => {
		if (addPrepend == null) addPrepend = true;
		const set = new Setters(this.itemsService, this.accountabilitySchema);;
		await set.addLog(
			collection_name,
			JSON.stringify({
				log: error,
				info: addPrepend ? this.prependText : null,
			}),
			referenceId,
			vendor_code
		);
	};

	updateAccountabilitySchema = (accountabilitySchema) => {
		this.accountabilitySchema = accountabilitySchema;
	};
}

export default class LogSys {
	createLoggerInstance = async (itemsService, accountabilitySchema, prependText) => {
		logger = new Logger(itemsService, accountabilitySchema, prependText);
	};

	updateAccountabilitySchema = (accountabilitySchema) => {
		try {
			logger.updateAccountabilitySchema(accountabilitySchema);
		} catch (e) {}
	};

	log = async (error:any, dontPrepend:any, referenceId:any,vendor_code:any) => {
		if (CONFIG.logging_system.save_normal_logs) {
			logger.log(null, error, dontPrepend, referenceId,vendor_code);
		}
	};

	error = async (error:any,referenceId:any,vendor_code:any) => {

		if (CONFIG.logging_system.save_error_logs) {
			logger.log(null, error,referenceId,vendor_code);
		}
	};

	jsonError = async (error:any,referenceId:any,vendor_code:any) => {

		if (CONFIG.logging_system.save_error_logs) {
			await logger.log(null, JSON.stringify(error),JSON.stringify(error.exception),referenceId,vendor_code);
		}
	};
}

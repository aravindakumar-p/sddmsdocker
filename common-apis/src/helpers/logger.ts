import Setters from "../db/setters";
import config from "../config.ts";

const { logging_system } = config;

let logger = null;
/**
 * logs into a table of Directus
 * */
class Logger {
    get = null;
    accountabilitySchema = null;
    itemsService = null;

    constructor(itemsService, accountabilitySchema) {
        this.accountabilitySchema = accountabilitySchema;
        this.itemsService = itemsService;
    }

    log = async (collection_name, error) => {
        const set = new Setters(itemsService, accountabilitySchema);
        await set.addLog(collection_name, JSON.stringify({
			error: error
		}));
    }

    updateAccountabilitySchema = (accountabilitySchema) => {
        this.accountabilitySchema = accountabilitySchema;
    }
}

export default class LogSys {
    createLoggerInstance = async (itemsService, accountabilitySchema) => {
        logger = new Logger(itemsService, accountabilitySchema);
    }

    updateAccountabilitySchema = (accountabilitySchema) => {
        try { logger.updateAccountabilitySchema(accountabilitySchema); } catch (e) { }
    }

    log = async (error) => {
        if (logging_system.save_normal_logs) {
            await logger.log(null, error)
        }
    }

    error = async (error) => {
        if (logging_system.save_error_logs) {
            await logger.log(null, error)
        }
    }

	jsonError = async (error) => {
        if (logging_system.save_error_logs) {
            await logger.log(null, JSON.stringify(error))
        }
    }
}

import Setters from "../db/setters";
import config from "../config";

let logger = null;
/**
 * logs into a table of Directus
 * */
class Logger {
    get = null;
    accountabilitySchema = null;
    itemsService = null;
	prependJson = null;

    constructor(itemsService, accountabilitySchema, prependJson) {
        this.accountabilitySchema = accountabilitySchema;
        this.itemsService = itemsService;
        this.prependJson = prependJson;
    }

    log = async (json) => {
        const set = new Setters(itemsService, accountabilitySchema);
        await set.addLog({ info: { ...prependJson }, ...json });
    }

    updateAccountabilitySchema = (accountabilitySchema) => {
        this.accountabilitySchema = accountabilitySchema;
    }
}

export default class LogSys {
    createLoggerInstance = async (itemsService, accountabilitySchema, prependJson) => {
        logger = new Logger(itemsService, accountabilitySchema, prependJson);
    }

    updateAccountabilitySchema = (accountabilitySchema) => {
        try { logger.updateAccountabilitySchema(accountabilitySchema); } catch (e) { }
    }

    log = async (json) => {
        if (config.logging_system.save_normal_logs) {
            await logger.log({ log: json })
        }
    }

    error = async (json) => {
        if (config.logging_system.save_error_logs) {
            await logger.log({ log: json, error: true })
        }
    }
}

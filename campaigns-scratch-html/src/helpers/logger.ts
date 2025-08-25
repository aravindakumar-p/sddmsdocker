import Setters from "../db/setters";
import { logging_system } from "../config.json";

let logger = null;
/**
 * logs into a table of Directus
 * */
class Logger {
    get = null;
    accountabilitySchema = null;
    itemsService = null;

    constructor(itemsService, accountabilitySchema ) {
        this.accountabilitySchema = accountabilitySchema;
        this.itemsService = itemsService;
    }

    log = async (json) => {
        const set = new Setters(itemsService, accountabilitySchema);
        await set.addLog(json);
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

    log = async (json) => {
        if (logging_system.save_normal_logs) {
            await logger.log({ log: json })
        }
    }

    error = async (json) => {
        if (logging_system.save_error_logs) {
            await logger.log({ log: json, error: true })
        }
    }
}
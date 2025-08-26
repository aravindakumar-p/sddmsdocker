import config from "../config.json";
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

    addLog = async (json) => {
        try {
            const logService = new this.ItemsService(config.collection.LOG_TABLE, this.accountabilitySchema);
            const response = await logService.createMany([ { log: json } ]);
            return response;
        } catch (e) {
            await new LogSys().error({ addLogError: e });
            return null;
        }
    }

    async updateUserOffer(userId, offer) {
        try {
            const usersService = new this.ItemsService(config.collection.USERS, this.accountabilitySchema);
            const response = await usersService.updateOne(userId, {
				offer: offer,
				offer_last_updated: new Date().getTime()
            });
            return response;
        } catch (e) {
			console.log({ updateUserOfferError: e })
            await new LogSys().error({ updateUserOfferError: e });
            return null;
        }
    }

	async createDispatchedOffer(offerId, campaignId, userId, project_id) {
		try {
			const dOffersService = new this.ItemsService(config.collection.DISPATCHED_OFFERS, this.accountabilitySchema);
			const response = await dOffersService.createOne({
				offers: offerId,
				campaign: campaignId,
				user: userId,
				project: project_id,
				offer_creation_time_stamp: new Date().getTime()
			});
			return response;
		} catch (e) {
			console.log({ createDispatchedOfferError: e })
			await new LogSys().error({ createDispatchedOfferError: e });
			return null;
		}
	}

	async updateDispatchedOfferStatus(card_id: any, status: any) {
		try {
			const usersService = new this.ItemsService(config.collection.DISPATCHED_OFFERS, this.accountabilitySchema);
			const response = await usersService.updateOne(card_id, {
				redemption_status: status
			});
			return response;
		} catch (e) {
			console.log({ updateDispatchedOfferStatusError: e })
			await new LogSys().error({ updateDispatchedOfferStatusError: e });
			return null;
		}
	}

	async createUserFromId(user_id: any, project_id: any, email_id, phone_number) {
		try {
			const usersService = new this.ItemsService(config.collection.USERS, this.accountabilitySchema);
			const response = await usersService.createOne({
				user_id: user_id,
				user_name: "",
				project: project_id,
                email_id: email_id,
                phone_number: phone_number
			});
			return response;
		} catch (e) {
			console.log(e);
			return null;
		}
	}

}

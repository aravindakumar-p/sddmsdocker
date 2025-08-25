import config from "../config.js";
import LogSys from "../helpers/logger.js";
import helper from "../helpers/common.js";

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
			const response = await logService.createMany([{ log: json }]);
			return response;
		} catch (e) {
			return null;
		}
	}

	async createUser(name: any, phone: any, email: any, project_id: any, campaign_id: any) {
		try {
			const { getRandomUniqueValue } = helper;
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const response = await usersService.createOne({
				project: project_id,
				campaign: campaign_id,
				name: name,
				email_id: email,
				phone_number: phone,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ ucreateUserError: e });
			return null;
		}
	}

	async createUserConversation(project_id: any, campaign_id: any, user_id: any, request_id: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USER_CONVERSATIONS, this.accountabilitySchema);
			const response = await usersService.createOne({
				user: user_id,
				campaign: campaign_id,
				project: project_id,
				request_id: request_id
			});
			return response;
		} catch (e) {
			await new LogSys().error({ ucreateUserError: e });
			return null;
		}
	}

	async createCampaignUserResponse(user_responses: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USER_CONVERSATION_DETAILS, this.accountabilitySchema);
			const response = await usersService.createMany(user_responses)
			return response;
		} catch (e) {
			await new LogSys().error({ ucreateUserError: e });
			return null;
		}
	}


	async createCampaignUser(user_id: any, campaign_id: any, project_id: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const response = await usersService.createOne({
				user_id: user_id,
				campaign_id: campaign_id,
				project: project_id,
			});
			return response;
		} catch (e) {
			await new LogSys().error({ ucreateUserError: e });
			return null;
		}
	}

	async updateUserOtp(user_id: any, otp: number) {
		try {
			const userService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const response = await userService.updateOne(user_id, {
				otp: otp
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateRetailerWalletError: e });
			return null;
		}
	}

	async updateUserOtpStatus(user_id: any) {
		try {
			const userService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const response = await userService.updateOne(user_id, {
				last_otp_verified: new Date().toISOString()
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateRetailerWalletError: e });
			return null;
		}
	}

	async updateCampaignUserResponse(id: any, form_data: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USER_RESPONSE, this.accountabilitySchema);
			const response = await usersService.updateOne(id, {
				user_response: form_data
			});
			return response;
		} catch (e) {
			await new LogSys().error({ ucreateUserError: e });
			return null;
		}
	}

	async saveRewardLink(linkObj) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS, this.accountabilitySchema);
			const response = await linkService.createOne(linkObj);
			return response;
		} catch (e) {
			console.log({ createLinkError: e })
			await new LogSys().error({ createLinkError: e });
			return null;
		}
	}

	async updateCurrentBalance(key: any, balance: number, type: any) {
		try {
			if (type == 1) {
				let userService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
				const response = await userService.updateOne(key, {
					wallet_balance: balance
				});
				return response;
			} else {
				let userService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
				const response = await userService.updateOne(key, {
					used_amount: balance
				});
				return response;
			}
		} catch (e) {
			await new LogSys().error({ updateRetailerWalletError: e });
			return null;
		}
	}


	async saveCampaignUserLedger(campaign_user_id: any, link: any, link_value: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const response = await usersService.updateOne(campaign_user_id, {
				link_value: link_value,
				reward_link: link,
				is_offer_redeemed: true
			});
			return response;
		} catch (e) {
			await new LogSys().error({ saveCampaignUserLedgerError: e });
			return null;
		}
	}

	async projectLedger(amount: any, project: any, type: any, campaign: any, user: any) {
		try {
			const usersService = new this.ItemsService(config.collection.PROJECTLEDGER, this.accountabilitySchema);
			const response = await usersService.createOne({
				amount: amount,
				project: project,
				campaign: campaign,
				user: user,
				ledger_type: type
			});
			return response;
		} catch (e) {
			await new LogSys().error({ projectLedgerError: e });
			return null;
		}
	}

	async updateOfferStatus(conversation_id: any) {
		try {
			const usersService = new this.ItemsService(config.collection.CAMPAIGN_USER_CONVERSATIONS, this.accountabilitySchema);
			const response = await usersService.updateOne(conversation_id, {
				is_offer_redeemed: true
			});
			return response;
		} catch (e) {
			await new LogSys().error({ updateOfferStatusError: e });
			return null;
		}
	}
}

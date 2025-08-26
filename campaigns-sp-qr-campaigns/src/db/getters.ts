import config from "../config.js";
import LogSys from "../helpers/logger.js";

/**
 * Getters Class
 * */
export default class Getters {
	ItemsService;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	async getProjectByCode(project_code: any) {
		try {
			const linkService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					project_code: { _eq: project_code }
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getProjectByCodeError: e })
		}
	}

	async getCampaign(campaign_id: any, project: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					"_and": [
						{ "id": { "_eq": campaign_id } },
						{ "project": { "_eq": project } }
					]
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getCampaignError: e })
		}
	}

	async getActiveCampaign(project_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					"_and": [
						{ "project": { "_eq": project_id } },
						{ "status": { "_eq": "active" } },
						{ "start_date": { "_lt": new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString() + "" } },
						{ "end_date": { "_gt": new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString() + "" } }
					]
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getActiveCampaignError: e })
		}
	}

	async getProjectFromApiKeyClientId(apiKey, clientId) {
		try {
			const projectsService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
			const projectsServiceResponse = await projectsService.readByQuery({
				fields: ["project_name", "project_code"],
				filter: {
					_and: [
						{
							api_key: {
								_eq: apiKey
							}
						},
						{
							client_id: {
								_eq: clientId
							}
						}
					]
				}
			});

			return projectsServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getProjectFromApiKeyClientIdError: e })
		}
	}

	async checkUserDetailsExist(phone, campaign_id) {
		try {
			const retailerDetailsService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const retailerDetailsResponse = await retailerDetailsService.readByQuery({
				filter: {
					_and: [
						{
							phone_number: {
								_eq: phone
							}
						},
						{
							campaign: {
								_eq: campaign_id
							}
						}
					]
				},
				fields: ["user_id", "phone_number", "email_id"]
			});
			return retailerDetailsResponse[0];
		} catch (e) {
			await new LogSys().error({ checkUserDetailsExistError: e });
		}
	}

	async getCampaignUserConversation(request_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['link_value'],
				filter: {
					campaign: { _eq: campaign_id }
				}
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getCampaignRedeemedCountError: e })
		}
	}


	async getCampaignUser(user_id, campaign_id) {
		try {
			const projectsService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const projectsServiceResponse = await projectsService.readByQuery({
				fields: ["is_offer_redeemed", "email_id", "phone_number", "name"],
				filter: {
					_and: [
						{
							user_id: {
								_eq: user_id
							}
						},
						{
							campaign: {
								_eq: campaign_id
							}
						}
					]
				}
			});

			return projectsServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getCampaignUserError: e })
		}
	}

	async getUser(user_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.USERS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					"_and": [
						{ "user_id": { "_eq": user_id } }
					]
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getUserError: e })
		}
	}

	async verifyUserOTP(user_id: any, campaign_id: any, otp: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				filter: {
					"_and": [
						{ "user_id": { "_eq": user_id } },
						{ "campaign": { "_eq": campaign_id } },
						{ "otp": { "_eq": otp } }
					]
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ verifyUserOTPError: e })
		}
	}

	async getCampaignRedeemedCount(campaign_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGN_USERS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['link_value'],
				filter: {
					campaign: { _eq: campaign_id }
				}
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ getCampaignRedeemedCountError: e })
		}
	}

	async getProjectCurrentBalance(project_code: any) {
		try {
			const linkService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ["wallet_balance"],
				filter: {
					project_code: { _eq: project_code }
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getProjectCurrentBalanceError: e })
		}
	}

	async getCampaignCurrentBalance(campaign_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ["max_amount", "used_amount"],
				filter: {
					id: { _eq: campaign_id }
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getCampaignCurrentBalanceError: e })
		}
	}

	async getRewardCampaign(campaign_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_CAMPAIGN, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ["id"],
				filter: {
					campaign_id: { _eq: campaign_id }
				}
			});
			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getRewardCampaignError: e })
		}
	}

	async checkRewardLink(link_id: any) {
		try {
			const linkService = new this.ItemsService(config.collection.REWARD_LINKS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['id'],
				filter: {
					id: { _eq: link_id }
				}
			});

			return linkResponse;
		} catch (e) {
			await new LogSys().error({ checkRewardLinkError: e })
		}
	}

	async getUserConversation(request_id, campaign_id, user_id) {
		try {
			const linkService = new this.ItemsService(config.collection.CAMPAIGN_USER_CONVERSATIONS, this.accountabilitySchema);
			const linkResponse = await linkService.readByQuery({
				fields: ['id', 'request_id'],
				filter: {
					_and: [
						{
							user: {
								_eq: user_id
							}
						},
						{
							campaign: {
								_eq: campaign_id
							}
						},
						{
							request_id: {
								_eq: request_id
							}
						}
					]
				}
			});

			return linkResponse[0];
		} catch (e) {
			await new LogSys().error({ getCampaignUserError: e })
		}
	}
}

/* eslint-disable prettier/prettier */
import helperController from '../helpers/helpers';
import config from '../config.json';
import { any } from 'async';
import lodash from 'lodash';

export default (router, { services, exceptions, env }) => {
	const { ItemsService } = services;
	const { ServiceUnavailableException, ForbiddenException, InvalidPayloadException } = exceptions;
	const helper = new helperController();

	router.post('/link', async (req: any, res: any, next: any) => {
		try {
			const rewardLinksService = new ItemsService(config.collection.REWARD_LINKS, {
				schema: req.schema,
				accountability: { admin: true },
			});
			const rewardCampaingsService = new ItemsService(config.collection.REWARD_CAMPAIGNS, {
				schema: req.schema,
				accountability: { admin: true },
			});
			let linkObj: any = [];
			const keys: any = req.body.body.keys;
			const rewardLinkList = await rewardLinksService.readByQuery({
				fields: ['id'],
				limit: -1,
			});

			const getRewardCampaignData = await rewardCampaingsService.readByQuery({
				filter: { id: { _in: keys } },
				fields: ['*', 'number_amount'],
			});


			for (let k = 0; k < getRewardCampaignData.length; k++) {
				if (
					getRewardCampaignData[k].link_generation_status == 'not_generated' && getRewardCampaignData[k].campaign_type != 'pdf'
				) {
					const numQtyOflinkToGenerate = getRewardCampaignData[k].number_amount;

					if (numQtyOflinkToGenerate.length != 0) {
						for (let i = 0; i < numQtyOflinkToGenerate.length; i++) {
							for (let j = 0; j < numQtyOflinkToGenerate[i].no_of_links; j++) {
								let tempObj: any = {};
								tempObj.otp = Math.floor(1000 + Math.random() * 9000);
								tempObj.reward_campaign = keys[k];
								tempObj.start_date = getRewardCampaignData[k].start_date;
								tempObj.end_date = getRewardCampaignData[k].end_date;
								tempObj.id = await helper.generateLink(config.defaults.REWARD_LINK_LENGTH, getRewardCampaignData[k].links_format_type);
								tempObj.value = numQtyOflinkToGenerate[i].value;
								tempObj.pending_value = numQtyOflinkToGenerate[i].value;

								linkObj.push(tempObj);
							}
						}

						const checkExistLinkList = rewardLinkList.filter((el: any) => {
							return linkObj.some((f: any) => {
								return f.id === el.id;
							});
						});

						let i = 0;
						if (checkExistLinkList.length != 0) {
							while (i < checkExistLinkList.length) {
								const getId = checkExistLinkList[i].id;
								const getlink = await helper.generateLink(config.defaults.REWARD_LINK_LENGTH, getRewardCampaignData[k].links_format_type);
								const checkExist = rewardLinkList.filter((ids: any) => ids.id == getlink);
								if (checkExist.length == 0) {
									linkObj.map((item: any) => {
										if (item.id == getId) {
											item.id = getlink;
										}
										return item;
									});
									i++;
								}
							}
						}

						await rewardLinksService.createMany(linkObj);

						linkObj = [];
						await rewardCampaingsService.updateOne(getRewardCampaignData[k].id, {
							link_generation_status: 'generated',
						});
					} else {
						throw new InvalidPayloadException('Please check payload');
					}
				} else {
					throw new InvalidPayloadException('Please check payload');
				}
			}

			res.json('reward link generated');
		} catch (error) {
			next(new ServiceUnavailableException(error));
			logError(error, req.schema);
		}
	});

	router.post("/diy-link", async (req: any, res: any, next: any) => {
		try {
			const rewardLinksService = new ItemsService(
				config.collection.REWARD_LINKS,
				{
					schema: req.schema,
					accountability: { admin: true },
				}
			);

			const rewardCampaingsService = new ItemsService(
				config.collection.REWARD_CAMPAIGNS,
				{
					schema: req.schema,
					accountability: { admin: true },
				}
			);

			let linkObj: any = [];
			const { rewardCampaignId, userData, value } = req.body;

			// Throw error when required data is not found in request body
			if (
				lodash.isEmpty(rewardCampaignId.toString()) ||
				lodash.isEmpty(userData) ||
				lodash.isEmpty(value.toString())
			) {
				throw new InvalidPayloadException(
					"Request contains missing or invalid payload"
				);
			}

			const rewardLinkList = await rewardLinksService.readByQuery({
				fields: ["id"],
				limit: -1,
			});

			const campaignData = await rewardCampaingsService.readOne(
				rewardCampaignId,
				{
					fields: [
						"id",
						"start_date",
						"end_date",
						"campaign_type",
						"link_generation_status",
					],
				}
			);

			// Throw error when links are already generated for requested campaign
			if (campaignData.link_generation_status === "generated") {
				throw new InvalidPayloadException("Reward links already generated");
			}

			if (campaignData.campaign_type === "user_linked") {
				for (let i = 0; i < userData.length; i++) {
					let tempObj: any = {};

					tempObj.id = await helper.generateLink(
						config.defaults.REWARD_LINK_LENGTH
					);
					tempObj.first_name = userData[i]?.first_name || null;
					tempObj.email = userData[i]?.email || null;
					tempObj.phone = userData[i]?.phone || null;
					tempObj.value = value;
					tempObj.pending_value = value;
					tempObj.start_date = campaignData.start_date;
					tempObj.end_date = campaignData.end_date;
					tempObj.otp = Math.floor(1000 + Math.random() * 9000);
					tempObj.reward_campaign = rewardCampaignId;

					linkObj.push(tempObj);
				}

				const checkExistLinkList = rewardLinkList.filter((el: any) => {
					return linkObj.some((f: any) => {
						return f.id === el.id;
					});
				});

				let i = 0;
				if (checkExistLinkList.length != 0) {
					while (i < checkExistLinkList.length) {
						const getId = checkExistLinkList[i].id;
						const getlink = await helper.generateLink(
							config.defaults.REWARD_LINK_LENGTH
						);
						const checkExist = rewardLinkList.filter(
							(ids: any) => ids.id == getlink
						);
						if (checkExist.length == 0) {
							linkObj.map((item: any) => {
								if (item.id == getId) {
									item.id = getlink;
								}
								return item;
							});
							i++;
						}
					}
				}

				await rewardLinksService.createMany(linkObj);
				linkObj = [];

				await rewardCampaingsService.updateOne(rewardCampaignId, {
					link_generation_status: "generated",
				});
			} else {
				// Throw error when reward links is requested to be created for campaign other than user_linked type
				throw new InvalidPayloadException("Invalid campaign type");
			}

			res.json("Reward link generated");
		} catch (error) {
			logError(error, req.schema);
			next(new ServiceUnavailableException(error));
		}
	});

	router.post('/pdf-link', async (req: any, res: any, next: any) => {
		try {
			const rewardLinksService = new ItemsService(config.collection.REWARD_LINKS, {
				schema: req.schema,
				accountability: { admin: true },
			});
			const userLinksService = new ItemsService(config.collection.USER_LINKS, {
				schema: req.schema,
				accountability: { admin: true },
			});

			const keys: any = req.body.keys;

			const rewardLinkList = await rewardLinksService.readByQuery({
				fields: ['id'],
				limit: -1,
			});

			const getUserData = await userLinksService.readByQuery({
				filter: { id: { _in: keys } },
				fields: ['*', 'reward_campaign.id', 'reward_campaign.start_date', 'reward_campaign.end_date', 'reward_campaign.link_generation_status', 'reward_campaign.campaign_type'],
			});

			for (let k = 0; k < getUserData.length; k++) {

				let linkObj: any = [];
				let linkIds: any = [];

				let user_data = getUserData[k];

				if (user_data.link_status == "not_generated" && user_data.reward_campaign && user_data.reward_campaign.end_date > new Date().toISOString() && user_data.reward_campaign.campaign_type == "pdf") {
					let coupon_qty = user_data.coupon_qty;
					let coupon_value = user_data.coupon_amount;

					let loops_count = 0;
					let fifty_loops_count = 0;
					let twenty_loops_count = 0;
					let remaining_value = 0;
					let loops = 0;
					if (coupon_qty > 100) {
						loops = Math.floor(coupon_qty / 50);
						remaining_value = coupon_qty % 50;

						loops_count += loops;
						fifty_loops_count += loops;
					} else if (coupon_qty >= 20) {
						loops = Math.floor(coupon_qty / 20);
						remaining_value = coupon_qty % 20;

						loops_count += loops;
						twenty_loops_count += loops;
					} else if (coupon_qty < 20) {
						loops_count++;
					}

					if (remaining_value > 0) {
						loops = Math.floor(remaining_value / 20);
						remaining_value = remaining_value % 20;

						loops_count += loops;
						twenty_loops_count += loops;

						if (remaining_value > 0) {
							loops_count++;
						}
					}

					let total_remaining_coupon_qty = coupon_qty;

					for (let j = 0; j < loops_count; j++) {
						let request_qty = 0;
						if (fifty_loops_count > 0) {
							request_qty = 50;
							total_remaining_coupon_qty = total_remaining_coupon_qty - 50;
							fifty_loops_count--;
						} else {
							if (twenty_loops_count > 0) {
								request_qty = 20;
								total_remaining_coupon_qty = total_remaining_coupon_qty - 20;
								twenty_loops_count--;
							} else {
								request_qty = total_remaining_coupon_qty;
								total_remaining_coupon_qty = 0;
							}
						}

						if (request_qty > 0) {
							let link_value = request_qty * coupon_value;

							let tempObj: any = {};
							tempObj.first_name = user_data.name;
							tempObj.reward_campaign = user_data.reward_campaign.id;
							tempObj.start_date = user_data.reward_campaign.start_date;
							tempObj.end_date = user_data.reward_campaign.end_date;
							tempObj.user_link = user_data.id;
							tempObj.id = await helper.generateLink(config.defaults.REWARD_LINK_LENGTH);

							tempObj.value = link_value;
							tempObj.pending_value = link_value;

							linkObj.push(tempObj);

							if (!linkIds.includes(user_data.id)) {
								linkIds.push(user_data.id);
							}
						}
					}

					const checkExistLinkList = rewardLinkList.filter((el: any) => {
						return linkObj.some((f: any) => {
							return f.id === el.id;
						});
					});

					let i = 0;
					if (checkExistLinkList.length != 0) {
						while (i < checkExistLinkList.length) {
							const getId = checkExistLinkList[i].id;
							const getlink = await helper.generateLink(config.defaults.REWARD_LINK_LENGTH);
							const checkExist = rewardLinkList.filter((ids: any) => ids.id == getlink);
							if (checkExist.length == 0) {
								linkObj.map((item: any) => {
									if (item.id == getId) {
										item.id = getlink;
									}
									return item;
								});
								i++;
							}
						}
					}

					await rewardLinksService.createMany(linkObj);
					linkIds.forEach(async function (link_id: any, index: any) {
						await userLinksService.updateOne(link_id, {
							link_status: 'generated',
						});
					})
				}
			}

			res.json('reward link generated');
		} catch (error) {
			next(new ServiceUnavailableException(error));
			logError(error, req.schema);
		}
	});

	async function logError(error, schema) {
		try {
			let error_log: any = {};
			const errorLogService = new ItemsService(config.collection.BACK_LOGS, {
				schema: schema,
				accountability: { admin: true },
			});

			error_log.log = error;
			await errorLogService.createOne({ log: error_log });
		} catch (error) { }
	}
};

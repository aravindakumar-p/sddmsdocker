import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }, { services, getSchema, exceptions }) => {
	const { ItemsService, UsersService } = services;
	const { ServiceUnavailableException } = exceptions;

	filter('sp_reward_campaigns.items.create', async (input: any, { collection }, { schema, accountability }) => {
		try {
			const spCampaignsService = new ItemsService('sp_reward_campaigns', {
				schema: schema,
				accountability: { admin: true },
			});
			const skuService = new ItemsService('sd_brand_sku_mapping', {
				schema: schema,
				accountability: { admin: true },
			});
			if (input.new_catalogue.length !== 0) {
				const skus = input.new_catalogue.create.map((item) => item.sd_brand_sku_mapping_id.id);
				input.catalogue_brands = [];
				const catalogue_brands = [];
				if (skus.length > 0) {
					for (let i = 0; i < skus.length; i++) {
						const skuResponse = await skuService.readByQuery({
							fields: ['*.*', 'brand.*'],
							filter: {
								id: {
									_eq: skus[i],
								},
							},
						});
						if (skuResponse.length > 0 && skuResponse[0].brand?.brand_name) {
							catalogue_brands.push({ brand_name: skuResponse[0].brand.brand_name });
						}
					}

					input.catalogue_brands = Array.from(
						new Map(catalogue_brands.map((item) => [item.brand_name, item])).values()
					);
				}
			}
		} catch (error) {
			console.log("error", error);
			throw new ServiceUnavailableException('catalog not selected');
		}
	});

	action('sp_reward_campaigns.items.update', async (input: any, { schema, accountability }) => {
		try {
			const spCampaignsService = new ItemsService('sp_reward_campaigns', {
				schema: schema,
				accountability: { admin: true },
			});
			const skuService = new ItemsService('sd_brand_sku_mapping', {
				schema: schema,
				accountability: { admin: true },
			});
			const spRewardCatalogueService = new ItemsService('sp_reward_catalogue', {
				schema: schema,
				accountability: { admin: true },
			});
			const redemptionService = new ItemsService('sp_link_reward_redemptions', {
				schema: schema,
				accountability: { admin: true },
			});
			const brandWiseRedemptionService = new ItemsService('user_brand_wise_redemptions', {
				schema: schema,
				accountability: { admin: true },
			});
			switch (input.collection) {
				case 'sp_reward_campaigns':
					if (input.payload.new_catalogue) {

						const campaignResponse = await spCampaignsService.readByQuery({
							fields: ['new_catalogue.sd_brand_sku_mapping_id.brand.brand_name'],
							filter: {
								id: {
									_eq: input.keys[0],
								},
							},
						});


						const new_catalogue = campaignResponse[0].new_catalogue || [];
						const catalogue_brands = new_catalogue.map((item: any) => item.sd_brand_sku_mapping_id.brand.brand_name);

						const response = await spCampaignsService.updateOne(input.keys[0], {
							catalogue_brands: catalogue_brands.map((brand_name: string) => ({ brand_name: brand_name })),
						}, { emitEvents: false });

					}
					//brand limitation update for redemption data for the campaign	
					if (input.payload.brand_limitation.create.length > 0) {

						const brand_limitation = input.payload.brand_limitation.create;

						if (brand_limitation.length > 0) {
							for (let i = 0; i < brand_limitation.length; i++) {
								const redemptionResponse = await redemptionService.readByQuery({
									fields: ['*', 'brand_sku.*', 'brand_sku.brand.brand_name', 'reward_link.*'],
									filter: {
										_and: [
											{
												brand_sku: {
													brand: {
														_eq: brand_limitation[i].brand
													}
												}
											},
											{
												reward_link: {
													reward_campaign: {
														_eq: input.keys[0]
													}
												}
											},
										]
									}
								});
								// Build the array
								const sumByRewardLink = {};
								console.log("redemptionResponse", redemptionResponse);

								for (const redemption of redemptionResponse) {
									const rewardLink = redemption.reward_link;
									const id = rewardLink?.id;
									const value = redemption.brand_sku?.amount;
									if (id && typeof value === 'number') {
										if (!sumByRewardLink[id]) {
											sumByRewardLink[id] = {
												id,
												value: 0,
												mobile: rewardLink.phone || null,
												email: rewardLink.email || null,
												brand_name: redemption.brand_sku.brand.brand_name,
												campaign: input.keys[0]
											};
										}
										sumByRewardLink[id].value += value;
									}
								}

								const result = Object.values(sumByRewardLink);

								// Use mobile if available, otherwise email as the key
								const groupMap = {};

								for (const entry of result) {
									const key = entry.mobile || entry.email;
									if (!key) continue; // skip if both are null/undefined

									if (!groupMap[key]) {
										groupMap[key] = {
											phone: entry.mobile || null,
											email: entry.email || null,
											campaign: input.keys[0],
											brand_name: entry.brand_name,
											overall_limit_utilized: 0
										};
									}
									groupMap[key].overall_limit_utilized += entry.value;
								}

								const uniqueArray = Object.values(groupMap);


								const now = new Date();
								const thisMonth = now.getMonth();
								const thisYear = now.getFullYear();

								for (const group of uniqueArray) {
									const monthlySum = redemptionResponse
										.filter(entry => {
											// Get phone/email from reward_link
											const entryMobile = entry.reward_link?.phone || null;
											const entryEmail = entry.reward_link?.email || null;
											// Check if current month
											const d = new Date(entry.date_created);
											const isCurrentMonth = d.getMonth() === thisMonth && d.getFullYear() === thisYear;
											// Match by mobile or email
											const mobileMatch = group.phone && entryMobile === group.phone;
											const emailMatch = group.email && entryEmail === group.email;
											return isCurrentMonth && (mobileMatch || emailMatch);
										})
										.reduce((sum, entry) => sum + (entry.brand_sku?.amount || 0), 0);

									group.monthly_limit_utilized = monthlySum;
								}
								console.log("uniqueArray", uniqueArray);
								if (uniqueArray.length > 0) {
									await brandWiseRedemptionService.createMany(uniqueArray);

								}
							}
						}

					}
					break;

				default:
					break;
			}
		} catch (error) {
			console.log("error", error);
			// Handle the error appropriately, e.g., log it or rethrow it
			// You can also throw a specific exception if needed
			throw new ServiceUnavailableException(error);
		}
	});
});

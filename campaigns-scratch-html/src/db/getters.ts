import config from "../config.json";
import LogSys from "../helpers/logger";
/**
 * Getters Class
 * */
export default class Getters {
	ItemsService;

	constructor(ItemsService, accountabilitySchema) {
		this.ItemsService = ItemsService;
		this.accountabilitySchema = accountabilitySchema;
	}

	async getUserFromId(userId) {
		try {
			const usersService = new this.ItemsService(config.collection.USERS, this.accountabilitySchema);

			const usersServiceResponse = await usersService.readByQuery({
                fields: ["*.*","*.products.*","*.products.sp_products_id.*"],
				filter: {
					user_id: {
						_eq: userId
					}
				}
			});

			return usersServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getUserFromIdError: e })
		}
	}

	async getCampaignFromId(campaignId) {
		try {
			const campaignsService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const campaignsServiceResponse = await campaignsService.readByQuery({
                fields: ["*.*", "offers.sp_offers_id.*"],
				filter: {
					id: {
						_eq: campaignId
					}
				}
			});

			return campaignsServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getCampaignFromIdError: e });
		}
	}

	async getCampaignFromIdAndProductId(campaignId, product_id) {
		try {
			const campaignsService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const campaignsServiceResponse = await campaignsService.readByQuery({
				fields: ["*.*", "offers.sp_offers_id.*", "products_offers.sp_products_offers_id.*", "products_offers.sp_products_offers_id.offers.*", "products_offers.sp_products_offers_id.products.*", "products_offers.sp_products_offers_id.products.sp_products_id.*", "products_offers.sp_products_offers_id.offers.sp_offers_id.*"],
				filter: {
					_and: [
						{
							id: {
								_eq: campaignId
							}
						},
						{
							products_offers: {
								sp_products_offers_id: {
									products: {
										sp_products_id: {
											id: {
												_eq: product_id
											}
										}
									}
								}
							}
						},
					]
				}
			});

			return campaignsServiceResponse[0];
		} catch (e) {
			console.log(e);
			await new LogSys().error({ getCampaignFromIdAndProductIdError: e });
		}
	}
	async getCampaignBasicsFromId(campaignId, project_id) {
		try {
			const campaignsService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
			const campaignsServiceResponse = await campaignsService.readByQuery({
				fields: ["*","products_offers.sp_products_offers_id.id"],
				filter: {
					_and: [
						{
							id: {
								_eq: campaignId
							}
						},
						{
							project: {
								_eq: project_id
							}
						}
					]
				}
			});

			return campaignsServiceResponse[0];
		} catch (e) {
			console.log(e);
			await new LogSys().error({ getCampaignBasicsFromIdError: e });
		}
	}

	async getOffersForProductOfferMappings(product_id, product_offer_mapping, project_id) {
		try {
			const pOfMappingService = new this.ItemsService(config.collection.PRODUCT_OFFER_MAPPINGS, this.accountabilitySchema);

            const andFilters = [
                {
                    id: {
                        _in: product_offer_mapping
                    }
                },
                {
                    project: {
                        _eq: project_id
                    }
                }
            ];

            if (product_id) {
                andFilters.push({
                    products: {
                        sp_products_id: {
                            id: {
                                _eq: product_id
                            }
                        }
                    }
                });
            }

            await new LogSys().log({ andFilters })

			const pOfMappingServiceResponse = await pOfMappingService.readByQuery({
				fields: ["id", "offers", "products", "offers.sp_offers_id.*", "products.sp_products_id.*"],
				filter: {
					_and: andFilters
				},
				/* Deep Level Query for Offers Required as Only 100 Offers from Each Mapping were being Returned. */
				deep: {
					offers: {
						_limit: -1
					}
				}
			});

            await new LogSys().log({ pOfMappingServiceResponse })

			return pOfMappingServiceResponse;
		} catch (e) {
			console.log(e);
			await new LogSys().error({ getOffersForProductOfferMappingsError: e });
		}
	}

	async getDispatchedOffersFromUserIdAndCampaignId(userId, campaignId, project_id) {
		try {
			const dispatchedOffersService = new this.ItemsService(config.collection.DISPATCHED_OFFERS, this.accountabilitySchema);
			const dispatchedOffersServiceResponse = await dispatchedOffersService.readByQuery({
                fields: ["*","offers.*"],
                sort: ["-date_created"],
				filter: {
					_and: [
						{
							user: {
								_eq: userId
							}
						},
						{
							project: {
								_eq: project_id
							}
						},
						{
							campaign: {
								_eq: campaignId
							}
						}
					]
				}
			});

			return dispatchedOffersServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getDispatchedOffersFromUserIdAndCampaignIdError: e })
		}
	}

	async getOffers() {
		try {
			const offersService = new this.ItemsService(config.collection.OFFERS, this.accountabilitySchema);
			const offersServiceResponse = await offersService.readByQuery({
                fields: ["*.*","products.*","products.sp_products_id.*"]
			});

			return offersServiceResponse;
		} catch (e) {
			await new LogSys().error({ getOffersError: e })
		}
	}

	async getProject(projectId) {
		try {
			const projectsService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
			const projectsServiceResponse = await projectsService.readByQuery({
				fields: ["*"],
				filter: {
					id: {
						_eq: projectId
					}
				}
			});

			return projectsServiceResponse[0];
		} catch (e) {
			await new LogSys().error({ getProjectError: e })
		}
	}

	async getProjectFromApiKeyClientId(apiKey, clientId) {
		try {
			const projectsService = new this.ItemsService(config.collection.PROJECTS, this.accountabilitySchema);
			const projectsServiceResponse = await projectsService.readByQuery({
				fields: ["*"],
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
			await new LogSys().error({ getProjectError: e })
		}
	}

    async getUserFromEmailAndPhn(email_id, phone_number) {
        try {
            const usersService = new this.ItemsService(config.collection.USERS, this.accountabilitySchema);
            const usersServiceResponse = await usersService.readByQuery({
                fields: ["*.*","*.products.*","*.products.sp_products_id.*","dispatched_offer.*","dispatched_offer.offers.*"],
                filter: {
                    _or: [
                        {
                            email_id: {
                                _eq: email_id
                            }
                        },
                        {
                            phone_number: {
                                _eq: phone_number
                            }
                        }
                    ]
                }
            });

            return usersServiceResponse[0];
        } catch (e) {
            await new LogSys().error({ getUserFromEmailAndPhnError: e })
        }
    }

    async getActionsProducts(campaign_id: any, project_id: any) {
        try {
            const campaignsService = new this.ItemsService(config.collection.CAMPAIGNS, this.accountabilitySchema);
            new LogSys().log({ campaign_id, project_id });

            const campaignsServiceResponse = await campaignsService.readByQuery({
                fields: ["*.*", "offers.sp_offers_id.*", "products_offers.sp_products_offers_id.*", "products_offers.sp_products_offers_id.offers.*", "products_offers.sp_products_offers_id.products.*", "products_offers.sp_products_offers_id.products.sp_products_id.*", "products_offers.sp_products_offers_id.offers.sp_offers_id.*"],
                filter: {
                    _and: [
                        {
                            id: {
                                _eq: campaign_id
                            }
                        },
                        {
                            project: {
                                _eq: project_id
                            }
                        }
                    ]
                }
            });

            const c = [
                {
                    "products_offers": [
                        {
                            "id": 7,
                            "sp_campaigns_id": "e5cd9143-4e82-40c2-935d-c71c4127e7fb",
                            "sp_products_offers_id": {
                                "id": 9,
                                "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                "date_created": "2023-07-06T12:44:11.119Z",
                                "user_updated": null,
                                "date_updated": null,
                                "text": null,
                                "project": null,
                                "offers": [
                                    {
                                        "id": 229,
                                        "sp_products_offers_id": 9,
                                        "sp_offers_id": {
                                            "id": 240,
                                            "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                            "date_created": "2023-07-06T12:44:11.125Z",
                                            "user_updated": null,
                                            "date_updated": null,
                                            "text": "You won 10 Points",
                                            "code": "10",
                                            "min_order_value": null,
                                            "project": null,
                                            "value": null,
                                            "offer_type": null,
                                            "amount": null,
                                            "percentage": null,
                                            "dispatched_offer": [],
                                            "products": []
                                        }
                                    }
                                ],
                                "products": [
                                    {
                                        "id": 30,
                                        "sp_products_offers_id": 9,
                                        "sp_products_id": {
                                            "id": 39,
                                            "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                            "date_created": "2023-07-06T12:44:11.163Z",
                                            "user_updated": null,
                                            "date_updated": null,
                                            "product_name": "Action 1",
                                            "sku": "ACEM0010",
                                            "price": 10,
                                            "project": null
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            "id": 8,
                            "sp_campaigns_id": "e5cd9143-4e82-40c2-935d-c71c4127e7fb",
                            "sp_products_offers_id": {
                                "id": 10,
                                "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                "date_created": "2023-07-06T12:45:05.232Z",
                                "user_updated": null,
                                "date_updated": null,
                                "text": null,
                                "project": null,
                                "offers": [
                                    {
                                        "id": 230,
                                        "sp_products_offers_id": 10,
                                        "sp_offers_id": {
                                            "id": 241,
                                            "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                            "date_created": "2023-07-06T12:45:05.240Z",
                                            "user_updated": null,
                                            "date_updated": null,
                                            "text": "You won 20 points",
                                            "code": "20",
                                            "min_order_value": null,
                                            "project": null,
                                            "value": null,
                                            "offer_type": null,
                                            "amount": null,
                                            "percentage": null,
                                            "dispatched_offer": [],
                                            "products": []
                                        }
                                    }
                                ],
                                "products": [
                                    {
                                        "id": 31,
                                        "sp_products_offers_id": 10,
                                        "sp_products_id": {
                                            "id": 40,
                                            "user_created": "dd9d8cec-ff53-4992-9f52-093db974de73",
                                            "date_created": "2023-07-06T12:45:05.279Z",
                                            "user_updated": null,
                                            "date_updated": null,
                                            "product_name": "Action 2",
                                            "sku": "ACEM0020",
                                            "price": 20,
                                            "project": null
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ];

            const productActions = [];

            campaignsServiceResponse[0]["products_offers"].forEach(({ sp_products_offers_id })=>{
                const { products } = sp_products_offers_id;
                products.forEach(prod =>{
                    const { sp_products_id } = prod;
                    productActions.push({
                       id:  sp_products_id["id"],
                       text:  sp_products_id["product_name"],
                    });
                })
            })

            new LogSys().log({ campaignsServiceResponse });

            return productActions;
        } catch (e) {
            await new LogSys().error({ getActionsProductsError: e })
        }
    }
}

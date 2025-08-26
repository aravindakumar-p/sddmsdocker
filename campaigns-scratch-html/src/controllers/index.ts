import Getters from "../db/getters";
import Setters from "../db/setters";
import helper from "../helpers/common";
import LogSys from "../helpers/logger";
import config from "../config.json";
import fs from "fs";

const { getRandomItem } = helper;

export default class Controller {
	get = null;
	set = null;
	services = null;
	accountabilitySchema = null;
	itemsService = null;

	constructor(services, accountabilitySchema) {
		this.services = services;
		this.accountabilitySchema = accountabilitySchema;
		const { ItemsService } = services;
		this.itemsService = ItemsService;
	}

	updateAccountabilitySchema = (accountabilitySchema) => {
		this.accountabilitySchema = accountabilitySchema;
	}

	/* Obsolete */
    getOfferObject = (offer) => {
        if (offer) {
            let offerValue = null;
            let offerType = offer["offer_type"];
            let offerText = offer["text"];
            let offerId = offer["id"];

            switch (offerType) {
                case 'discount':
                    offerValue = offer["amount"];
                    break;
                case 'percent_discount':
                    offerValue = offer["percentage"];
                    break;
                case 'shipping_free':
                    offerValue = "";
                    break;
                case 'combo': {
                    offerValue = offer["products"] ? offer["products"].map((item) => {
                        return item["sp_products_id"]["sku"]
                    }) : [];
                    break;
                }
            }

            return {
                id: offerId,
                type: offerType,
                value: offerValue,
                text: offerText
            }
        } else {
            return null;
        }
    }

	/* Obsolete */
	async getOfferForUserId(userId) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);
			const userDetails = await get.getUserFromId(userId);

			const offerAllocationType = userDetails["offer_allocation_type"];
			const offerLastUpdated = userDetails["offer_last_updated"];
			const currentOffer = userDetails["offer"];

			let offerObject = null;

			if (offerAllocationType == "constant") {
				offerObject = this.getOfferObject(currentOffer);
			}

			if (offerAllocationType == "random") {
				const offersList = await get.getOffers(userId);
				const seletedOffer = getRandomItem(offersList);
				offerObject = this.getOfferObject(seletedOffer);
			}

			if (offerAllocationType.includes("random_secs_")) {
				const offerValiditySeconds = offerAllocationType.split("_")[2]*1;
				const currentTimeStamp = new Date().getTime();
				const differenceInSeconds = (currentTimeStamp - offerLastUpdated) / 1000;
				if (differenceInSeconds > offerValiditySeconds) {
					const offersList = await get.getOffers(userId);
					const seletedOffer = getRandomItem(offersList);
					offerObject = this.getOfferObject(seletedOffer);
				} else {
					offerObject = this.getOfferObject(currentOffer);
				}
			}


			if (offerObject) {
				const offerId = offerObject["id"];

				/* Checking if same Offer is being sent */
				if (currentOffer && offerId==currentOffer["id"]) {
					return { success: true, offer: offerObject, error: null };
				} else {
					/* Update User Object to have that Offer */
					const updateUserOfferResponse = await set.updateUserOffer(userId, offerId);

					return { success: true, offer: offerObject, error: null };
				}
			} else {
				await new LogSys().error({ userId, getOfferForUserIdError: "Offer not found" });
				return { success: false, offer: null, error: "Offer not found" }
			}
		} catch (e) {
			await new LogSys().error({ userId, getOfferForUserIdError: e });
			return { success: false, offer: null, error: e };
		}
	}

	async prepareScratchCardHtmlForProject(projectId, offer, authorizationHeader) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);

			/* Get Project Details */
			const projectDetails = await get.getProject(projectId);
			await new LogSys().log({ projectDetails });
			let {
				sc_height,
				sc_width,
				sc_border_thickness,
				sc_border_radius,
				sc_border_color,
				sc_button_background,
				sc_button_foreground,
				sc_button_radius,
				scratch_card,
				sc_inner_text_color,
				sc_inner_bg,
				sc_button_height,
				sc_button_text,
				client_id,
				api_key,
				sc_inner_image,
				sc_title_text_font_size,
				sc_sub_title_text_font_size,
                hide_apply_button,
				rupee_symbol_required,
				sc_voucher_font_size,
				sc_voucher_text_color
			} = projectDetails;

			sc_height = sc_height? sc_height: config.defaults.sc_height;
			sc_width = sc_width? sc_width: config.defaults.sc_width;
			sc_border_thickness = sc_border_thickness? sc_border_thickness: config.defaults.sc_border_thickness;
			sc_border_radius = sc_border_radius? sc_border_radius: config.defaults.sc_border_radius;
			sc_border_color = sc_border_color? sc_border_color: config.defaults.sc_border_color;
			sc_button_background = sc_button_background? sc_button_background: config.defaults.sc_button_background;
			sc_button_foreground = sc_button_foreground? sc_button_foreground: config.defaults.sc_button_foreground;
			sc_inner_text_color = sc_inner_text_color? sc_inner_text_color: config.defaults.sc_inner_text_color;
			sc_inner_bg = sc_inner_bg? sc_inner_bg: config.defaults.sc_inner_bg;
			sc_button_height = sc_button_height? sc_button_height: config.defaults.sc_button_height;
			sc_button_text = sc_button_text? sc_button_text: config.defaults.sc_button_text;
			sc_inner_image = sc_inner_image? sc_inner_image: config.defaults.sc_inner_image;
			
			sc_title_text_font_size = sc_title_text_font_size? sc_title_text_font_size: "18px";
			sc_sub_title_text_font_size = sc_sub_title_text_font_size? sc_sub_title_text_font_size: "18px";
			sc_voucher_font_size = sc_voucher_font_size? sc_voucher_font_size: "50px";
			let sc_rupee_font_size = sc_voucher_font_size.replace("px", "");
			sc_rupee_font_size = (sc_rupee_font_size) + "px";
			sc_voucher_text_color = sc_voucher_text_color? sc_voucher_text_color: "#003a79";


			scratch_card = scratch_card? scratch_card: config.defaults.scratch_card_asset;
			client_id = client_id? client_id: '';
			api_key = api_key? api_key: '';
			const asset_base_url = config.defaults.asset_base_url;
			const base_url = config.defaults.base_url;
			const sc_inner_zoom = sc_height>250? config.defaults.sc_inner_zoom: sc_height/250;

			const cardId = offer.card_id;
			const offerText = offer.text;
			const offerCode = offer.code;



			const modifyHtml = new Promise((resolve) => {
				fs.readFile(__dirname+"/scratch-card.html", "utf8", (err, html) => {
					try {
						if (!err) {
							html = html.split("#VOUCHERCODE#").join(offerCode);
							html = html.split("#SC_HEIGHT#").join(sc_height);
							html = html.split("#SC_WIDTH#").join(sc_width);
							html = html.split("#SC_BORDER_THICKNESS#").join(sc_border_thickness);
							html = html.split("#SC_BORDER_RADIUS#").join(sc_border_radius);
							html = html.split("#SC_BORDER_COLOR#").join(sc_border_color);
							html = html.split("#SC_BUTTON_BACKGROUND#").join(sc_button_background);
							html = html.split("#SC_BUTTON_FOREGROUND#").join(sc_button_foreground);
							html = html.split("#SC_BUTTON_RADIUS#").join(sc_button_radius);
							html = html.split("#SC_INNER_BG#").join(sc_inner_bg);
							html = html.split("#SC_INNER_TEXT_COLOR#").join(sc_inner_text_color);
							html = html.split("#SC_BUTTON_HEIGHT#").join(sc_button_height);
							html = html.split("#SC_BUTTON_TEXT#").join(sc_button_text);
							html = html.split("#SC_INNER_IMAGE#").join(sc_inner_image);
							html = html.split("#SCRATCH_CARD#").join(scratch_card);
							html = html.split("#SC_INNER_ZOOM#").join(sc_inner_zoom);
							html = html.split("#ASSETS_BASE_URL#").join(asset_base_url);
							html = html.split("#VOUCHERTEXT#").join(offerText);
							html = html.split("#AUTH_HEADER#").join(authorizationHeader); // Obsolete - No More in Use after SP API Key and SP Client Id
							html = html.split("#CARD_ID#").join(cardId);
							html = html.split("#BASE_URL#").join(base_url);
							html = html.split("#SP_CLIENT_ID#").join(client_id);
							html = html.split("#SP_API_KEY#").join(api_key);
                            if (hide_apply_button) {
							    html = html.split("#SC_BUTTON_HIDE#").join("display: none;");
                            } else {
                                html = html.split("#SC_BUTTON_HIDE#").join("");
                            }
							if (rupee_symbol_required) {
							    html = html.split("#SC_RUPEE_SYMBOL_HIDE#").join("display: none;");
                            } else {
                                html = html.split("#SC_RUPEE_SYMBOL_HIDE#").join("");
                            }

							html = html.split("#SC_TITLE_TEXT_FONT_SIZE#").join(sc_title_text_font_size);
							html = html.split("#SC_SUBTITLE_TEXT_FONT_SIZE#").join(sc_sub_title_text_font_size);
							html = html.split("#SC_RUPEE_SYMBOL_FONT_SIZE#").join(sc_rupee_font_size);
							html = html.split("#SC_VOUCHER_FONT_SIZE#").join(sc_voucher_font_size);
							html = html.split("#SC_VOUCHER_TEXT_COLOR#").join(sc_voucher_text_color);
						}
						resolve({
							err, html
						});
					} catch (err) {
						resolve({
							err, html
						});
					}
				});
			});

			const preparedScratchCardHtml = await Promise.all([modifyHtml]);


			return preparedScratchCardHtml[0]
		} catch (e) {
			await new LogSys().error({ prepareScratchCardHtmlForProjectError: e });
		}
	}

    async getUserforEmailAndPassword(email_id, phone_number, project_id) {
        try {
            const set = new Setters(this.itemsService, this.accountabilitySchema);
            const get = new Getters(this.itemsService, this.accountabilitySchema);

            let userId = "SP"+new Date().getTime();
            let dispatched_offer = null;

            /* Get User from email and phone number */
            const userDetailsResponse = await get.getUserFromEmailAndPhn(email_id, phone_number);

            await new LogSys().log({ userDetailsResponse });

            if (userDetailsResponse) {
                userId = userDetailsResponse["user_id"];
                const isCardIssued = userDetailsResponse["dispatched_offer"][0];
                if (isCardIssued) dispatched_offer = userDetailsResponse["dispatched_offer"][0]["offers"];
            } else {
                const userCreationResponse = await set.createUserFromId(userId, project_id, email_id, phone_number);
                await new LogSys().log({ userCreated: userCreationResponse });
            }

            await new LogSys().log({ success: true, response: { userId, dispatched_offer } });

            return { success: true, response: { userId, dispatched_offer } };
        } catch (e) {
            await new LogSys().error({ getUserforEmailAndPasswordError: e });
        }
    }

	async getOfferForUserIdAndCampaignId(user_id: any, campaign_id: any, product_id: any, project_id: any, unredeemed: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			/* Create User If Not Exists */
			const userCreationResponse = await set.createUserFromId(user_id, project_id);

			/* Get the campaign and check offer allocation type and offers */
			const campaignDetails = await get.getCampaignBasicsFromId(campaign_id, project_id);

			const productOfferIDs = campaignDetails["products_offers"].map(item=>{
                return item["sp_products_offers_id"]["id"]
            });

			const productOffers = await get.getOffersForProductOfferMappings(product_id, productOfferIDs, project_id);

			/* A Campaign might have many Product Offer Mappings and Each Mapping may have many offers
			* To avoid duplication of Offers, we have created this uniqueOffers Json
			* */
			const uniqueOffers = {};

			/*
			* We are looping through all the product offer mappings and checking if the mapping has a certain product_id,
			* We are adding its offers to the uniqueOffers Json.
			*  */
			let m = 0;
			let n = 0;
			let o = 0;
			let startTime = new Date().getTime();
			if (productOffers && productOffers.length) {
				for (let i = 0; i < productOffers.length; i++) {
					const productOfferMapping = productOffers[i];
					m++;
					for (let j = 0; j < productOfferMapping["offers"].length; j++) {
						o++;
						const offerItem = productOfferMapping["offers"][j];
						const offerObject = {
							id: offerItem[ "sp_offers_id" ][ "id" ],
							text: offerItem[ "sp_offers_id" ]["text"],
							code: offerItem[ "sp_offers_id" ]["code"],
							min_order_value: offerItem[ "sp_offers_id" ]["min_order_value"]
						};

                        const offerObjectIsRedeemed = offerItem[ "sp_offers_id" ]["dispatched_offer"] && offerItem[ "sp_offers_id" ]["dispatched_offer"].length

						/* Storing the offer object under the key of offer_id to avoid duplications */
                        if (unredeemed) {
                            if (!offerObjectIsRedeemed) uniqueOffers[ offerItem[ "sp_offers_id" ][ "id" ] ] = offerObject;
                        } else {
                            uniqueOffers[ offerItem[ "sp_offers_id" ][ "id" ] ] = offerObject;
                        }
					}
				}
			}


			/* Based on User Id we are getting all the dispatched offers of the user
			* This will help us to send back the same offer incase of constant and random in 24 hours type offer allocation
			*  */
			const userDispatchedOfferDetails = await get.getDispatchedOffersFromUserIdAndCampaignId(user_id, campaign_id, project_id);

			/* This is the Last Dispatched offer of the User */
			const lastUserDispatchedOffer = userDispatchedOfferDetails? userDispatchedOfferDetails["offers"]: null;

			/* This boolean defines if the last offer is redeemed or not */
			const isLastUserDispatchedOfferRedeemed = lastUserDispatchedOffer && lastUserDispatchedOffer["redemption_status"] == "order_redeemed";

			/* Offer allocation type may be random/constant etc */
			const offerAllocationType = campaignDetails["offer_allocation_type"];

			/* Campaign Status to check if it is active */
			const campaignStatus = campaignDetails["status"];
			const campaignEndDate = campaignDetails["end_date"];

			/* Check if campaign status is active */
			if (campaignStatus!="active" && campaignEndDate > new Date().toISOString()) {
				return { success: false, offer: null, error: "Campaign not active", message: "Campaign no more active" };
			}

			const offers = Object.values(uniqueOffers);

			const randomlySelectedOffer = helper.getRandomItem(offers);

			const randomlySelectedOfferId = randomlySelectedOffer["id"];

			let offerObject = null;


			/* Based on the offer allocation type, get the offer object ready */
			if (offerAllocationType == "constant") {
				/* If Constant */
				/* Check Dispatched Offer for the User Id, and Campaign Id if anything found, return that. */
				/* Else create a New Dispatched Offer and return that. */
				if (lastUserDispatchedOffer && !isLastUserDispatchedOfferRedeemed) {
					/* Return the Same Offer that was Dispatched */
					const selectedOffer = lastUserDispatchedOffer;
					offerObject = {
						card_id: userDispatchedOfferDetails["id"],
						text: selectedOffer["text"],
						code: selectedOffer["code"]
					}
				} else {
					const createDispatchedOffer = await set.createDispatchedOffer(randomlySelectedOfferId, campaign_id, user_id, project_id);
					offerObject = {
						card_id: createDispatchedOffer,
						text: randomlySelectedOffer["text"],
						code: randomlySelectedOffer["code"]
					}
				}
			}

			if (offerAllocationType == "random") {
				/* If Random */
				/* Return one randomly and create a new dispatched offer */
				const createDispatchedOffer = await set.createDispatchedOffer(randomlySelectedOfferId, campaign_id, user_id, project_id);
				offerObject = {
					card_id: createDispatchedOffer,
					text: randomlySelectedOffer["text"],
					code: randomlySelectedOffer["code"]
				}
			}


			if (offerAllocationType.includes("random_secs_")) {
				/* If Random in 24 Hours */
				const offerLastUpdated = lastUserDispatchedOffer? userDispatchedOfferDetails["offer_creation_time_stamp"]:0;
				const offerValiditySeconds = offerAllocationType.split("_")[2]*1;
				const currentTimeStamp = new Date().getTime();
				const differenceInSeconds = (currentTimeStamp - offerLastUpdated) / 1000;
				if (differenceInSeconds > offerValiditySeconds || isLastUserDispatchedOfferRedeemed) {
					const createDispatchedOffer = await set.createDispatchedOffer(randomlySelectedOfferId, campaign_id, user_id, project_id);
					offerObject = {
						card_id: createDispatchedOffer,
						text: randomlySelectedOffer["text"],
						code: randomlySelectedOffer["code"]
					}
				} else {
					const selectedOffer = lastUserDispatchedOffer;
					offerObject = {
						card_id: userDispatchedOfferDetails["id"],
						text: selectedOffer["text"],
						code: selectedOffer["code"]
					}
				}
			}

			if (offerObject) {
				return { success: true, offer: offerObject, error: "Offer Fetched !!" };
			} else {
				await new LogSys().error({ userId, getOfferForUserIdAndCampaignIdError: "Offer not found" });
				return { success: false, offer: null, error: "Offer not found" };
			}
		} catch (e) {
			console.log({ getOfferForUserIdAndCampaignIdError: e });
			await new LogSys().error({ getOfferForUserIdAndCampaignIdError: e });
		}
	}

	async checkOfferExists(campaign_id: any, product_id: any, project_id: any) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);
			const set = new Setters(this.itemsService, this.accountabilitySchema);


			/* Get the campaign and check offer allocation type and offers */
			const campaignDetails = await get.getCampaignBasicsFromId(campaign_id, project_id);

			console.log({ campaignDetails, campaign_id, product_id });
			const productOfferIDs = campaignDetails["products_offers"];

			const productOffers = await get.getOffersForProductOfferMappings(product_id, productOfferIDs, project_id);

			return {
				success: productOffers && productOffers.length,
				error: null
			}
		} catch (e) {
			await new LogSys().error({ checkOfferExistsError: e });
			return {
				success: false,
				error: e
			}
		}
	}

	async updateCardStatus(card_id: any, status: any, project_id: any) {
		try {
			const set = new Setters(this.itemsService, this.accountabilitySchema);

			const statusUpdateResponse = await set.updateDispatchedOfferStatus(card_id, status);

			return { success: true, response: statusUpdateResponse };
		} catch (e) {
			await new LogSys().error({ updateCardStatusError: e });
		}
	}

	async getProjectIdForClient(apiKey, clientId) {
		try {
			const get = new Getters(this.itemsService, this.accountabilitySchema);

			const projectDetails = await get.getProjectFromApiKeyClientId(apiKey, clientId);

			const projectId = projectDetails? projectDetails["id"]: null;

			return {
				success: !!projectId,
				projectId: projectId
			}
		} catch (e) {
			await new LogSys().error({ getProjectIdForClientError: e });
			return {
				success: false,
				projectId: null
			}
		}
	}

    async getActions(campaign_id: any, project_id: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);

            new LogSys().log({campaign_id, project_id})
            const response = await get.getActionsProducts(campaign_id, project_id);
            new LogSys().log({response})
            return {
                success: true,
                response: response
            }
        } catch (e) {
            await new LogSys().error({ getActionsError: e });
            return {
                success: false,
                projectId: null
            }
        }
    }
}

import Getters from "../db/getters";
import Setters from "../db/setters";
import LogSys from "../helpers/logger";
import config from "../config";
import helper from "../helpers/common";
import fs from "fs";
import validateUUID from 'uuid-validate';

const axios = require('axios').default;
let isGeneratingOffer: boolean = false;

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

    async getProjectCampDetails(project_id: any, campaign_id: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const project = await get.getProjectByCode(project_id);
            let campaign_details = '';
            let data = {};
            if (project) {
                // Check Campaign is active or not
                if (campaign_id) {
                    let campaign = await get.getCampaign(campaign_id, project.project_name);
                    if (campaign) {
                        let current_date = new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString();
                        if (campaign["start_date"] <= current_date && campaign["end_date"] >= current_date && campaign["status"] == "active") {
                            campaign_details = campaign;
                        } else {
                            return {
                                "success": false,
                                "message": "Campaign Expired"
                            };
                        }
                    } else {
                        return {
                            "success": false,
                            "message": "Invalid Campaign"
                        };
                    }
                } else {
                    let active_campaign = await get.getActiveCampaign(project.project_name);
                    if (active_campaign) {
                        campaign_details = active_campaign;
                    } else {
                        return {
                            "success": false,
                            "message": "No Active Campaign"
                        };
                    }
                }

                const timestamp = Date.now().toString();
                let id_combined = `${timestamp}--${project["client_id"]}`;
                let key_combined = `${timestamp}--${project["api_key"]}`;

                data.client_id = Buffer.from(id_combined).toString('base64')
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                data.client_key = Buffer.from(key_combined).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                data.client_name = project["project_name"];
                data.campaign_id = campaign_details["id"];
                let asset_base_url = process.env.ASSETS_BASE_URL;

                data.landing_page_heading_text = campaign_details["landing_page_heading_text"];
                data.landing_page_button_text = campaign_details["landing_page_button_text"];
                data.company_logo = asset_base_url + '/' + campaign_details["company_logo"];
                data.bg_image = asset_base_url + '/' + campaign_details["bg_image"];
                data.fav_image = asset_base_url + '/' + campaign_details["fav_image"];
                data.theme = campaign_details["theme"];
                data.header_footer_img_required = campaign_details["header_footer_img_required"];
                data.theme_background = campaign_details["theme_background"];
                data.custom_css = campaign_details["custom_css"];
                data.light_mode_primary = campaign_details["light_mode_primary"];
                data.dark_mode_primary = campaign_details["dark_mode_primary"];
                data.light_mode_secondary = campaign_details["light_mode_secondary"];
                data.light_mode_secondary = campaign_details["light_mode_secondary"];
                data.dark_mode_secondary = campaign_details["dark_mode_secondary"];
                data.dark_mode_text_color = campaign_details["dark_mode_text_color"];
                data.light_mode_text_color = campaign_details["light_mode_text_color"];
                data.basic_form_fields = campaign_details["basic_form_fields"];
                data.additional_form_fields = campaign_details["additional_form_fields"] ? campaign_details["additional_form_fields"] : [];
                return {
                    "success": true,
                    "message": "Details fetched!!",
                    "data": data
                };
            } else {
                return {
                    "success": false,
                    "message": "Invalid Client"
                };
            }
        } catch (e) {
            await new LogSys().error({ getProjectCampDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    // Verify Client ID and Key 
    async getProjectIdForClient(apiKey: any, clientId: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);

            // Decode Key and ID
            let key_base64_decode = apiKey.replace(/-/g, '+').replace(/_/g, '/');
            const key_base64_decode_value = key_base64_decode.padEnd(key_base64_decode.length + (4 - key_base64_decode.length % 4) % 4, '=');
            let decode_apiKey = Buffer.from(key_base64_decode_value, 'base64').toString('utf8');

            let id_base64_decode = clientId.replace(/-/g, '+').replace(/_/g, '/');
            const id_base64_decode_value = id_base64_decode.padEnd(id_base64_decode.length + (4 - id_base64_decode.length % 4) % 4, '=');
            let decode_client_id = Buffer.from(id_base64_decode_value, 'base64').toString('utf8');

            const id_parts = decode_client_id.split('--');
            const key_parts = decode_apiKey.split('--');

            const isIDValidUUID = validateUUID(id_parts[1], 4);
            const isKeyValidUUID = validateUUID(key_parts[1], 4);
            if (id_parts.length != 2 || key_parts.length != 2 || isKeyValidUUID === false || isIDValidUUID === false) {
                return { "success": false, "message": "Invalid Details" };
            };

            const projectDetails = await get.getProjectFromApiKeyClientId(key_parts[1], id_parts[1]);

            const projectId = projectDetails ? projectDetails["project_name"] : null;
            const projectCode = projectDetails ? projectDetails["project_code"] : null;

            return {
                success: !!projectId,
                projectId: projectId,
                projectCode: projectCode
            }
        } catch (e) {
            await new LogSys().error({ getProjectCampDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    async saveUserMainFormDetails(project_id: any, project_code: any, campaign_id: any, form_data: any, file_uploads_ids: any, form_request_id: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            // Check Project Available or not
            const project = await get.getProjectByCode(project_code);

            if (project) {
                if (campaign_id) {
                    let campaign = await get.getCampaign(campaign_id, project.project_name);
                    if (campaign) {
                        let current_date = new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString();
                        if (campaign["start_date"] <= current_date && campaign["end_date"] >= current_date && campaign["status"] == "active") {
                            let OtpMode = 'sms';
                            let emailRegards = "";
                            let fromEmail = "";

                            OtpMode = campaign["otp_mode"];
                            emailRegards = campaign["email_regards"];
                            fromEmail = campaign["email_from"];

                            let user_id = "";
                            let mobile_number = "";
                            let email_id = "";
                            let user_name = "";

                            for (let field in form_data) {
                                if (form_data.hasOwnProperty(field)) {
                                    let value = form_data[field];
                                    if (field == "Name") {
                                        user_name = value;
                                    } else if (field == "Mobile") {
                                        mobile_number = value;
                                    } else if (field == "Email") {
                                        email_id = value;
                                    }
                                }
                            }
                            // Check User already available or not
                            const checkUserExists = await get.checkUserDetailsExist(mobile_number, campaign_id);
                            if (!checkUserExists) {
                                const userCreationResponse = await set.createUser(user_name, mobile_number, email_id, project_id, campaign_id);
                                user_id = userCreationResponse;
                            } else {
                                user_id = checkUserExists.user_id;
                                mobile_number = checkUserExists.phone_number;
                                email_id = checkUserExists.email_id;
                            }

                            // Update OTP
                            const otp = Math.floor(1000 + Math.random() * 9000);
                            const updateOtp = await set.updateUserOtp(user_id, otp);

                            // Create User Conversation
                            const createUserConversation = await set.createUserConversation(project_id, campaign_id, user_id, form_request_id);

                            // Update Additional Field data
                            let user_responses = [];
                            for (let field in form_data) {
                                if (form_data.hasOwnProperty(field)) {
                                    let value = form_data[field];
                                    if (field != "Name" && field != "Email" && field != "Mobile") {
                                        let input_value = value;
                                        if (Array.isArray(input_value)) {
                                            input_value = input_value.join(', ');
                                        }

                                        let response = {
                                            "conversation_id": createUserConversation,
                                            "question": field,
                                            "answer": input_value
                                        }
                                        user_responses.push(response);
                                    }
                                }
                            }
                            if (user_responses.length > 0) {
                                const userCampaignResponse = await set.createCampaignUserResponse(user_responses);
                            }

                            // Update File Upload ID in the user conversation
                            let user_attachments = [];
                            if (file_uploads_ids.length > 0) {
                                file_uploads_ids.forEach(file_uploads => {
                                    let response = {
                                        "conversation_id": createUserConversation,
                                        "question": file_uploads.title,
                                        "attachment": file_uploads.id
                                    }
                                    user_attachments.push(response);
                                });
                            }
                            if (user_attachments.length > 0) {
                                const userCampaignResponse = await set.createCampaignUserResponse(user_attachments);
                            }

                            let otpSendingResponse = null;

                            new LogSys().log({ user_id: user_id, msg: "First form saved" });

                            switch (OtpMode) {
                                case "sms": otpSendingResponse = this.sendSMS(mobile_number, otp, campaign_id); break;
                                case "email": otpSendingResponse = this.sendEmail(fromEmail, email_id, otp, emailRegards, null, null); break;
                                case "whatsapp": otpSendingResponse = this.sendWhatsapp(mobile_number, otp, null, null, campaign_id); break;
                            }

                            if (otpSendingResponse) {
                                return {
                                    "success": true,
                                    "message": "OTP Sent Successfully",
                                    "data": {
                                        "user_id": user_id
                                    }
                                }
                            } else {
                                return {
                                    "success": false,
                                    "message": "Error Occurred in sending OTP"
                                }
                            }
                        } else {
                            return {
                                "success": false,
                                "message": "Campaign Expired"
                            };
                        }
                    } else {
                        return {
                            "success": false,
                            "message": "Invalid Campaign"
                        };
                    }
                } else {
                    return {
                        "success": false,
                        "message": "Invalid Campaign"
                    };
                }
            } else {
                return {
                    "success": false,
                    "message": "Invalid Client"
                };
            }
        } catch (e) {
            await new LogSys().error({ saveUserMainFormDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    async resendOTP(user_id: any, campaign_id: any, project_code: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            const project = await get.getProjectByCode(project_code);

            const user = await get.getCampaignUser(user_id, campaign_id);

            if (user) {
                if (project) {
                    if (campaign_id) {
                        let campaign = await get.getCampaign(campaign_id, project.project_name);
                        if (campaign) {
                            let current_date = new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString();
                            if (campaign["start_date"] <= current_date && campaign["end_date"] >= current_date && campaign["status"] == "active") {
                                let OtpMode = 'sms';
                                let emailRegards = "";
                                let fromEmail = "";

                                OtpMode = campaign["otp_mode"];
                                emailRegards = campaign["email_regards"];
                                fromEmail = campaign["email_from"];

                                const otp = Math.floor(1000 + Math.random() * 9000);
                                const updateOtp = await set.updateUserOtp(user_id, otp);

                                new LogSys().log({ user_id: user_id, msg: "Re Sent OTP" });

                                let otpSendingResponse = null;

                                switch (OtpMode) {
                                    case "sms": otpSendingResponse = await this.sendSMS(user.phone_number, otp, campaign_id); break;
                                    case "email": otpSendingResponse = await this.sendEmail(fromEmail, user.email_id, otp, emailRegards, null, null); break;
                                    case "whatsapp": otpSendingResponse = await this.sendWhatsapp(user.phone_number, otp, null, null, campaign_id); break;
                                }

                                if (otpSendingResponse) {
                                    return {
                                        "success": true,
                                        "message": "OTP Resent Successfully"
                                    }
                                } else {
                                    return {
                                        "success": false,
                                        "message": "Error Occurred in sending OTP"
                                    }
                                }
                            } else {
                                return {
                                    "success": false,
                                    "message": "Campaign Expired"
                                };
                            }
                        } else {
                            return {
                                "success": false,
                                "message": "Invalid Campaign"
                            };
                        }
                    } else {
                        return {
                            "success": false,
                            "message": "Invalid Campaign"
                        };
                    }
                } else {
                    return {
                        "success": false,
                        "message": "Invalid Client"
                    };
                }
            } else {
                return {
                    "success": false,
                    "message": "Invalid User Details"
                };
            }
        } catch (e) {
            await new LogSys().error({ saveUserMainFormDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    async verifyOTP(user_id: any, campaign_id: any, project_code: any, otp: any, request_id: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            new LogSys().log({ user_id: user_id, msg: "Verify OTP", otp: otp });
            // Check Project & User available or not
            const project = await get.getProjectByCode(project_code);
            const user = await get.verifyUserOTP(user_id, campaign_id, otp);
            let data = {};
            if (!user) {
                return {
                    "success": false,
                    "message": "Invalid OTP"
                };
            }
            if (project) {
                if (campaign_id) {
                    let campaign = await get.getCampaign(campaign_id, project.project_name);
                    if (campaign) {
                        let current_date = new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString();
                        if (campaign["start_date"] <= current_date && campaign["end_date"] >= current_date && campaign["status"] == "active") {
                            data.user_id = user_id;
                            // Update Last OTP Verified
                            const updateOtpStatus = await set.updateUserOtpStatus(user_id);
                            new LogSys().log({ user_id: user_id, msg: "OTP Verified" });
                            data.wizard_page_heading_text = campaign["wizard_page_heading_text"];
                            data.wizard_page_button_text = campaign["wizard_page_button_text"];
                            data.wizard_form_fields = campaign["wizard_form_fields"] ? campaign["wizard_form_fields"] : [];

                            data.wizard_form_required = true;
                            if (data.wizard_form_fields.length > 0) {
                                new LogSys().log({ user_id: user_id, msg: "Wizard Form Request" });
                                return {
                                    "success": true,
                                    "message": "Details fetched!!",
                                    "data": data
                                };
                            } else {
                                // Check Offer redeemed or not
                                const checkUserOffer = await get.getCampaignUser(user_id, campaign_id);
                                if (checkUserOffer && checkUserOffer.is_offer_redeemed == true) {
                                    return {
                                        "success": false,
                                        "message": "Already redeemed the offer and offer details sent to the email.Please Check the email"
                                    }
                                }
                                let offer_data = await this.generateOffer(user_id, campaign, project, request_id);
                                if (offer_data && offer_data.success == true) {
                                    new LogSys().log({ user_id: user_id, msg: "Offer Generated" });
                                    return {
                                        "success": true,
                                        "message": 'Offer fetched!',
                                        "data": {
                                            "wizard_form_required": false,
                                            "html_data": offer_data.html_data,
                                            "offer_page_heading_text": campaign["offer_page_heading_text"],
                                            "redeem_instruction_text_color": campaign["sc_redeem_instruction_text_color"],
                                            "redeem_instruction_font_size": campaign["sc_redeem_instruction_font_size"],
                                            "redeem_instruction_text": campaign["sc_redeem_instruction_text"]
                                        }
                                    }
                                } else {
                                    return {
                                        "success": false,
                                        "data": {
                                            "wizard_form_required": false
                                        },
                                        "message": offer_data.message
                                    }
                                }
                            }
                        } else {
                            return {
                                "success": false,
                                "message": "Campaign Expired"
                            };
                        }
                    } else {
                        return {
                            "success": false,
                            "message": "Invalid Campaign"
                        };
                    }
                } else {
                    return {
                        "success": false,
                        "message": "Invalid Campaign"
                    };
                }
            } else {
                return {
                    "success": false,
                    "message": "Invalid Project"
                };
            }
        } catch (e) {
            await new LogSys().error({ saveUserMainFormDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    async saveUserWizardFormDetails(project_id: any, project_code: any, campaign_id: any, user_id: any, form_data: any, file_uploads_ids: any, form_request_id: any) {
        try {
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);

            // Check Project Available or not
            const project = await get.getProjectByCode(project_code);
            const user = await get.getCampaignUser(user_id, campaign_id);
            if (user) {
                if (project) {
                    if (campaign_id) {
                        let campaign = await get.getCampaign(campaign_id, project.project_name);
                        if (campaign) {
                            let current_date = new Date(new Date().getTime() + (5 * 60 * 60 * 1000 + 30 * 60 * 1000)).toISOString();
                            if (campaign["start_date"] <= current_date && campaign["end_date"] >= current_date && campaign["status"] == "active") {
                                let conversation = await get.getUserConversation(form_request_id, campaign_id, user_id);
                                if (!conversation || conversation.length == 0) {
                                    return {
                                        "success": false,
                                        "message": "Invalid User Conversation.Please try again"
                                    }
                                }

                                // Update Additional Field data
                                let user_responses = [];
                                for (let field in form_data) {
                                    if (form_data.hasOwnProperty(field)) {
                                        let value = form_data[field];
                                        if (field != "Name" && field != "Email" && field != "Mobile") {
                                            let input_value = value;
                                            if (Array.isArray(input_value)) {
                                                input_value = input_value.join(', ');
                                            }

                                            let response = {
                                                "conversation_id": conversation.id,
                                                "question": field,
                                                "answer": input_value
                                            }
                                            user_responses.push(response);
                                        }
                                    }
                                }
                                if (user_responses.length > 0) {
                                    const userCampaignResponse = await set.createCampaignUserResponse(user_responses);
                                }

                                // Update File Upload ID in the user conversation
                                let user_attachments = [];
                                if (file_uploads_ids.length > 0) {
                                    file_uploads_ids.forEach(file_uploads => {
                                        let response = {
                                            "conversation_id": conversation.id,
                                            "question": file_uploads.title,
                                            "attachment": file_uploads.id
                                        }
                                        user_attachments.push(response);
                                    });
                                }
                                if (user_attachments.length > 0) {
                                    const userCampaignResponse = await set.createCampaignUserResponse(user_attachments);
                                }

                                new LogSys().log({ user_id: user_id, msg: "Wizard form Saved" });

                                // Check Offer redeemed or not
                                if (user && user.is_offer_redeemed == true) {
                                    return {
                                        "success": false,
                                        "message": "Already redeemed the offer and offer details sent to the email.Please Check the email"
                                    }
                                }

                                let offer_data: any = await this.generateOffer(user_id, campaign, project, form_request_id);
                                if (offer_data && offer_data.success == true) {
                                    new LogSys().log({ user_id: user_id, msg: "After Wizard form Offer Generated" });
                                    return {
                                        "success": true,
                                        "message": 'Offer fetched!',
                                        "data": {
                                            "wizard_form_required": false,
                                            "html_data": offer_data.html_data,
                                            "offer_page_heading_text": campaign["offer_page_heading_text"],
                                            "redeem_instruction_text_color": campaign["sc_redeem_instruction_text_color"],
                                            "redeem_instruction_font_size": campaign["sc_redeem_instruction_font_size"],
                                            "redeem_instruction_text": campaign["sc_redeem_instruction_text"]
                                        }
                                    }
                                } else {
                                    return {
                                        "success": false,
                                        "data": {
                                            "wizard_form_required": false
                                        },
                                        "message": offer_data.message
                                    }
                                }
                            } else {
                                return {
                                    "success": false,
                                    "message": "Campaign Expired"
                                };
                            }
                        } else {
                            return {
                                "success": false,
                                "message": "Invalid Campaign"
                            };
                        }
                    } else {
                        return {
                            "success": false,
                            "message": "Invalid Campaign"
                        };
                    }
                } else {
                    return {
                        "success": false,
                        "message": "Invalid Project"
                    };
                }
            } else {
                return {
                    "success": false,
                    "message": "Invalid User"
                };
            }
        } catch (e) {
            await new LogSys().error({ saveUserMainFormDetailsError: e });
            return { "success": false, "message": "Server Error, Please try later" };
        }
    }

    async generateOffer(user_id: any, campaign: any, project: any, request_id: any) {
        while (isGeneratingOffer) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 100ms before checking again
        }
        isGeneratingOffer = true;

        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const get = new Getters(this.itemsService, this.accountabilitySchema);
            const set = new Setters(this.itemsService, this.accountabilitySchema);
            new LogSys().log({ user_id: user_id, msg: "Generate Offer started" });
            let link_denomination_type = "";
            let link_denomination_values = "";
            let link_value = 0;
            let denominations = [];
            let offer_text = "";

            let current_balance = 0;

            link_denomination_type = campaign["link_denomination_type"];
            if (link_denomination_type == "multiple_fixed") {
                link_denomination_values = campaign["denomination_with_fixed"];
            } else if (link_denomination_type == "multiple") {
                link_denomination_values = campaign["multiple_denomination_value"];
            } else {
                link_denomination_values = campaign["single_denomination_value"];
                link_value = campaign["single_denomination_value"];
            }
            offer_text = campaign["offer_text"];

            let project_current_balance = await get.getProjectCurrentBalance(project.project_code);

            current_balance = (project_current_balance && parseInt(project_current_balance.wallet_balance) > 0) ? parseInt(project_current_balance.wallet_balance) : 0;

            let campaign_balance = await get.getCampaignCurrentBalance(campaign.id);
            let used_amount = (campaign_balance && parseInt(campaign_balance.used_amount) > 0) ? parseInt(campaign_balance.used_amount) : 0;
            let max_amount = (campaign_balance && parseInt(campaign_balance.max_amount) > 0) ? parseInt(campaign_balance.max_amount) : 0;

            let max_denomination_value = parseInt(max_amount) - parseInt(used_amount);

            new LogSys().log({ user_id: user_id, action: "Before allocation", current_balance: current_balance, used_amount: used_amount, max_amount: max_amount, max_denomination_value: max_denomination_value });

            if (max_denomination_value == 0) {
                return {
                    "success": false,
                    "message": "Offer value not exist"
                };
            }

            if (used_amount == max_amount) {
                return {
                    "success": false,
                    "message": "Campaign have reached the maximum limit.Please contact the support team"
                };
            }

            if (link_denomination_type == "multiple_fixed") {
                let offers_count = await get.getCampaignRedeemedCount(campaign.id);

                if (offers_count.length > 0) {
                    let offer_assigned_denominations: any = [];
                    offers_count.forEach(offer => {
                        const linkValue = offer.link_value;
                        let existingEntry = offer_assigned_denominations.find(entry => entry.hasOwnProperty(linkValue));
                        if (existingEntry) {
                            existingEntry[linkValue] += 1;
                        } else {
                            let obj = {};
                            obj[linkValue] = 1;
                            offer_assigned_denominations.push(obj);
                        }
                    });

                    offer_assigned_denominations.forEach(entry => {
                        const [linkValue, count] = Object.entries(entry)[0];

                        let link_denomination = link_denomination_values.find(obj => obj.denomination === parseInt(linkValue));

                        if (link_denomination) {
                            link_denomination.no_of_links -= parseInt(count);
                        }
                    });
                }
                denominations = link_denomination_values.filter(item => item["no_of_links"] > 0 && max_denomination_value >= item["denomination"]).map(item => item["denomination"]);

                if (denominations.length == 0) {
                    return {
                        "success": false,
                        "message": "Campaign have reached the maximum offer limit.Please contact the support team"
                    };
                }
                new LogSys().log({ user_id: user_id, denominations: denominations });
                link_value = helper.getRandomItem(denominations);
            } else if (link_denomination_type == "multiple") {
                denominations = link_denomination_values.filter(item => max_denomination_value >= item["denomination"]).map(item => item["denomination"]);
                new LogSys().log({ user_id: user_id, denominations: denominations });
                // denominations = link_denomination_values.map(item => {
                //     return item["denomination"]
                // });
                link_value = helper.getRandomItem(denominations);
            }

            if ((parseInt(used_amount) + parseInt(link_value)) > max_amount) {
                return {
                    "success": false,
                    "message": "Campaign have reached the maximum used amount.Please contact the support team"
                };
            }
            if (parseInt(link_value) > 0 && parseInt(current_balance) >= parseInt(link_value)) {
                new LogSys().log({ user_id: user_id, offer_value: link_value });
                // Update wallet balance
                current_balance = parseInt(current_balance) - parseInt(link_value);
                let balance_update = "";
                let current_used_amount = parseInt(used_amount) + parseInt(link_value);

                new LogSys().log({ user_id: user_id, action: "After allocation", current_balance: current_balance, current_used_amount: current_used_amount, link_value: link_value });

                let conversation = await get.getUserConversation(request_id, campaign.id, user_id);
                if (!conversation) {
                    return {
                        "success": false,
                        "message": "User conversation details not found"
                    };
                }
                let current_balance_update = await set.updateCurrentBalance(project.project_name, current_balance, 1);

                balance_update = await set.updateCurrentBalance(campaign.id, current_used_amount, 2);
                let addLedger = await set.projectLedger(link_value, project.project_name, 'debit', campaign.id, user_id);
                new LogSys().log({ user_id: user_id, current_balance_update: current_balance_update, balance_update: balance_update });

                if (balance_update) {
                    new LogSys().log({ user_id: user_id, current_balance: current_balance, current_used_amount: current_used_amount });
                    // Sent Remainder
                    let alert_balance = project["alert_notification_threshold_limit"];
                    if (parseInt(current_balance) <= parseInt(alert_balance)) {
                        let to_email = project["alert_notification_threshold_users"];
                        this.sendAlertNotification(project.project_name, campaign.name, to_email, current_balance, alert_balance);
                    }
                    // Check Reward Campaign ID
                    const reward_campaign = await get.getRewardCampaign(campaign.id);
                    if (reward_campaign) {
                        let campaign_duration = config.defaults.link_duration;
                        // Generate Reward Link
                        let link_id = helper.generateRewardLink(config.defaults.reward_link_length);
                        let i = 0;
                        while (i == 0) {
                            // Check link available or not
                            let reward_link = await get.checkRewardLink(link_id);
                            if (reward_link && reward_link.length > 0) {
                                link_id = helper.generateRewardLink(config.defaults.reward_link_length);
                                i = 0;
                            } else {
                                i = 1;
                            }
                        }
                        let user = await get.getCampaignUser(user_id, campaign.id);
                        let linkObj: any = {};
                        linkObj.id = link_id;
                        linkObj.otp = Math.floor(1000 + Math.random() * 9000);
                        linkObj.reward_campaign = reward_campaign["id"];
                        linkObj.start_date = new Date().toISOString();
                        linkObj.end_date = new Date(new Date().setMonth(new Date().getMonth() + campaign_duration)).toISOString();
                        linkObj.first_name = user.name;
                        linkObj.email = user.email_id;
                        linkObj.phone = user.phone_number;
                        linkObj.value = link_value;
                        linkObj.pending_value = link_value;

                        const saveLink = await set.saveRewardLink(linkObj);
                        new LogSys().log({ user_id: user_id, status: "Link Assigned " + saveLink });
                        if (saveLink) {
                            const saveUserLedger = await set.saveCampaignUserLedger(user_id, saveLink, link_value);
                            if (saveUserLedger) {
                                // Update Offer Status
                                const updateOfferStatus = await set.updateOfferStatus(conversation.id);
                                new LogSys().log({ user_id: user_id, status: "Ledger Added" });
                                offer_text = offer_text.replace("{value}", link_value);
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
                                    sc_voucher_text_color,
                                    sc_redeem_instruction_text,
                                    sc_redeem_instruction_text_color,
                                    sc_redeem_instruction_font_size,
                                } = campaign;

                                sc_height = sc_height ? sc_height : config.defaults.sc_height;
                                sc_width = sc_width ? sc_width : config.defaults.sc_width;
                                sc_border_thickness = sc_border_thickness ? sc_border_thickness : config.defaults.sc_border_thickness;
                                sc_border_radius = sc_border_radius ? sc_border_radius : config.defaults.sc_border_radius;
                                sc_border_color = sc_border_color ? sc_border_color : config.defaults.sc_border_color;
                                sc_button_background = sc_button_background ? sc_button_background : config.defaults.sc_button_background;
                                sc_button_foreground = sc_button_foreground ? sc_button_foreground : config.defaults.sc_button_foreground;
                                sc_inner_text_color = sc_inner_text_color ? sc_inner_text_color : config.defaults.sc_inner_text_color;
                                sc_inner_bg = sc_inner_bg ? sc_inner_bg : config.defaults.sc_inner_bg;
                                sc_button_height = sc_button_height ? sc_button_height : config.defaults.sc_button_height;
                                sc_button_text = sc_button_text ? sc_button_text : config.defaults.sc_button_text;
                                sc_inner_image = sc_inner_image ? sc_inner_image : config.defaults.sc_inner_image;

                                sc_title_text_font_size = sc_title_text_font_size ? sc_title_text_font_size : "18px";
                                sc_sub_title_text_font_size = sc_sub_title_text_font_size ? sc_sub_title_text_font_size : "18px";
                                sc_voucher_font_size = sc_voucher_font_size ? sc_voucher_font_size : "50px";
                                let sc_rupee_font_size = sc_voucher_font_size.replace("px", "");
                                sc_rupee_font_size = (sc_rupee_font_size) + "px";
                                sc_voucher_text_color = sc_voucher_text_color ? sc_voucher_text_color : "#003a79";

                                sc_redeem_instruction_text_color = sc_redeem_instruction_text_color ? sc_redeem_instruction_text_color : "#003a79";
                                sc_redeem_instruction_font_size = sc_redeem_instruction_font_size ? sc_redeem_instruction_font_size : "15px";
                                sc_redeem_instruction_text = sc_redeem_instruction_text ? sc_redeem_instruction_text : "";

                                scratch_card = scratch_card ? scratch_card : config.defaults.scratch_card_asset;
                                const asset_base_url = config.defaults.asset_base_url;
                                const base_url = config.defaults.base_url;
                                const sc_inner_zoom = sc_height > 250 ? config.defaults.sc_inner_zoom : sc_height / 250;

                                const offerText = offer_text;

                                const modifyHtml = new Promise((resolve) => {
                                    fs.readFile(__dirname + "/scratch-card.html", "utf8", (err, html) => {
                                        try {
                                            if (!err) {
                                                html = html.split("#VOUCHERCODE#").join(link_value);
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
                                                html = html.split("#BASE_URL#").join(base_url);
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

                                                html = html.split("#SC_VOUCHER_REDEEM_INSTRU_FONT_SIZE#").join(sc_redeem_instruction_font_size);
                                                html = html.split("#SC_VOUCHER_REDEEM_INSTRU_TEXT_COLOR#").join(sc_redeem_instruction_text_color);
                                                html = html.split("#SC_VOUCHER_REDEEM_INSTRU_TEXT#").join(sc_redeem_instruction_text);
                                                html = html.split("#SC_REDEEM_BTN_HIDE#").join("display: none;");
                                                html = html.split("#SC_SCRATCH_VALUE_HIDE#").join("");
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
                                return {
                                    "success": true,
                                    "html_data": preparedScratchCardHtml[0].html
                                };
                            } else {
                                return {
                                    "success": false,
                                    "message": "Something went wrong on server. please try again later!"
                                };
                            }

                        } else {
                            // Offer Generation Error
                            return {
                                "success": false,
                                "message": "Something went wrong on server. please try again later!"
                            };
                        }
                    } else {
                        // Offer Generation Error
                        return {
                            "success": false,
                            "message": "Something went wrong on server to fetch campaign. please try again later"
                        };
                    }
                } else {
                    // Offer Generation Error
                    return {
                        "success": false,
                        "message": "Something went wrong on server. please try again later"
                    };
                }
            } else {
                // Error
                return {
                    "success": false,
                    "message": "Offer not exist"
                };
            }
        } catch (e) {
            // Reset the flag once offer generation is complete
            isGeneratingOffer = false;
            await new LogSys().error({
                sendSMSError: e
            });
        } finally {
            // Reset the flag once offer generation is complete
            isGeneratingOffer = false;
        }
    }

    async sendAlertNotification(project_name: any, campaign_name: any, to_email: any, current_balance: number, alert_balance: number) {
        try {
            const requestBody = {
                "to_email": to_email,
                "project": project_name,
                "campaign": campaign_name,
                "current_balance": current_balance,
                "alert_balance": alert_balance
            };

            axios.post(
                `${config.workflows.base_url}/webhook/sd-qr-notification`,
                requestBody,
                {
                    headers: {
                        Authorization: config.workflows.sd_notifications_auth
                    }
                }
            ).then(response => {
                console.log(response.data);
            }).catch(error => {
                new LogSys().log({ sendMailError: error });
            });
        } catch (e) {
            new LogSys().error({
                sendSMSError: e
            });
        }
    }

    async sendSMS(mobile: any, otp: number, campaign_id: any) {
        try {
            mobile = (mobile + "").length == 10 ? "91" + mobile : mobile;
            const requestBody = {
                "phone": mobile,
                "template_params": [otp],
                "otp_mode": "sms",
                "campaign_id" : "Fluke " + campaign_id
            };

            const smsEmailResponse = await axios.post(
                `${config.workflows.base_url}/webhook/sd-notifications`, requestBody, {
                headers: {
                    Authorization: config.workflows.sd_notifications_auth
                }
            }
            );

            new LogSys().log({ mobile: mobile, msg: "Sent SMS", response: smsEmailResponse.data });
            return smsEmailResponse.data;
        } catch (e) {
            await new LogSys().error({
                sendSMSError: e
            });
        }
    }

    async sendEmail(from, to, otp, email_regards, template, extra_params) {
        try {

            const requestBody = {
                "template_name": template || "reward-template",
                "template_params": [otp, email_regards],
                "email_from": from,
                "email_to": to,
                "otp_mode": "email",
                "type": extra_params && extra_params.type ? extra_params.type : '',
                "extra_params": extra_params || {}
            };

            const sendEmailResponse = await axios.post(
                `${config.workflows.base_url}/webhook/sd-notifications`, requestBody, {
                headers: {
                    Authorization: config.workflows.sd_notifications_auth
                }
            }
            );
            new LogSys().log({ to: to, msg: "Sent Email", response: sendEmailResponse.data });
            return sendEmailResponse.data;
        } catch (e) {
            await new LogSys().error({
                sendEmailError: e
            });
        }
    }
    async sendWhatsapp(mobile, otp, template, extra_params, campaign_id) {
        try {
            const requestBody = {
                "template_name": template || "reward-template",
                "template_params": [otp],
                "phone": mobile,
                "otp_mode": "whatsapp",
                "type": extra_params && extra_params.type ? extra_params.type : '',
                "extra_params": extra_params || {},
                "campaign_id" : campaign_id
            };

            const sendSMSResponse = await axios.post(
                `${config.workflows.base_url}/webhook/sd-notifications`, requestBody, {
                headers: {
                    Authorization: config.workflows.sd_notifications_auth
                }
            }
            );
            new LogSys().log({ mobile: mobile, msg: "Sent WhatsApp", response: sendSMSResponse.data });
            return sendSMSResponse.data;
        } catch (e) {
            await new LogSys().error({
                sendWhatsappError: e
            });
        }
    }
}

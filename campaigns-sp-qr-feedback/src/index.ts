import * as Excel from 'exceljs';
import config from './config';


export default (router, { services, exceptions, env }) => {
	const { ServiceUnavailableException } = exceptions;
	const { ItemsService } = services;

	router.get('/download-feedback/:type/:request_id/', async (req: any, res: any, next: any) => {
		try {
			const request_type: any = req.params.type;
			const request_id: any = req.params.request_id;

			if (!request_type || !request_id) {
				return res.send({
					success: false,
					error: 'Params missing',
				});
			}

			let request_ids = request_id.split("&");
			const conversationService = new ItemsService(config.collection.CAMPAIGN_USER_CONVERSATIONS, {
				schema: req.schema,
				accountability: { admin: true },
			});

			let getConversationData = [];
			let fileName = "";
			let campaignName = "";
			let projectName = "";
			if (request_type == 1) {
				// Check Vaild project or not
				const projectService = new ItemsService(config.collection.PROJECT, {
					schema: req.schema,
					accountability: { admin: true },
				});
				let projectData = await projectService.readByQuery({
					filter: { project_code: { _eq: request_id } },
					fields: [
						"project_name"
					]
				});

				if (!projectData) {
					return res.send({
						success: false,
						error: 'Invalid Request',
					});
				}

				getConversationData = await conversationService.readByQuery({
					filter: { project: { _eq: projectData[0].project_name } },
					fields: [
						"user.name",
						"user.email_id",
						"user.phone_number",
						"user.is_offer_redeemed",
						"user.link_value",
						"campaign.name",
						"campaign.start_date",
						"campaign.end_date",
						"project.project_name",
						"is_offer_redeemed",
						"user_responses.*"
					],
					limit: -1,
				});
			} else if (request_type == 2) {
				if (request_ids.length == 0) {
					return res.send({
						success: false,
						error: 'Invalid Data',
					});
				}
				getConversationData = await conversationService.readByQuery({
					filter: { campaign: { _in: request_ids } },
					fields: [
						"user.name",
						"user.email_id",
						"user.phone_number",
						"user.is_offer_redeemed",
						"user.link_value",
						"campaign.name",
						"campaign.start_date",
						"campaign.end_date",
						"is_offer_redeemed",
						"user_responses.*"
					],
					limit: -1,
				});
			} else {
				return res.send({
					success: false,
					error: 'Invalid Request',
				});
			}

			let user_data = [];
			let summary_data = [];
			if (getConversationData && getConversationData.length > 0) {
				getConversationData.forEach(function (user_response, index) {
					let user_feedbacks = user_response["user_responses"];
					if (user_feedbacks.length > 0 && user_response["campaign"]) {
						campaignName = user_response["campaign"]["name"];
						campaignName = campaignName.replaceAll("/", "-");
						if (request_type == 1) {
							projectName = user_response["project"]["project_name"];
						}

						let campaign_entry = user_data.find(entry => entry.campaignName === campaignName);

						if (!campaign_entry) {
							campaign_entry = { campaignName: campaignName, headers: ['Name', 'Email ID', 'Mobile Number', 'Is Offer Redeemed', 'Offer Value'], data: [] };
							user_data.push(campaign_entry);
						}

						let summary_entry = summary_data.find(entry => entry.campaignName === campaignName);

						if (!summary_entry) {
							const campaign_start_date = new Date(user_response["campaign"]["start_date"]);
							campaign_start_date.setHours(campaign_start_date.getHours() + 5);
							campaign_start_date.setMinutes(campaign_start_date.getMinutes() + 30);
							const start_day = campaign_start_date.getDate().toString().padStart(2, '0');
							const start_month = (campaign_start_date.getMonth() + 1).toString().padStart(2, '0');
							const start_year = campaign_start_date.getFullYear();
							let camp_start_date = `${start_day}/${start_month}/${start_year}`;

							const campaign_end_date = new Date(user_response["campaign"]["end_date"]);
							campaign_end_date.setHours(campaign_end_date.getHours() + 5);
							campaign_end_date.setMinutes(campaign_end_date.getMinutes() + 30);
							const end_day = campaign_end_date.getDate().toString().padStart(2, '0');
							const end_month = (campaign_end_date.getMonth() + 1).toString().padStart(2, '0');
							const end_year = campaign_end_date.getFullYear();

							let camp_end_date = `${end_day}/${end_month}/${end_year}`;

							summary_entry = { campaignName: campaignName, campaign_start_date: camp_start_date, campaign_end_date: camp_end_date, total_users: [], total_feedbacks_received: 0, total_rewards_disbursed: 0, total_reward_values: 0 };
							summary_data.push(summary_entry);
						}

						summary_entry.total_feedbacks_received += 1;

						let summary_total_users = summary_entry.total_users;
						if (!summary_total_users.includes(user_response["user"]["phone_number"])) {
							summary_total_users.push(user_response["user"]["phone_number"]);
						}

						let headers = campaign_entry.headers;

						let is_offer_redeemed = user_response["is_offer_redeemed"] ? "Yes" : "No";
						let link_value = is_offer_redeemed == 'Yes' ? user_response["user"]["link_value"] || 0 : 0;

						summary_entry.total_rewards_disbursed = (link_value > 0 ? 1 : 0) + parseInt(summary_entry.total_rewards_disbursed);
						summary_entry.total_reward_values = (link_value > 0 ? link_value : 0) + parseInt(summary_entry.total_reward_values);

						let answers = [
							user_response["user"]["name"] || "",
							user_response["user"]["email_id"] || "",
							user_response["user"]["phone_number"] || "",
							user_response["is_offer_redeemed"] ? "Yes" : "No",
							user_response["is_offer_redeemed"] ? (user_response["user"]["link_value"] || "") : "",
						];

						user_feedbacks.forEach(function (user_feedback, index) {
							if (!user_feedback["attachment"]) {
								let answer = user_feedback["answer"] ? user_feedback["answer"] : " ";
								answer = answer.replaceAll(",", " / ");
		
								const date = new Date(user_feedback["date_created"]);
								date.setHours(date.getHours() + 5);
								date.setMinutes(date.getMinutes() + 30);
								const day = date.getDate().toString().padStart(2, '0');
								const month = (date.getMonth() + 1).toString().padStart(2, '0');
								const year = date.getFullYear();
								let hours = date.getHours();
								const minutes = date.getMinutes().toString().padStart(2, '0');
								const seconds = date.getSeconds().toString().padStart(2, '0');
								let amPM = 'AM';
								if (hours >= 12) {
									hours -= 12;
									amPM = 'PM';
								}
								if (hours === 0) {
									hours = 12;
								}
		
								let created_date = `${day}-${month}-${year} ${hours}:${minutes} ${amPM}`;

								if (!headers.includes(user_feedback["question"])) {
									headers.push(user_feedback["question"]);
								}

								let ques_pos = headers.indexOf(user_feedback["question"]);

								while (answers.length <= ques_pos) {
									answers.push("");
								}
								answers[ques_pos] = answer;
							}
						});

						campaign_entry.headers = headers;
						campaign_entry.data.push(answers);
					}
				});
			} else {
				return res.send({
					success: false,
					error: 'No Data',
				});
			}

			// Generate Excel
			const workbook = new Excel.Workbook();

			//Summary 
			let summary_worksheet = workbook.addWorksheet("Summary");
			let cell_range = 1;
			summary_data.forEach(function (campaign_entry) {
				let camp_name = campaign_entry.campaignName;
				summary_worksheet.addRow([camp_name, ""]);
				summary_worksheet.addRow(['Total Users', campaign_entry.total_users.length]);
				summary_worksheet.addRow(['Total feedbacks received', campaign_entry.total_feedbacks_received]);
				summary_worksheet.addRow(['Total rewards disbursed', campaign_entry.total_rewards_disbursed]);
				summary_worksheet.addRow(['Total value of rewards disbursed', campaign_entry.total_reward_values]);
				summary_worksheet.addRow(['', '']);
				summary_worksheet.mergeCells('A' + cell_range + ':B' + cell_range);
				summary_worksheet.getCell('A' + cell_range).alignment = { vertical: 'middle', horizontal: 'center' };
				summary_worksheet.getCell('A' + cell_range).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFFFFF00' },
					bgColor: { argb: 'FFC20E' }
				};
				summary_worksheet.getRow(cell_range).font = { bold: true };
				cell_range += 6;
			});

			user_data.forEach(function (campaign_entry) {
				let worksheet = workbook.addWorksheet(campaign_entry.campaignName, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
				let headers = campaign_entry.headers;
				// Add headers to worksheet
				worksheet.columns = headers.map(header => ({
					header: header,
					key: header
				}));
				
				worksheet.getRow(1).eachCell(cell => {
					cell.fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: 'FFFFFF00' },
						bgColor: { argb: 'FFC20E' }
					};
				});

				let user_feedbacks = campaign_entry.data;

				user_feedbacks.forEach(user_feedback => {
					let row = {};
					headers.forEach((header, index) => {
						row[header] = user_feedback[index];
					});
					worksheet.addRow(row);
				});
			});

			fileName = campaignName;
			if (request_type == 1) {
				fileName = projectName;
			} else if (request_ids.length > 1) {
				fileName = "Feedback Report";
			}
			if (workbook) {
				res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
				res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

				workbook.xlsx.write(res).then(() => {
					res.status(200).end();
				}).catch(err => {
					return res.status(500).send({
						success: false,
						error: 'Excel creation error',
						details: err.message
					});
				});
			} else {
				return res.send({
					success: false,
					error: 'Excel creation error',
				});
			}
		} catch (error) {
			return res.send({
				success: false,
				error: 'Excel creation error',
			});
		}
	});
};

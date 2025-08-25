import generateExcel from '../helpers/helpers';
import config from '../config.json';
export default (router, { services, exceptions, env }) => {
	const { ItemsService } = services;
	const { ServiceUnavailableException } = exceptions;
	router.get('/rewardlinks/:id', async (req: any, res: any, next: any) => {
		try {
			const rewardCampaingsService = new ItemsService(config.collection.REWARD_CAMPAIGNS, {
				schema: req.schema,
				accountability: { admin: true },
			});

			const links: any = [];
			const campaignId: any = req.params.id;

			const getRewardCampaignData = await rewardCampaingsService.readByQuery({
				filter: { id: { _eq: campaignId } },
				fields: [
					'reward_links.id',
					'reward_links.value',
					'reward_links.otp',
					'name',
					'reward_links.first_name',
					'reward_links.last_name',
					'reward_links.phone',
					'reward_links.otp',
					'reward_links.email',
				],
			});

			const campaignsRewardName = getRewardCampaignData[0].name;
			getRewardCampaignData[0].reward_links.forEach((items: any) => {
				const link = config.defaults.REWARD_LINK_URL + items['id'];
				const value = items['value'];
				const otp = items['otp'];
				const first_name = items['first_name'];
				const last_name = items['last_name'];
				const phone = items['phone'];
				const email = items['email'];

				links.push({
					link,
					value,
					otp,
					first_name,
					last_name,
					phone,
					email,
				});
			});
			const helpers = new generateExcel();

			const workbook = await helpers.rewardLinkToExcel(links);

			if (workbook) {
				res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

				res.setHeader('Content-Disposition', 'attachment; filename=' + campaignsRewardName + `_rewardlinks.xlsx`);

				return workbook.xlsx.write(res).then(() => {
					res.status(200).end();
				});
			} else {
				res.send({
					success: false,
					error: 'Excel creation error',
				});
			}
		} catch (error) {
			next(new ServiceUnavailableException(error));

			logError(error, req.schema);
		}
	});
	async function logError(error: any, schema: any) {
		try {
			let error_log: any = {};
			const errorLogService = new ItemsService(config.collection.BACK_LOGS, {
				schema: schema,
				accountability: { admin: true },
			});

			error_log.log = error;
			await errorLogService.createOne({ log: error_log });
		} catch (error) {}
	}
};

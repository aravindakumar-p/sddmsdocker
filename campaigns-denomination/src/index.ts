import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }, { services, getSchema, exceptions }) => {
	const { ItemsService, UsersService } = services;
	const { ServiceUnavailableException } = exceptions;

	filter('sp_campaigns.items.create', async (input: any, { collection }, { schema, accountability }) => {
		try {
			const spCampaignsService = new ItemsService('sp_campaigns', {
				schema: schema,
				accountability: accountability,
			});

			if (input.denomination !== undefined) {
				let filterValue = input.denomination.filter((element: any) => element == 0);

				if (filterValue[0] == 0) {
					input.denomination = input.denomination.filter((element: any) => element != 0);

					throw new ServiceUnavailableException('zero will not allow in DENOMINATIONS');
				}
			}
		} catch (error) {
			logError(error, schema, accountability);

			throw new ServiceUnavailableException('zero will not allow in DENOMINATIONS');

		}
	});
	filter('sp_campaigns.items.update', async (input: any, { collection }, { schema, accountability }) => {
		try {
			const spCampaignsService = new ItemsService('sp_campaigns', {
				schema: schema,
				accountability: accountability,
			});

			if (input.denomination !== undefined) {
				let filterValue = input.denomination.filter((element: any) => element == 0);

				if (filterValue[0] == 0) {
					input.denomination = input.denomination.filter((element: any) => element != 0);

					throw new ServiceUnavailableException('zero will not allow in DENOMINATIONS');
				}
			}
		} catch (error) {
			logError(error, schema, accountability);

			throw new ServiceUnavailableException('zero will not allow in DENOMINATIONS');

		}
	});
	async function logError(error, schema, accountability) {
		try {
			let error_log = {};
			const errorLogService = new ItemsService('backend_logs', {
				schema: await getSchema(),
				accountability: { admin: true },
			});

			error_log.log = error;
			await errorLogService.createOne({ log: error_log });
		} catch (error) {}
	}
});

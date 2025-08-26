/* eslint-disable prefer-const */
import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }, { services, getSchema, exceptions }) => {
	const { ItemsService, UsersService } = services;
	const { ServiceUnavailableException,InvalidPayloadException } = exceptions;

    filter('projects.items.update', async (input: any, { keys, collection }, { schema, accountability }) => {
		try {


            const projectService = new ItemsService('projects', {
				schema: await getSchema(),
				accountability: { admin: true },
			});

           if (input.Load_wallent_balance) {
			
            const getProjectData = await projectService.readByQuery({
				filter: { project_name: { _in: keys } },
				fields: ['*'],
			});

         if (getProjectData.length !=0) {
                    
                    let wallet_balance = getProjectData[0].wallet_balance;

                        input.wallet_balance = input.Load_wallent_balance + wallet_balance;

                    
                }

           }

		} catch (error) {
            console.log("error--->",error);


		}
	});
	action('projects.items.update', async (input: any, { schema, accountability }) => {
		try {
          
            const projectsLedgerService = new ItemsService('projects_Ledger', {
				schema: await getSchema(),
				accountability: { admin: true },
			});
			if (input.payload.Load_wallent_balance) {
                await projectsLedgerService.createOne({ amount: input.payload.Load_wallent_balance,project:input.keys[0],ledger_type:'credit' });
            }
		} catch (error) {

			logError(error, schema, accountability);
		}
	});





	

	async function logError(error, schema, accountability) {
		try {
			let error_log:any = {};
			const errorLogService = new ItemsService('backend_logs', {
				schema: await getSchema(),
				accountability: { admin: true },
			});

			error_log.log = error;
			await errorLogService.createOne({ log: error_log });
		} catch (error) {}
	}
});

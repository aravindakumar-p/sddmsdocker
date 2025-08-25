import { defineEndpoint } from '@directus/extensions-sdk';
import { gettingNotification, gettingOfEmailContent, mail } from './controllers/mail';

export default defineEndpoint(async (router, { services, database, getSchema }) => {
	const schmea: any = await getSchema();
	const { ItemsService, MailService } = services;

	const mailService = new MailService({ schmea, knex: database });
	router.post(
		'/sendemail/:id',
		(req: any, res: any, next: any) => gettingOfEmailContent(req, res, next, services, schmea),
		(req: any, res: any) => mail(req, res, mailService, schmea, { admin: true }, services)
	);

	router.post('/notifications/:id', (req: any, res: any, next: any) =>
		gettingNotification(req, res, next, services, schmea)
	);
});

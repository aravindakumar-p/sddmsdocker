import { defineEndpoint } from '@directus/extensions-sdk';
import {
	getShakeOrder,
	getPeroformInvoice,
	dynamicContentPI,
	htmlMaker,
	pdfCreation,
	dynamicContentPO,
	getShakepeInvoice,
	pdfCreationShakePe,
} from './controllers/pi-creation';
import { email } from './db/setter';
export default defineEndpoint(async (router, { services, database, getSchema }) => {
	const schmea: any = await getSchema();
	router.get(
		'/po-order/:id',
		(req: any, res: any, next: any) => getShakeOrder(req, res, next, services),
		(req: any, res: any, next: any) => dynamicContentPO(req, res, next, services),
		(req: any, res: any, next: any) => htmlMaker(req, res, next, services, schmea),
		(req: any, res: any, next: any) => pdfCreation(req, res, next, services, schmea)
	);

	router.get(
		'/pi-generator/:id',
		(req: any, res: any, next: any) => getPeroformInvoice(req, res, next, services),
		(req: any, res: any, next: any) => dynamicContentPI(req, res, next, services, schmea),
		(req: any, res: any, next: any) => htmlMaker(req, res, next, services, schmea, database),
		(req: any, res: any, next: any) => pdfCreation(req, res, next, services, schmea)
	);

	router.get(
		'/shake-generator/:id',
		(req: any, res: any, next: any) => getShakepeInvoice(req, res, next, services),
		(req: any, res: any, next: any) => dynamicContentPI(req, res, next, services, schmea),
		(req: any, res: any, next: any) => htmlMaker(req, res, next, services, schmea, database),
		(req: any, res: any, next: any) => pdfCreationShakePe(req, res, next, services, schmea)
	);
	router.post('/mail', (req: any, res: any, next: any) => email(req, res, next, services));
});

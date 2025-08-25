import { defineEndpoint } from '@directus/extensions-sdk';
import { getDataFromCollection } from './db/getters';
import { logGenerator, mail } from './db/setters';
import constant from './constant.json';
import { env } from 'process';
import axios from 'axios';

export default defineEndpoint(async (router, { services, getSchema, database, accountability }) => {
	const schema = await getSchema();
	const mailService = new services.MailService({ schema, knex: database });

	router.get('/fetch-shakepe-orders-data', async (req, res) => {
		try {
			const filter = {
				_and: [
					{ payment_terms: { _eq: 'Credit' } },
					{ payment: { _eq: 'Payment Pending' } },
					{ status: { _eq: 'Order Completed' } },
				],
			};

			const fields = [
				'id',
				'payment_terms',
				'load_date',
				'actual_credit_days',
				'payment',
				'date_updated',
				'credit_days',
				'status',
				'client_email',
				'client',
			];

			const data = await getDataFromCollection(
				services,
				filter,
				constant.collections.shakepe_orders,
				-1,
				schema,
				'shakepe_orders',
				fields
			);

			function calculateDueDate(payload) {
				const credit = payload.credit_days ? payload.credit_days : payload.actual_credit_days;
				let dateUpdate = new Date(payload.date_updated.split('T')[0]);
				let creditDays = parseInt(credit);
				dateUpdate.setDate(dateUpdate.getDate() + creditDays);
				let dueDate = dateUpdate.toISOString().split('T')[0];
				let today = new Date();
				let todayFormatted = today.toISOString().split('T')[0];
				return {
					dueDate: dueDate,
					today: todayFormatted,
				};
			}

			function compareDates(dates) {
				let dueDate = new Date(dates.dueDate);
				let today = new Date(dates.today);
				let timeDifference = dueDate.getTime() - today.getTime();
				let dayDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
				return dayDifference;
			}

			const filteredData = data.filter((item) => {
				const dates = calculateDueDate(item);
				const dayDifference = compareDates(dates);
				return dayDifference <= 2;
			});

			for (const item of filteredData) {
				const dates = calculateDueDate(item);

				const mailPayload = {
					to: env.TESTING_EMAILS ? JSON.parse(env.TESTING_EMAILS) : item.client_email,
					body_data: {
						order_id: item.id,
						client_name: item.client?.client_name,
						due_date: dates.dueDate,
					},
				};
				try {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/36`, mailPayload)
						.then((response) => {
							return response
						})
						.catch((error) => {
							return error
						});
				} catch (emailError) {
					logGenerator(
						emailError,
						constant.log_type.error,
						constant.collection_name.santa_log,
						schema,
						{ admin: true },
						services
					);
				}
			}

			res.status(200).json({ data: filteredData, message: 'Emails sent to clients.' });
		} catch (error) {
			logGenerator(
				error,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{ admin: true },
				services
			);
			res.status(500).json({ error: 'An error occurred while fetching data or sending emails.' });
		}
	});

	router.get('/fetch-corporate-load-data', async (req, res) => {
		try {
			const filter = {
				_and: [{ payment_terms: { _eq: 'credit' } }, { payment_status: { _eq: 'pending' } }],
			};

			const fields = ['client_name', 'date_updated', 'payment_terms', 'payment_status', 'user_created.email'];

			const data = await getDataFromCollection(
				services,
				filter,
				constant.collections.corporate_load,
				-1,
				schema,
				'corporate_load',
				fields
			);

			function calculateDueDate(payload) {
				const credit = payload.credit_date ? payload.credit_date : payload.actual_credit_date;
				let dateUpdate = new Date(payload.date_updated.split('T')[0]);
				let creditDays = parseInt(credit);
				dateUpdate.setDate(dateUpdate.getDate() + creditDays);
				let dueDate = dateUpdate.toISOString().split('T')[0];
				let today = new Date();
				let todayFormatted = today.toISOString().split('T')[0];
				return {
					dueDate: dueDate,
					today: todayFormatted,
				};
			}

			function compareDates(dates) {
				let dueDate = new Date(dates.dueDate);
				let today = new Date(dates.today);
				let timeDifference = dueDate.getTime() - today.getTime();
				let dayDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
				return dayDifference;
			}

			const filteredData = data.filter((item) => {
				const dates = calculateDueDate(item);
				const dayDifference = compareDates(dates);
				return dayDifference <= 2;
			});

			for (const item of filteredData) {
				const dates = calculateDueDate(item);

				const mailPayload = {
					to: env.TESTING_EMAILS ? env.TESTING_EMAILS : item.client_email,
					bcc: env.TESTING_EMAILS,
					body_data: {
						order_id: item.id,
						client_name: item.client?.client_name,
						due_date: dates.dueDate,
						amount: item.amount,
					},
				};

				try {
					axios
						.post(`${env.CURRENT_URL}email/sendemail/36`, mailPayload)
						.then((response) => {
							return response;
						})
						.catch((error) => {
							return error;
						});
				} catch (emailError) {
					logGenerator(
						emailError,
						constant.log_type.error,
						constant.collection_name.santa_log,
						schema,
						{ admin: true },
						services
					);
				}
			}

			res.status(200).json({ data: filteredData, message: 'Emails sent to clients.' });
		} catch (error) {
			logGenerator(
				error,
				constant.log_type.error,
				constant.collection_name.santa_log,
				schema,
				{ admin: true },
				services
			);
			res.status(500).json({ error: 'An error occurred while fetching data or sending emails.' });
		}
	});
});

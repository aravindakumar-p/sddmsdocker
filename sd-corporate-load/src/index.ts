import { createOne, createOneNoEmit, updateOneNoEmit } from './db/setter';
/* eslint-disable no-case-declarations */
import { defineHook } from '@directus/extensions-sdk';
import constant from './constant.json';
import axios from 'axios';
import { env } from 'process';
import { getDataFromCollection } from './db/getter';

export default defineHook(async ({ filter, action }, { services, exceptions, database, getSchema }) => {
	const { InvalidPayloadException } = exceptions;
	const schema = await getSchema();

	filter('corporate_load.items.create', (payload: any, meta: any, context: any) => {
		if (payload.payment_mode != 'payment_gateway') {
			switch (payload.transaction_type) {
				case 'reload':
					if (!payload?.payment_terms) {
						payload.status = null;
						payload.payment_status = 'received';
						return payload;
					} else if (payload.payment_terms == 'credit') {
						payload.status = 'pending';
						payload.payment_status = 'received';
						return payload;
					}

					return payload;
				case 'cashback':
					payload.status = 'pending';
					return payload;

				case 'debit':
					payload.status = 'pending';
					return payload;
				default:
					break;
			}
		} else {
			return payload;
		}
	});
	action('corporate_load.items.create', async ({ event, payload, key, collection }, context: any) => {
		if (payload.payment_mode != 'payment_gateway') {
			const filterManagement = {
				id: {
					_eq: env.MANAGAMENT_ROLE,
				},
			};
			const idmanagement = await getDataFromCollection(
				services,
				filterManagement,
				['users.email', 'users.id'],
				schema,
				'directus_roles'
			);

			const management = idmanagement[0]?.users.map((user: any) => user.email);
			const managementIds = idmanagement[0]?.users.map((user: any) => user.id);

			const uploadedFiles = payload?.upload_documents?.create || [];
			const attachments = await Promise.all(
				uploadedFiles.map(async (file: any) => {
					const directusFilesId = file.directus_files_id?.id;
					const filter = {
						id: {
							_eq: directusFilesId,
						},
					};
					const fields = constant?.collections?.directus_files;
					const filesDataName = await getDataFromCollection(services, filter, fields, schema, 'directus_files');
					const fileName = filesDataName[0]?.filename_download;

					return {
						id: directusFilesId,
						filename: `${fileName}`,
					};
				})
			);

			const clientFields = constant.collections.client;
			const pocFields = constant.collections.poc;
			const clientfilter = {
				id: {
					_eq: payload?.client_name,
				},
			};
			const pocfilter = {
				id: {
					_eq: payload?.poc,
				},
			};
			const client = await getDataFromCollection(services, clientfilter, clientFields, schema, 'client');
			const poc = await getDataFromCollection(services, pocfilter, pocFields, schema, 'client_point_of_contact');

			const baseData = {
				to: management,
				users: managementIds,

				subject_data: {
					poc: poc[0],
					id: key,
					client_name: client[0].client_name,
					payload: payload,
					url: env.CURRENT_URL + 'admin/content/corporate_load/' + key,
				},
				body_data: {
					poc: poc[0],
					client_name: client[0].client_name,
					payload: payload,
					id: key,
					url: env.CURRENT_URL + 'admin/content/corporate_load/' + key,
				},
				item: key,
				attachments: attachments,
			};

			switch (payload.transaction_type) {
				case 'reload':
					if (!payload?.payment_terms) {
						const id = await createOne(
							services,
							'payment_verify',
							{
								amount: payload.amount,
								utr_number: payload.utr,
								payment_date: payload.date_of_payment,
								status: 'received',
								corporate_load: key,
								upload: {
									create: payload?.upload_documents?.create.map((e) => {
										return {
											payment_verify_id: '+',
											directus_files_id: {
												id: e.directus_files_id?.id,
											},
										};
									}),
									update: [],
									delete: [],
								},
							},
							schema,
							context.accountability
						);
					} else if (payload.payment_terms === 'credit') {
						await axios.post(`${env.CURRENT_URL}email/sendemail/46`, baseData);
						await axios.post(`${env.CURRENT_URL}email/notifications/50`, baseData);
					}
					break;
				case 'debit':
					await axios.post(`${env.CURRENT_URL}email/sendemail/46`, baseData);
					await axios.post(`${env.CURRENT_URL}email/notifications/50`, baseData);
					break;
				case 'cashback':
					await axios.post(`${env.CURRENT_URL}email/sendemail/46`, baseData);
					await axios.post(`${env.CURRENT_URL}email/notifications/50`, baseData);
					break;
				default:
					break;
			}
		}
	});

	filter('payment_verify.items.create', async (payload: any, meta: any, context: any) => {
		const data = await getDataFromCollection(
			services,
			{
				id: {
					_eq: payload.corporate_load,
				},
			},
			['client_name.*', '*', 'payment_details.*'],
			schema,
			'corporate_load'
		);
		if (data[0].transaction_type == 'reload' && data[0].payment_terms == 'credit') {
			const totalAmount = data[0].payment_details
				.filter((item: any) => item.status === 'received' || item.status === 'verified')
				.reduce((sum: any, item: any) => sum + item.amount, 0);
			if (totalAmount + payload?.amount > data[0].amount) {
				throw new InvalidPayloadException('Enter value is greater than order value');
			}
		}

		payload.status = 'received';
		return payload;
	});
	action('payment_verify.items.create', async ({ event, payload, key, collection }, context: any) => {
		try {
			const data = await getDataFromCollection(
				services,
				{
					id: {
						_eq: payload.corporate_load,
					},
				},
				['client_name.*', '*', 'upload_documents.*', 'client_name.poc[0].*'],
				schema,
				'corporate_load'
			);

			const filterAccounts = {
				id: {
					_eq: env.ACCOUNT_ROLE,
				},
			};
			const idaccounts = await getDataFromCollection(
				services,
				filterAccounts,
				['users.email', 'users.id'],
				schema,
				'directus_roles'
			);
			const accounts = idaccounts[0]?.users.map((user: any) => user.email);
			const accountsIds = idaccounts[0]?.users.map((user: any) => user.id);
			const uploadedFiles = data[0]?.upload_documents || [];

			const pocFields = constant.collections.poc;

			const pocfilter = {
				id: {
					_eq: data[0].poc,
				},
			};

			const poc = await getDataFromCollection(services, pocfilter, pocFields, schema, 'client_point_of_contact');

			const attachments = await Promise.all(
				uploadedFiles.map(async (file: any) => {
					const directusFilesId = file.directus_files_id;
					const filter = {
						id: {
							_eq: directusFilesId,
						},
					};
					const fields = constant?.collections?.directus_files;
					const filesDataName = await getDataFromCollection(services, filter, fields, schema, 'directus_files');
					const fileName = filesDataName[0]?.filename_download;
					return {
						id: directusFilesId,
						filename: `${fileName}`,
					};
				})
			);
			const baseData = {
				to: accounts,
				users: accountsIds,
				subject_data: {
					poc: poc[0],
					id: key,
					payload: payload,
					client_name: data[0].client_name.client_name,
					data: data[0],
					url: env.CURRENT_URL + 'admin/content/payment_verify/' + key,
				},
				body_data: {
					poc: poc[0],
					payload: payload,
					client_name: data[0].client_name.client_name,
					data: data[0],
					id: key,
					url: env.CURRENT_URL + 'admin/content/payment_verify/' + key,
				},
				item: key,
				attachments: attachments,
			};

			await axios.post(`${env.CURRENT_URL}email/sendemail/9`, baseData);
			await axios.post(`${env.CURRENT_URL}email/notifications/51`, baseData);
		} catch (error) {}
	});
});

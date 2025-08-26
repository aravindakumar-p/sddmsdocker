import { defineEndpoint } from '@directus/extensions-sdk';
import { createOne, createOneNoEmit, logGenerator, updateBatch, updateOne } from './db/setters';
import constant from './constant.json';
import { getDataFromCollection } from './db/getters';
import { env } from 'process';
import axios from 'axios';

export default defineEndpoint(async (router, { services, getSchema, database }) => {
	const schema = await getSchema();
	const { ItemsService } = services;

	const authMiddleware = async (req: any, res: any, next: any) => {
		if (req.token) {
			const user = await database
				.select('directus_users.id', 'directus_users.role', 'directus_roles.admin_access', 'directus_roles.app_access')
				.from('directus_users')
				.leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
				.where({
					'directus_users.token': req.token,
					status: 'active',
				})
				.first();
			logGenerator(
				{
					user: user,
				},
				constant.log_type.log,
				constant.collection_name.santa_log,
				schema,
				{
					admin: true,
				},
				services
			);
			if (!user.role && !user.admin_access && !user.app_access) {
				res.status(401).send({
					errors: [
						{
							message: constant.messages.invaildCredentials,
							extensions: {
								code: constant.code_error.INVALID_CREDENTIALS,
							},
						},
					],
				});
			} else {
				req.accountability.user = user.id;
				req.accountability.role = user.role;
				req.accountability.admin = user.admin_access === true || user.admin_access == 1;
				req.accountability.app = user.app_access === true || user.app_access == 1;
				next();
			}
		} else {
			res.status(401).send({
				errors: [
					{
						message: constant.messages.invaildCredentials,
						extensions: {
							code: constant.code_error.INVALID_CREDENTIALS,
						},
					},
				],
			});
		}
	};
	router.get('/clientdetails', authMiddleware, async (req: any, res: any) => {
		try {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
				},
				constant.log_type.log,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			if (req.query.email) {
				const email = await getDataFromCollection(
					services,
					{
						email: {
							_eq: req.query.email,
						},
					},
					[
						'id',
						'phone_number',
						'email',
						'name',
						'mode',
						'client_id.id',
						'client_id.client_email',
						'client_id.client_name',
						'client_id.pan_number',
						'client_id.company_website',
						'client_id.company_linkedin_profile',
						'client_id.status',
						'client_id.product_type_mapping.id',
						'client_id.product_type_mapping.payment_terms',
						'client_id.product_type_mapping.discount',
						'client_id.product_type_mapping.commerical',
						'client_id.product_type_mapping.product_type.*',
						'client_id.product_type_mapping.id',
						'client_id.client_address_details.client_address_id.*',
						'client_id.diy_status',
						'wallet',
						'client_id.comments',
					],
					1,
					schema,
					'client_point_of_contact'
				);
				if (email.length > 0) {
					const client_address = email[0].client_id.client_address_details.map((client_address_id: any) => {
						const address = client_address_id.client_address_id;
						return {
							id: address.id,
							billing_address_1: address.billing_address_1,
							billing_address_2: address.billing_address_2,
							billing_pincode: address.billing_pincode,
							billing_city: address.billing_city,
							billing_state: address.billing_state,
							billing_country: address.billing_country,
							gstin: address.gstin,
						};
					});
					const data = {
						id: email[0].id,
						phone_number: email[0].phone_number,
						mode: email[0].mode,
						email: email[0].email,
						name: email[0].name,
						wallet_balance: email[0].wallet,
						client_id: email[0].client_id.id,
						client_email: email[0].client_id.client_email,
						client_name: email[0].client_id.client_name,
						pan_number: email[0].client_id.pan_number,
						status: email[0].client_id.status,
						company_website: email[0].client_id.company_website,
						company_linkedin_profile: email[0].client_id.company_linkedin_profile,
						product_mapping: email[0].client_id.product_type_mapping,
						client_address: client_address,
						diy_status: email[0].client_id.diy_status,
						decline_comments: email[0].client_id.comments,
					};

					logGenerator(
						{
							data: data,
						},
						constant.log_type.log,
						constant.collection_name.diy_log,
						schema,
						{
							admin: true,
						},
						services
					);
					res.status(200).json(data);
				} else {
					res.status(200).json([]);
				}
			} else {
				throw {
					error: 'Email Should be there for it',
				};
			}
		} catch (error) {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
					error: error,
				},
				constant.log_type.error,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			res.status(400).send({ errorMessage: 'Something Went Wrong', error: error });
		}
	});
	router.get('/transactions', authMiddleware, async (req: any, res: any) => {
		try {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
				},
				constant.log_type.log,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			const { poc, limit, page } = req.query;
			if (poc && limit && page) {
				const { ItemsService } = services;
				const collectionData = new ItemsService('cpp_ledger', { schema: schema, accountability: { admin: true } });
				const itemsData = await collectionData.readByQuery({
					filter: {
						poc_id: {
							_eq: poc,
						},
					},
					fields: [
						'status',
						'order_id.id',
						'order_id.filtering_with_product_type',
						'date_created',
						'amount',
						'debit_amount',
						'client_id',
						'poc_id',
						'closing_balance',
						'opening_balance',
						'load_id',
						'load_id.id',
						'load_id.utr',
						'load_id.payment_mode',
					],
					limit: parseInt(limit),
					page: page,
					sort: ['-date_created'],
				});

				const count = await collectionData.readByQuery({
					filter: {
						poc_id: {
							_eq: poc,
						},
					},
					aggregate: {
						countDistinct: ['id'],
					},
				});
				logGenerator(
					{
						data: itemsData,
					},
					constant.log_type.log,
					constant.collection_name.diy_log,
					schema,
					{
						admin: true,
					},
					services
				);
				res.status(200).send({
					data: {
						data: itemsData,
						total_count: count[0].countDistinct.id,
					},
				});
			} else {
				res.status(401).send({ message: 'POC ,  Limit , Page is required params' });
			}
		} catch (error) {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
					error: error,
				},
				constant.log_type.error,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			res.status(400).send({ errorMessage: 'Something Went Wrong', error: error });
		}
	});
	router.post('/orders', authMiddleware, async (req: any, res: any) => {
		try {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
				},
				constant.log_type.log,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			const { clientId, productType, denomination, totalNoLinks, totalAmount, campaign } = req.body;
			if (clientId && productType && denomination && totalNoLinks && totalAmount && campaign) {
				const client = await getDataFromCollection(
					services,
					{
						_and: [
							{
								client_id: {
									_eq: req.body.clientId,
								},
							},
							{
								product_type: {
									_eq: req.body.productType,
								},
							},
						],
					},
					['id', 'discount'],
					1,
					schema,
					'client_product_mapping'
				);

				const order = await createOne(
					services,
					'shakepe_orders',
					{
						client: req.body.clientId,
						product_type: client[0].id,
						poc: req.body.poc,
						commerical: 'Upfront',
						discount: client[0]?.discount,
						filtering_with_product_type: 'Links',
						link_type: 'Catalogue',
						catalog_links_orders: {
							create: [
								{
									denomination: req.body.denomination,
									total_no_links: req.body.totalNoLinks,
								},
							],
							update: [],
							delete: [],
						},
						total_order_value: parseFloat(req.body.totalAmount),
						original_value: parseFloat(req.body.totalAmount - (req.body.totalAmount * client[0]?.discount) / 100),
						type: 'DIY',
						payment: 'Payment Received',
						status: 'Order Completed',
						campaign_id: req.body.campaign,
						payment_terms: 'Advance',
					},
					schema,
					{ admin: true }
				);
				if (order.message) {
					logGenerator(
						{
							error: order.message,
						},
						constant.log_type.error,
						constant.collection_name.diy_log,
						schema,
						{
							admin: true,
						},
						services
					);

					res.status(402).send({ message: order.message });
				} else {
					req.order = order;
					const campaignResponse = await axios.post(env.CAMPAIGN_URL + '/reward/diy-link', {
						rewardCampaignIds: [campaign],
					});

					logGenerator(
						{
							message: campaignResponse.data,
						},
						constant.log_type.success,
						constant.collection_name.diy_log,
						schema,
						{
							admin: true,
						},
						services
					);
					res.status(201).send({
						order_id: order,
						campaign_response: campaignResponse.data,
					});
				}
			} else {
				logGenerator(
					{
						body: req.body,
						header: req.headers,
						query: req.query,
					},
					constant.log_type.log,
					constant.collection_name.diy_log,
					schema,
					{
						admin: true,
					},
					services
				);
				res.status(400).send({ message: 'Required Parameters are not there' });
			}
		} catch (error) {
			logGenerator(
				{
					body: req.body,
					header: req.headers,
					query: req.query,
					error: error,
				},
				constant.log_type.error,
				constant.collection_name.diy_log,
				schema,
				{
					admin: true,
				},
				services
			);
			if (req.order) {
				const order = await updateOne({ status: 'Order Cancelled' }, 'shakepe_orders', services, req.order, schema, {
					admin: true,
				});
				res.status(400).send({
					errorMessage: 'Something Went Wrong',
					error: {
						body: req.body,
						header: req.headers,
						query: req.query,
						error: error,
						order: req.order,
						order_status: 'Cancelled',
					},
				});
			}
			res.status(400).send({ errorMessage: 'Something Went Wrong', error: error });
		}
	});
	router.post('/clientdetails', authMiddleware, async (req: any, res: any) => {
		logGenerator(
			{
				data: req.body,
				client: 'Create',
			},
			constant.log_type.log,
			constant.collection_name.diy_log,
			schema,
			{
				admin: true,
			},
			services
		);
		const {
			pan_number,
			client_email,
			client_name,
			company_website,
			company_linkedin_profile,
			client_address_details,
			poc,
		} = req.body;
		if (pan_number && client_email) {
			const email = await getDataFromCollection(
				services,
				{
					_or: [
						{
							email: {
								_eq: req.body.client_email,
							},
						},
						{
							email: {
								_eq: req.body.pan_number,
							},
						},
					],
				},
				['id'],
				1,
				schema,
				'client_point_of_contact'
			);
			if (email.length > 0) {
				res.status(403).json({ message: 'Email or Pan Number is already registered' });
			} else {
				const brand_details = await getDataFromCollection(
					services,
					{
						_and: [
							{
								status: {
									_eq: 'active',
								},
							},
						],
					},
					['id'],
					-1,
					schema,
					'sd_brand_details'
				);

				const data = {
					client_name: client_name,
					client_type: 'Corporate',
					client_email: client_email,
					pan_number: pan_number,
					company_website: company_website,
					company_linkedin_profile: company_linkedin_profile,
					source: 'diy',
					diy_status: 'not_verified',
					product_type_mapping: {
						create: [
							{
								product_type: 6,
								product: 'Links',
								commerical: 'Upfront',
								payment_terms: 'Advance',
								discount: 0,
								full_fillment: 'SMS',
								avenues: 'Avenues',
								brands: {
									create: brand_details?.map((brand: any) => {
										return {
											client_product_mapping_id: '+',
											sd_brand_details_id: {
												id: brand.id,
											},
										};
									}),
									update: [],
									delete: [],
								},
							},
						],
						update: [],
						delete: [],
					},
					client_address_details: {
						create: [
							{
								client_address_id: client_address_details.client_address_id,
							},
						],
						update: [],
						delete: [],
					},
					poc: {
						create: [poc],
						update: [],
						delete: [],
					},
				};
				const client = await createOneNoEmit(services, 'client', data, schema, {
					admin: true,
					user: req.accountability.user,
				});
				if (client?.error) {
					res.status(403).send({ message: 'Error Occured At Time of Client Creations', client_id: client });
				} else {
					res.status(201).send({ message: 'Client Create Successfully', client_id: client });
				}
			}
		}
	});
	router.patch('/pocupdate', authMiddleware, async (req: any, res: any) => {
		logGenerator(
			{
				data: req.body,
				poc: 'Update',
			},
			constant.log_type.log,
			constant.collection_name.diy_log,
			schema,
			{
				admin: true,
			},
			services
		);
		const { name, phone_number, id } = req.body;
		if (id && (name || phone_number)) {
			const result = await updateOne(req.body, 'client_point_of_contact', services, id, schema, {
				admin: true,
				user: req.accountability.user,
			});
			if (result[0]?.status) {

				res.status(403).json(result);
			} else {

				res.status(200).json(result);
			}
		} else {
			res.status(403).json({ message: 'Fields are missing' });
		}
	});
	router.post('/walletload', authMiddleware, async (req: any, res: any) => {
		const { client_name, poc, amount, utr, date_of_payment } = req.body;
		logGenerator(
			{
				data: req.body,
				wallet: 'create',
			},
			constant.log_type.log,
			constant.collection_name.diy_log,
			schema,
			{
				admin: true,
			},
			services
		);
		if (client_name && poc && amount && utr && date_of_payment) {
			const result = await createOne(services, 'corporate_load', req.body, schema, {
				admin: true,
				user: req.accountability.user,
			});
			if (result[0]?.status) {
				res.status(403).json(result);
			} else {
				res.status(200).json(result);
			}
		} else {
			res.status(403).json({ message: 'Fields are missing' });
		}
	});
	router.patch("/clientdetails", authMiddleware, async (req: any, res: Response) => {
		const clientserviceData = new ItemsService('client', { schema: schema, accountability: { admin: true } });
		const updateAddressData = new ItemsService('client_address', { schema: schema, accountability: { admin: true } });
		const updatePOCData = new ItemsService('client_point_of_contact', { schema: schema, accountability: { admin: true } });

		try {

			const {
				id,
				company_website,
				company_linkedin_profile,
				pan_number,
				client_name,
				client_point_of_contact,
				client_address_details,
			} = req.body;

			if (!id) res.status(400).json({ message: "Client ID is required." });
			if (!client_address_details && !client_point_of_contact && !company_website &&
				!company_linkedin_profile && !pan_number && !client_name
			) {
				res.status(400).json({ message: "At least one update field is required." });
			}
			const client = await clientserviceData.readByQuery({
				fields: ["diy_status", "client_address_details.*", "poc.*"],
				filter: {
					_and:
						[
							{
								id:
								{
									_eq: id
								}
							}
						]
				}
			});
			if (client.length === 0) {
				res.status(404).json({ message: "Client not found" });
			}

			const existingClient = client[0];
			const updateClientData: any = {
				...(company_website && { company_website }),
				...(company_linkedin_profile && { company_linkedin_profile }),
				...(pan_number && { pan_number }),
				...(client_name && { client_name }),
			};

			const addressUpdateResults: any = client_address_details.map(async (address: any) => {
				const updatedAddress = { ...address };
				delete updatedAddress.id;
				return await updateAddressData.updateOne(address.id, updatedAddress);
			})

			const updatePocDetails: any = client_point_of_contact.map(async (poc: any) => {
				let updatedPOC = { ...poc };
				delete updatedPOC.id;
				return await updatePOCData.updateOne(poc.id, updatedPOC);
			})

			if (existingClient.diy_status === "declined") {
				updateClientData.diy_status = "not_verified";
				updateClientData.comments = null;
			}

			let clientUpdateResult = await updateOne(updateClientData, "client", services, id, schema, {
				admin: true,
				user: req.accountability.user,
			})
			
			res.status(200).json({
				message: "Client details, address, and POC updated successfully",
				clientUpdate: updateClientData ? updateClientData : null,
				addressUpdate: addressUpdateResults.length > 0 ? addressUpdateResults : null,
				pocUpdate: updatePocDetails.length > 0 ? updatePocDetails : null
			});
			
		} catch (error) {
			res.status(500).json({ message: "Error updating client details", error });
		}
	});


});

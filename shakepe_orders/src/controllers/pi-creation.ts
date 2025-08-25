import { Readable } from 'node:stream';
import { getDataFromCollection } from '../db/getter';
import config from '../config.json';
import { errorLoggingPost } from '../helpers/logger';
import fse from 'fs-extra';
import path from 'path';
import { Liquid } from 'liquidjs';
import { env } from 'process';
import { formatDate, convertToIndianRupees } from '../helpers/common';
import { toArray } from '@directus/shared/utils';
import axios from 'axios';
import { createOne, updateOne } from '../db/setter';
import numWords from 'num-words';

export const getPeroformInvoice = async (req: any, res: any, next: any, services: any) => {
	try {
		const filter = {
			id: {
				_eq: req.params.id,
			},
		};
		const fields = config.fields.proform_invoice;
		const data = await getDataFromCollection(services, filter, fields, req, config.collections.proform_invoice);

		req.proform_invoice = data;
		req.order_type = 'perform';
		req.data_order_type = 'perform';

		next();
	} catch (error) {
		res.status(200).send({ error: error });
		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};

export const getShakepeInvoice = async (req: any, res: any, next: any, services: any) => {
	try {
		const filter = {
			id: {
				_eq: req.params.id,
			},
		};
		const fields = config.fields.proform_invoice;
		const data = await getDataFromCollection(services, filter, fields, req, config.collections.shakepe_orders);

		req.proform_invoice = data;
		req.order_type = 'shakepe';
		req.data_order_type = 'shakepe_orders_data';
		next();
	} catch (error) {
		res.status(200).send({ error: error });
		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};
export const dynamicContentPI = async (req: any, res: any, next: any, services: any, schmea: any) => {
	try {
		const data = req.proform_invoice;

		if (
			data[0]?.filtering_with_product_type == 'General Purpose Reloadable Prepaid Cards' ||
			data[0]?.filtering_with_product_type == 'ShakePe Points'
		) {
			req.content = {
				service_amount: convertToIndianRupees(data[0]?.service_fee ? data[0]?.service_amount : 0),
				service_fee: data[0]?.service_fee ? data[0]?.service_amount : 0,
				final_value: convertToIndianRupees(
					data[0]?.total_value
						? data[0]?.total_value
						: data[0]?.original_value
						? data[0]?.original_value
						: data[0].total_value_cashback
				),
				payment_terms: data[0].payment_terms,
				data: data,
				payment_received: data[0].payment_received,
				created_date: formatDate(new Date(data[0].date_updated)),
				user_created: data[0].user_created.first_name,
				shipping_address: data[0]?.shipping_address,
				load_amount: convertToIndianRupees(data[0]?.load_amount),
				total_value: convertToIndianRupees(
					data[0]?.total_value
						? data[0]?.total_value - (data[0]?.service_fee ? data[0].service_amount : 0)
						: data[0]?.original_value
						? data[0]?.original_value - (data[0]?.service_fee ? data[0].service_amount : 0)
						: data[0].total_value_cashback - (data[0]?.service_fee ? data[0].service_amount : 0)
				),
				num_words: data[0].remaining_amount
					? convertToRupeeWords(data[0]?.remaining_amount)
					: convertToRupeeWords(
							data[0]?.total_value
								? data[0]?.total_value
								: data[0]?.original_value
								? data[0]?.original_value
								: data[0].total_value_cashback
					  ),
				id: req.params.id,
				buyer_ref_number: data[0].buyer_ref_number,
				discount_zero:
					data[0]?.add_or_reduce_discount && data[0].order_level_discount != 0
						? false
						: data[0].discount == 0
						? true
						: false,
				cashback: convertToIndianRupees(data[0]?.cashback),
				company_name: env.OP_COMMERCE,
				company_address: env.OP_ADDRESS,
				company_state: env.OP_STATE,
				company_state_code: env.OP_STATE_CODE,
				company_gstin: env.GSTIN_COMPANY,
				company_email: env.OP_EMAIL,
				order_type: req.order_type,
			};
			req.template = 'pi-receipt';
			req.pdfName = data[0]?.version
				? 'PI_' + req.params.id + '_SHAKEPE_V_' + (parseInt(data[0].version) + 1)
				: 'PI_' + req.params.id + '_SHAKEPE_V_1';

			next();
		} else if (data[0]?.filtering_with_product_type == 'Vouchers') {
			req.content = {
				tableContact: data[0].brand_sku_mapping_voucher.map((brand: any) => {
					return {
						...brand,
						denomination_str: convertToIndianRupees(brand.denomination, false),
					};
				}),
				service_amount: convertToIndianRupees(data[0]?.service_fee ? data[0]?.service_amount : 0),
				final_value: convertToIndianRupees(
					data[0]?.total_value
						? data[0]?.total_value
						: data[0]?.original_value
						? data[0]?.original_value
						: data[0].total_value_cashback
				),
				payment_terms: data[0].payment_terms,
				data: data,
				buyer_ref_number: data[0].buyer_ref_number,
				service_fee: data[0]?.service_fee ? data[0]?.service_amount : 0,
				discount_zero: data[0].brand_sku_mapping_voucher.every((brand: any) => {
					if (brand.add_or_reduce_discount) {
						return brand.order_level_discount == 0;
					} else {
						return brand.actual_discount == 0;
					}
				}),
				created_date: formatDate(new Date(data[0].date_updated)),
				user_created: data[0].user_created.first_name,
				shipping_address: data[0]?.shipping_address,
				num_words: data[0].remaining_amount
					? convertToRupeeWords(data[0]?.remaining_amount)
					: convertToRupeeWords(
							data[0]?.total_value
								? data[0]?.total_value
								: data[0]?.original_value
								? data[0]?.original_value
								: data[0].total_value_cashback
					  ),
				id: req.params.id,
				cashback: convertToIndianRupees(data[0]?.cashback),
				company_name: env.OP_COMMERCE,
				company_address: env.OP_ADDRESS,
				company_state: env.OP_STATE,
				company_state_code: env.OP_STATE_CODE,
				company_gstin: env.GSTIN_COMPANY,
				company_email: env.OP_EMAIL,
				order_type: req.order_type,
			};
			req.template = 'pi-vouchers';
			req.pdfName = data[0]?.version
				? 'PI_' + req.params.id + '_SHAKEPE_V_' + (parseInt(data[0].version) + 1)
				: 'PI_' + req.params.id + '_SHAKEPE_V_1';

			next();
		} else if (data[0]?.filtering_with_product_type == 'Gift Card') {
			req.content = {
				tableContact: data[0].brand_sku_mapping.map((brand: any) => {
					return {
						...brand,
						denomination_str: convertToIndianRupees(brand?.gift_card_order_details_id?.denomination, false),
						denomination: brand?.gift_card_order_details_id?.denomination,
						actual_discount: brand?.gift_card_order_details_id?.actual_discoubt,
						brand_name: brand?.gift_card_order_details_id?.brand_name,
						order_level_discount: brand?.gift_card_order_details_id?.order_level_discount,
						add_or_reduce_discount: brand?.gift_card_order_details_id?.add_or_reduce,
						quantity: brand?.gift_card_order_details_id?.quantity,
					};
				}),
				service_amount: convertToIndianRupees(data[0]?.service_fee ? data[0]?.service_amount : 0),
				final_value: convertToIndianRupees(
					data[0]?.total_value
						? data[0]?.total_value
						: data[0]?.original_value
						? data[0]?.original_value
						: data[0].total_value_cashback
				),
				payment_terms: data[0].payment_terms,
				buyer_ref_number: data[0].buyer_ref_number,
				data: data,
				discount_zero: data[0].brand_sku_mapping.every((brand: any) => {
					if (brand.gift_card_order_details_id.add_or_reduce) {
						return brand.gift_card_order_details_id.order_level_discount == 0;
					} else {
						brand.gift_card_order_details_id.actual_discoubt == 0;
					}
				}),
				created_date: formatDate(new Date(data[0].date_updated)),
				user_created: data[0].user_created.first_name,
				shipping_address: data[0]?.shipping_address,
				num_words: data[0].remaining_amount
					? convertToRupeeWords(data[0]?.remaining_amount)
					: convertToRupeeWords(
							data[0]?.total_value
								? data[0]?.total_value
								: data[0]?.original_value
								? data[0]?.original_value
								: data[0].total_value_cashback
					  ),
				id: req.params.id,
				service_fee: data[0]?.service_fee ? data[0]?.service_amount : 0,
				cashback: convertToIndianRupees(data[0]?.cashback),
				company_name: env.OP_COMMERCE,
				company_address: env.OP_ADDRESS,
				company_state: env.OP_STATE,
				company_state_code: env.OP_STATE_CODE,
				company_gstin: env.GSTIN_COMPANY,
				company_email: env.OP_EMAIL,
				order_type: req.order_type,
			};
			req.template = 'pi-vouchers';
			req.pdfName = data[0]?.version
				? 'PI_' + req.params.id + '_SHAKEPE_V_' + (parseInt(data[0].version) + 1)
				: 'PI_' + req.params.id + '_SHAKEPE_V_1';

			next();
		} else if (
			data[0]?.filtering_with_product_type == 'Links' ||
			data[0]?.filtering_with_product_type == 'ShakePe Codes'
		) {
			req.content = {
				tableContact:
					data[0]?.link_type == 'Generic'
						? data[0].generic_links_details.map((links: any) => {
								return {
									...links,
									denomination_str: convertToIndianRupees(links.denomination, false),
									denomination: links.denomination,
									quantity: links.quantity,
									brand_name: 'Santa Links (Generic)',
									actual_discount: data[0]?.add_or_reduce_discount ? data[0].order_level_discount : data[0].discount,
								};
						  })
						: data[0]?.filtering_with_product_type == 'ShakePe Codes'
						? data[0]?.shakepe_codes_orders.map((codes: any) => {
								return {
									...codes,
									denomination_str: convertToIndianRupees(codes.value_of_code),
									denomination: codes.value_of_code,
									quantity: codes.total_no_of_codes,
									brand_name: 'ShakePe Codes',
									actual_discount: data[0]?.add_or_reduce_discount ? data[0].order_level_discount : data[0].discount,
								};
						  })
						: data[0].catalog_links_orders.map((links: any) => {
								return {
									...links,
									denomination_str: convertToIndianRupees(links.denomination, false),
									quantity: links.total_no_links,
									denomination: links.denomination,

									brand_name: 'Santa Links (Catalogue)',
									actual_discount: data[0]?.add_or_reduce_discount ? data[0].order_level_discount : data[0].discount,
								};
						  }),
				service_amount: convertToIndianRupees(data[0]?.service_fee ? data[0]?.service_amount : 0),
				final_value: convertToIndianRupees(
					data[0]?.total_value
						? data[0]?.total_value
						: data[0]?.original_value
						? data[0]?.original_value
						: data[0].total_value_cashback
				),
				payment_terms: data[0].payment_terms,
				data: data,
				service_fee: data[0]?.service_fee ? data[0]?.service_amount : 0,

				discount_zero:
					data[0]?.add_or_reduce_discount && data[0].order_level_discount != 0
						? false
						: data[0].discount == 0
						? true
						: false,

				created_date: formatDate(new Date(data[0].date_updated)),
				user_created: data[0].user_created.first_name,
				shipping_address: data[0]?.shipping_address,
				buyer_ref_number: data[0].buyer_ref_number,
				num_words: data[0].remaining_amount
					? convertToRupeeWords(data[0]?.remaining_amount)
					: convertToRupeeWords(
							data[0]?.total_value
								? data[0]?.total_value
								: data[0]?.original_value
								? data[0]?.original_value
								: data[0].total_value_cashback
					  ),
				id: req.params.id,
				cashback: convertToIndianRupees(data[0]?.cashback),
				company_name: env.OP_COMMERCE,
				company_address: env.OP_ADDRESS,
				company_state: env.OP_STATE,
				company_state_code: env.OP_STATE_CODE,
				company_gstin: env.GSTIN_COMPANY,
				company_email: env.OP_EMAIL,
				order_type: req.order_type,
			};
			req.template = 'pi-vouchers';
			req.pdfName = data[0]?.version
				? `${req.data_order_type != 'shakepe_orders_data' ? 'PI_' : 'SP_'}` +
				  req.params.id +
				  '_SHAKEPE_V_' +
				  (parseInt(data[0].version) + 1)
				: `${req.data_order_type != 'shakepe_orders_data' ? 'PI_' : 'SP_'}` + req.params.id + '_SHAKEPE_V_1';

			next();
		} else {
			res.status(200).send({ status: 'Not Developed' });
		}
	} catch (error) {
		res.status(200).send({ error: error });
	}
};

export const htmlMaker = async (req: any, res: any, next: any, services: any, schema: any, database?: any) => {
	try {
		const data = req.proform_invoice;
		if (req.data_order_type == 'shakepe_orders_data') {
			const invoice_number_seq = await database.raw(`SELECT nextval('sd_invoice_number_shakepe_order')`);
			const invoice_number = invoice_number_seq?.rows[0].nextval;

			req.content = {
				...req.content,
				invoice_number: 'INVSP' + invoice_number + '-' + getIndianFinancialYear(),
			};
		}

		const customTemplatePath = path.resolve(env.EXTENSIONS_PATH, 'templates', req.template + '.liquid');
		const liquidEngine = new Liquid({
			root: [path.resolve(env.EXTENSIONS_PATH, 'templates'), path.resolve(__dirname, 'templates')],
			extname: '.liquid',
		});
		const templateString = await fse.readFile(customTemplatePath, 'utf8');
		const html = await liquidEngine.parseAndRender(templateString, req.content);

		req.html = html;
		// eslint-disable-next-line no-constant-condition

		const type =
			req.data_order_type == 'shakepe_orders_data' ? config.collections.shakepe_orders : 'performing_invoice';

		if (data[0]?.html != html) {
			if (req.data_order_type == 'shakepe_orders_data') {
				updateOne(
					{
						version: data[0]?.version ? parseInt(data[0].version) + 1 : 1,
						html: html,
						invoice_number: req.content.invoice_number,
					},
					// eslint-disable-next-line no-constant-condition
					type,
					services,
					req.params.id,
					schema,
					{
						admin: true,
					}
				);
			} else {
				updateOne(
					{
						version: data[0]?.version ? parseInt(data[0].version) + 1 : 1,
						html: html,
					},
					// eslint-disable-next-line no-constant-condition
					type,
					services,
					req.params.id,
					schema,
					{
						admin: true,
					}
				);
			}

			next();
		} else {
			res.status(200).send({ status: 'pdf-already_generated' });
		}
	} catch (error) {
		res.status(200).send({ error: error });

		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};

export const pdfCreation = async (req: any, res: any, next: any, services: any, schema: any) => {
	try {
		const data = await axios.post('https://sdpdf.shakedeal.com/html-pdf', {
			security_key: '6f34f84465f9a02',
			html_data: Buffer.from(req.html).toString('base64'),
		});

		const { FilesService } = services;
		const service = new FilesService({
			accountability: {
				admin: true,
			},
			schema: schema,
		});
		const disk: string = toArray(env['STORAGE_LOCATIONS'])[0];
		const primaryKey = await service.uploadOne(
			bufferToStream(Buffer.from(data.data.pdf_data, 'base64')),
			{
				type: 'application/pdf',
				storage: disk,
				filename_download: req.pdfName + '.pdf',
				title: req.pdfName,
			},
			undefined
		);
		req.primaryKey = primaryKey;

		createOne(
			services,
			'performing_invoice_files',
			{
				directus_files_id: primaryKey,
				performing_invoice_id: req.params.id,
			},
			schema,
			{
				admin: true,
			}
		);

		res.status(201).send({ status: 'success' });
	} catch (error) {
		res.status(200).send({ error: error });

		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};

export const pdfCreationShakePe = async (req: any, res: any, next: any, services: any, schema: any) => {
	try {
		const data = await axios.post('https://sdpdf.shakedeal.com/html-pdf', {
			security_key: '6f34f84465f9a02',
			html_data: Buffer.from(req.html).toString('base64'),
		});

		const { FilesService } = services;
		const service = new FilesService({
			accountability: {
				admin: true,
			},
			schema: schema,
		});
		const disk: string = toArray(env['STORAGE_LOCATIONS'])[0];
		const primaryKey = await service.uploadOne(
			bufferToStream(Buffer.from(data.data.pdf_data, 'base64')),
			{
				type: 'application/pdf',
				storage: disk,
				filename_download: req.pdfName + '.pdf',
				title: req.pdfName,
			},
			undefined
		);
		req.primaryKey = primaryKey;

		createOne(
			services,
			'shakepe_orders_files_2',
			{
				directus_files_id: primaryKey,
				shakepe_orders_id: req.params.id,
			},
			schema,
			{
				admin: true,
			}
		);

		res.status(201).send({ status: 'success' });
	} catch (error) {
		res.status(200).send({ error: error });

		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};

function bufferToStream(buffer: any) {
	const readableInstanceStream = new Readable({
		read() {
			this.push(buffer);
			this.push(null);
		},
	});
	return readableInstanceStream;
}
function convertToRupeeWords(amount: any) {
	try {
		const rupees = Math.floor(amount);
		const paise = Math.round((amount - rupees) * 100);

		let rupeesInWords = '';
		let paiseInWords = '';
		let result = '';

		// Convert rupees to words
		if (rupees > 0) {
			rupeesInWords = numWords(rupees);
			rupeesInWords = `${rupeesInWords.charAt(0).toUpperCase()}${rupeesInWords.slice(1)} Rupee${
				rupees === 1 ? '' : 's'
			}`;
		}

		// Convert paise to words
		if (paise > 0) {
			paiseInWords = numWords(paise);
			paiseInWords = `${paiseInWords.charAt(0).toUpperCase()}${paiseInWords.slice(1)} Paise${paise === 1 ? '' : 's'}`;
		}

		// Combine rupees and paise
		if (rupees > 0 && paise > 0) {
			result = `${rupeesInWords} AND ${paiseInWords} ONLY`;
		} else if (rupees > 0) {
			result = `${rupeesInWords} ONLY`;
		} else {
			result = `${paiseInWords} ONLY`;
		}

		return result;
	} catch (error) {
		return '';
	}
}

export const getShakeOrder = async (req: any, res: any, next: any, services: any) => {
	try {
		const filter = {
			id: {
				_eq: req.params.id,
			},
		};
		const fields = config.fields.vendor_payment;
		const data = await getDataFromCollection(services, filter, fields, req, config.collections.vendor_payment);

		req.shakepe_order = data;
		next();
	} catch (error) {
		errorLoggingPost(services, { collection: config.fields.shakepe_orders, error: error }, req);
	}
};

export const dynamicContentPO = (req: any, res: any, next: any, services: any) => {
	try {
		const data = req.shakepe_order;

		const tableContact = data[0].po_details.map((po_detail: any, index: any) => {
			return `
			<tr>
				<td>${index + 1}</td>
				<td>${index}</td>
				<td>${po_detail.brand_vendor_mapping_id.sku}</td>
				<td>${convertToIndianRupees(po_detail.voucher_order_id.denomination)}</td>
				<td>${po_detail.quantity}</td>
				<td>${po_detail.vendor_discount} %</td>
				<td> ${convertToIndianRupees(po_detail.po_value)} <td>
			</tr>`;
		});
		const content = {
			TABLE_CONTENT: tableContact,
			PHONENUMBER: 7708085423,
			CONTACTPERSON: data[0].vendor.entity_name,
			GSTIN: data[0].vendor.gstin,
			ADDRESS: data[0].vendor.address,
			ENITYNAME: data[0].vendor.entity_name,
			DATEOFCREATION: formatDate(new Date()),
			PO: data[0].id,
			SPCONTACTPERSON: '',
			SPPHONENUMBER: '',
		};
		req.content = content;
		req.pdfName = 'PI' + data[0].id + '_SHAKEPE ';
		req.template = 'po-template';
		next();
	} catch (error) {
		res.status(200).send({ error: error });
	}
};

function getIndianFinancialYear() {
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1; // getMonth() is zero-based

	let startYear;
	let endYear;

	if (month >= 4) {
		startYear = year;
		endYear = year + 1;
	} else {
		startYear = year - 1;
		endYear = year;
	}

	return `${startYear}-${endYear.toString().slice(-2)}`;
}

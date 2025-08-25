<template>
	<div v-html="data"></div>
</template>

<script setup lang="ts">
import { watch, ref, inject } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const props = withDefaults(
	defineProps<{
		value: string[];
		template: string;
		values: any;
		defaultValue: string;
		field: string;
		apidata: object;
		deletion: object[];
	}>(),
	{
		value: () => [],
		template: '',
		values: {},
		field: 'id',
		defaultValue: '',
		apidata: () => [],
		deletion: () => [],
	}
);
const { value } = ref(props);
const emit = defineEmits(['input']);
const data = ref(value.value);
const values: any = inject('values');
const api = useApi();
const preValue = ref(null);
watch(
	() => values.value,
	async () => {
		try {
			const coins =
				values.value.type_of_transfer == 7
					? values.value.points_coins
					: values.value.type_of_transfer == 8
					? values.value.codes_coins
					: values.value.links_coins;
			if (values.value.amount <= coins) {
				const client: any = await api.get('/items/client', {
					params: {
						filter: {
							_and: [
								{
									id: { _eq: values.value.client },
								},
								{
									product_type_mapping: {
										product_type: {
											_eq: values.value.type_of_transfer,
										},
									},
								},
							],
						},
						fields: ['wallet', 'product_type_mapping.product_type', 'product_type_mapping.discount'],
					},
				});
				const findProductTypeDiscount = client.data.data[0].product_type_mapping.find(
					(prod: any) => prod.product_type == values.value.type_of_transfer
				);

				const orders = await api.get('/items/shakepe_orders', {
					params: {
						filter: {
							_and: [
								{
									client: {
										_eq: values.value.client,
									},
								},
								{
									poc: {
										_eq: values.value.poc,
									},
								},
								{
									status: {
										_in: ['Order Completed', 'Order Processed'],
									},
								},
								{
									product_type: {
										product_type: {
											_eq: values.value.type_of_transfer,
										},
									},
								},
								{
									campiagn: {
										_null: true,
									},
								},
								{
									consume_status: {
										_in: ['not_consumed', 'partially_consumed'],
									},
								},
							],
						},
						fields: [
							'id',
							'total_order_value',
							'consume_status',
							'consumed_amount',
							'date_created',
							'discount',
							'add_or_reduce_discount',
							'order_level_discount',
						],
					},
				});
				const consume = consumeAmount(orders.data.data, values.value.amount, findProductTypeDiscount.discount);
				data.value = `<html lang="en">
								<head>
									<meta charset="UTF-8" />
									<meta name="viewport" content="width=device-width, initial-scale=1.0" />
									
								</head>
								<body>
									<table class="poc-fund-table">
										<thead>
											<tr>
												<th class="poc-head-tag">Order ID</th>
												<th class="poc-head-tag">Applicable  Credits</th>
												<th class="poc-head-tag">Discount</th>
												<th class="poc-head-tag">Credit to Wallet</th>
												<th class="poc-head-tag">Conversion </th>

											</tr>
										</thead>
										<tbody>
											 ${
													consume.updatedRecords.length > 0
														? consume.updatedRecords.map((table: any) => {
																return `<tr>
																			<td class="poc-data-tag">SP${table.id} </td>
																			<td class="poc-data-tag">${table.consumeNow} </td>
																			<td class="poc-data-tag">${table.add_or_reduce_discount ? table.order_level_discount : table.discount}% </td>
																			<td class="poc-data-tag"> ₹${table.return_amount} </td>
																			<td class="poc-data-tag">${
																				values.value.type_of_transfer == 7
																					? 'Points to Wallet'
																					: values.value.type_of_transfer == 8
																					? 'Codes to Wallet'
																					: 'Links to Wallet'
																			} </td>


																		</tr>`;
														  })
														: ''
												}
												${
													consume.remainingBalance != 0
														? `<tr>
																			<td class="poc-data-tag">Product Level </td>
																			<td class="poc-data-tag"> ${
																				values.value.amount -
																				consume.updatedRecords.reduce(
																					(total: any, record: any) => total + record.consumeNow,
																					0
																				)
																			}  </td>
																			<td class="poc-data-tag"> ${findProductTypeDiscount.discount}%</td>
																			<td class="poc-data-tag"> ₹${
																				consume.remainingBalance -
																				(consume.remainingBalance * findProductTypeDiscount.discount) / 100
																			} </td>
																			<td class="poc-data-tag">${values.value.type_of_transfer == 7 ? 'Points to Wallet' : ''} </td>
																		</tr>`
														: ''
												}
														<tr>
														  	<td class="poc-data-tag"> Total Debit  Credits : </td>
															<td class="poc-data-tag">  ${values.value.amount} </td>
															<td class="poc-data-tag"> Total Value to POC Wallet :  </td>
															<td class="poc-data-tag">  ₹${consume.totalValue} </td>
															<td class="poc-data-tag"> </td>
														<tr>
										</tbody>
									</table>
								</body>
				
								</html>`;
				preValue.value != data.value ? emit('input', data.value) : '';
			} else if (values.value.amount > coins) {
				data.value = '<div> InSuffient Balance </div>';
			} else {
				data.value = null;
			}
		} catch (error) {}
	}
);

function consumeAmount(records: any, requestedAmount: any, productDiscount: any) {
	const availableAmount: any = records.reduce(
		(sum: any, record: any) => sum + (record.total_order_value - parseFloat(record.consumed_amount)),
		0
	);
	let amountToConsume = Math.min(availableAmount, requestedAmount);
	const remainingBalance: any = requestedAmount - availableAmount > 0 ? requestedAmount - availableAmount : 0;
	let totalValue = 0;
	for (const record of records) {
		if (amountToConsume <= 0) break;

		const remaining: any = record.total_order_value - parseFloat(record.consumed_amount);
		const consumeNow: any = Math.min(remaining, amountToConsume);

		record.consumed_amount = (parseFloat(record.consumed_amount) + consumeNow).toFixed(2);
		record.consumeNow = consumeNow;
		record.return_amount =
			consumeNow -
			(record?.order_level_discount
				? (consumeNow * record?.order_level_discount) / 100
				: (consumeNow * record?.discount) / 100);
		totalValue = totalValue + record.return_amount;
		record.consume_status =
			record.total_order_value === parseFloat(record.consumed_amount) ? 'consumed' : 'partially_consumed';
		delete record.total_order_value;
		delete record.date_created;
		amountToConsume -= consumeNow;
	}

	return {
		updatedRecords: records,
		remainingBalance,
		totalValue: totalValue + remainingBalance - (remainingBalance * productDiscount) / 100,
	};
}
</script>

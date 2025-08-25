<template>
	<interface-select-multiple-dropdown
		:disabled="disabled"
		:allow-other="allowOther"
		:allow-none="allowNone"
		:choices="dataChoices"
		:value="value"
		:collection="collection"
		:icon="icon"
		:placeholder="placeholder"
		:preview-threshold="previewThreshold"
		@input="updateValue($event)"
	></interface-select-multiple-dropdown>
</template>

<script lang="ts">
import { useI18n } from 'vue-i18n';
import { defineComponent, inject, PropType, toRef, watch } from 'vue';
import storeCustomForGift from './store';
import { useApi } from '@directus/extensions-sdk';
import config from './config.json'


type Option = {
	text: string;
	value: string | number | boolean;
};

export default defineComponent({
	props: {
		disabled: {
			type: Boolean,
			default: false,
		},
		baseForm: {
			type: Boolean,
			default: false,
		},
		value: {
			type: Array as PropType<string[]>,
			default: null,
		},
		collection: {
			type: String,
			default: '',
		},
		choices: {
			type: Array as PropType<Option[]>,
			default: null,
		},
		icon: {
			type: String,
			default: null,
		},
		allowNone: {
			type: Boolean,
			default: false,
		},
		placeholder: {
			type: String,
			default: null,
		},
		allowOther: {
			type: Boolean,
			default: false,
		},
		previewThreshold: {
			type: Number,
			default: 3,
		},
	},
	emits: ['input'],
	setup(props, { emit }) {
		const values = inject('values');

		const { t } = useI18n();
		const storeGiftCard = storeCustomForGift.storeCustomForGift();
		const dataChoices = toRef([]);
		const api = useApi();
		!props.baseForm ? storeGiftCard.getData(values.value, dataChoices) : '';
		watch(
			() => [values.value?.denomination, values.value?.brands?.create],
			() => {
				if (props.baseForm) {
					const client_id = values?.value?.brands?.create.map(
						(e: any) => e.client_product_mapping_sd_brand_details_1_id.id
					);
					const filterBrands = {
						params: {
							filter: {
								_and: [
									{
										id: {
											_in: client_id,
										},
									},
								],
							},
							fields: config.fields.sp_brand,
						},
					};
					api.get(config.url.sp_brand, filterBrands).then((res: any) => {
						const data = res.data.data.map((brands: any) => {
							return {
								denomination: values?.value?.denomination,

								brand: brands.id,
								choices: brands.sd_brand_details_id.sku?.map((amount: any) => {
									return {
										text: amount.amount,
										value: amount.amount,
									};
								}),
							};
						});
						storeGiftCard.setData(data);
					});
				} 
			}
		);

		return { t, updateValue, dataChoices, storeGiftCard };
		function updateValue(value: PropType<string[]>) {
			emit('input', value);
		}
	},
});
</script>

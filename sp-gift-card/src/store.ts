import { defineStore } from 'pinia';

const storeCustomForGift = defineStore({
	id: 'storeCustomForGift',
	state: () => ({
		dynamicFilters: [] as any,
	}),
	getters: {},
	actions: {
		async setData(value: any) {
			const data = value.map((brand: any) => {
				return {
					...brand,
					choices: brand.choices.filter((choices: any) => choices.value <= brand.denomination),
				};
			});
			this.dynamicFilters = data;
		},
		getData(brandid: any, newValue: any) {
			const value = this.dynamicFilters?.find(
				(brand: any) => brand.brand == brandid?.client_product_mapping_sd_brand_details_1_id?.id
			);

			newValue.value = value ? value.choices : [];
		},
	},
});

export default { storeCustomForGift };

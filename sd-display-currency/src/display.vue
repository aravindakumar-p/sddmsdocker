<template>
	<template v-if="wallet_type == undefined || wallet_type.includes(`wallet`)">
		<span v-if="currency == 'inr'">
			₹{{ parseFloat(value).toLocaleString(currencyFormat(), { minimumFractionDigits: 2 }) }}
		</span>
		<span v-else-if="currency == 'usd'">
			${{ parseFloat(value).toLocaleString(currencyFormat(), { minimumFractionDigits: 2 }) }}
		</span>
	</template>
	<template v-else>&#8353; {{ parseInt(value) }}</template>
</template>

<script>
export default {
	props: {
		value: {
			type: [String, Number],
			default: null,
		},
		currency: {
			type: String,
			default: null,
		},
		item: {
			type: Object,
			default: null,
		},
	},
	setup(props) {
		return {
			wallet_type: props.item.wallet_type,
		};
	},
	methods: {
		currencyFormat() {
			if (this.currency == 'inr') {
				return 'en-IN';
			} else return 'en';
		},
	},
};
</script>

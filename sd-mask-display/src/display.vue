<template>
	<div>{{maskValue()}}</div>
</template>

<script>
export default {
	props: {
		value: {
			type: String,
			default: null,
		},
	},
	methods:{
		maskValue(){
			return ('' + this.value).slice(0, -4).replace(/./g, "X") + ('' + this.value).slice(-4);
		}

	}
};
</script>
